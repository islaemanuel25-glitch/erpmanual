// app/api/pos-ventas/venta/[id]/anular/route.js
//
// ANULAR UNA VENTA COMÚN DEL MOSTRADOR. Marca la venta como anulada, devuelve al
// stock del local lo que la venta descontó, revierte la cuenta corriente y los
// puntos, y deja el rastro. Todo en una transacción.
//
// ── DE DÓNDE VIENE ──────────────────────────────────────────────────────────
//
// Esta ruta nació el 2026-08-20 (e7d9ff40) para anular la venta interna 7726 y se
// retiró el mismo día (22e48cd8): una venta interna se anula cancelando su remito
// desde Transferencias, y eso sigue igual. El motor se conservó en
// `lib/pos-ventas/reversionVenta.js` justamente para el día que hiciera falta
// anular una venta COMÚN. Ese día fue el 2026-10-10: el POS de Mini unidas se
// tildó y registró dos tickets duplicados que no había forma de anular.
//
// ── NO HAY UN MOTOR NUEVO ───────────────────────────────────────────────────
//
// Decide `veredictoAnulacionVentaComun` —el mismo que lee el detalle para dibujar
// el botón— y revierte `revertirVenta`, el mismo que usa la cancelación de un
// remito. El stock vuelve con `aplicarDeltaStock`, la pieza de la corrección
// completa.
//
// ── QUÉ PASA CON EL ARQUEO ──────────────────────────────────────────────────
//
// La venta deja de contar porque el filtro comercial la excluye por `anuladaEn`,
// así que el esperado de su turno BAJA por lo cobrado. Solo se permite con el
// turno de la venta abierto —la regla de la corrección completa—, así que esa
// baja nunca le cae a un arqueo ya contado. El GET devuelve el número para que la
// pantalla lo diga ANTES de confirmar.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import {
  revertirVenta,
  impactoEnArqueo,
  veredictoAnulacionVentaComun,
  validarMotivoAnulacion,
  CODIGOS_ANULAR,
} from "@/lib/pos-ventas/reversionVenta";

const j = (body, status = 200) => NextResponse.json(body, { status });

const PERMISO = "ventas.corregir_completa";

/** El select completo. Se usa igual para el preview (GET) y para anular (POST). */
const SELECT_VENTA = {
  id: true,
  numero: true,
  total: true,
  esFiado: true,
  clienteId: true,
  localId: true,
  operadorId: true,
  turnoId: true,
  version: true,
  anuladaEn: true,
  // Los mismos campos que lee `estadoTurnoCorreccion` en el detalle.
  turno: { select: { id: true, cierre: true, cierreEnPreparacionEn: true, anuladoEn: true } },
  transferencia: { select: { id: true } },
  pagos: { select: { medio: true, monto: true } },
  detalles: {
    select: {
      id: true,
      nombre: true,
      esServicio: true,
      productoLocalId: true,
      cantidadStock: true,
      componentes: { select: { productoLocalId: true, cantidad: true } },
    },
  },
};

/** La venta, o una respuesta de error lista para devolver. */
async function cargar(db, req, params) {
  const session = getUsuarioSession(req);
  if (!session) return { error: j({ ok: false, error: "No autenticado" }, 401) };

  const perm = checkPerm(session, PERMISO);
  if (!perm.ok) return { error: j({ ok: false, error: perm.error }, perm.status) };

  const { id } = await params;
  const ventaId = Number(id);
  if (!Number.isInteger(ventaId) || ventaId <= 0) {
    return { error: j({ ok: false, error: "ID de venta inválido" }, 400) };
  }

  const venta = await db.venta.findUnique({ where: { id: ventaId }, select: SELECT_VENTA });
  // Lectura ajena → 404, igual que el detalle: no revela que la venta existe.
  if (!venta || (!session.esAdmin && venta.localId !== Number(session.localId))) {
    return { error: j({ ok: false, error: "No se encontró la venta.", code: CODIGOS_ANULAR.VENTA_AUSENTE }, 404) };
  }
  return { session, ventaId, venta };
}

// ── GET: el PREVIEW ─────────────────────────────────────────────────────────
//
// El panel pregunta al abrirse si se puede y qué va a pasar con el arqueo. Sin
// esto el cajero se entera del salto al cerrar la caja.
export async function GET(req, { params }) {
  try {
    const r = await cargar(prisma, req, params);
    if (r.error) return r.error;
    const { venta } = r;

    const veredicto = veredictoAnulacionVentaComun(venta);
    return j({
      ok: true,
      anulable: veredicto.puede,
      codigo: veredicto.codigo,
      motivoBloqueo: veredicto.puede ? null : veredicto.error,
      numero: venta.numero,
      arqueo: impactoEnArqueo(venta),
    });
  } catch (err) {
    console.error("ERROR en preview de anulación:", err);
    return j({ ok: false, error: `No se pudo evaluar la anulación: ${err.message}` }, 500);
  }
}

// ── POST: anular ────────────────────────────────────────────────────────────

const STATUS_POR_CODIGO = {
  [CODIGOS_ANULAR.VENTA_AUSENTE]: 404,
  [CODIGOS_ANULAR.MOTIVO_AUSENTE]: 400,
};

export async function POST(req, { params }) {
  try {
    const r = await cargar(prisma, req, params);
    if (r.error) return r.error;
    const { session, ventaId } = r;

    const body = await req.json().catch(() => ({}));
    const vm = validarMotivoAnulacion(body?.motivo);
    if (!vm.ok) return j({ ok: false, error: vm.error, code: vm.codigo }, 400);
    const versionEsperada = Number(body?.version);

    const grupoId = await getGrupoIdDeLocal(r.venta.localId);

    const resultado = await prisma.$transaction(async (tx) => {
      // El mismo candado por venta que la corrección completa: una corrección y
      // una anulación de la misma venta no pueden cruzarse.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ventaId})`;

      // Se relee y se vuelve a decidir ADENTRO: entre el preview y el toque el
      // turno pudo pasar a cierre, o alguien pudo anularla.
      const venta = await tx.venta.findUnique({ where: { id: ventaId }, select: SELECT_VENTA });
      const veredicto = veredictoAnulacionVentaComun(venta);
      if (!veredicto.puede) {
        const e = new Error(veredicto.error);
        e.code = veredicto.codigo;
        e.status = STATUS_POR_CODIGO[veredicto.codigo] ?? 409;
        throw e;
      }

      const reversion = await revertirVenta(tx, {
        venta,
        grupoId,
        usuarioId: session.id ?? null,
        motivo: vm.motivo,
        // Con turno abierto, la diferencia cae en el mismo turno de la venta.
        turnoDestinoId: veredicto.turnoId,
        turnoOriginalCerrado: false,
        versionEsperada: Number.isFinite(versionEsperada) ? versionEsperada : venta.version,
        origen: "anulacion desde el detalle de la venta",
      });
      return { ventaId: venta.id, numero: venta.numero, ...reversion };
    });

    return j({ ok: true, ...resultado });
  } catch (err) {
    if (err.message === "VERSION_DESACTUALIZADA") {
      return j(
        {
          ok: false,
          error: "La venta fue modificada por otra persona mientras tanto. Volvé a cargar la pantalla.",
          code: "VERSION_DESACTUALIZADA",
        },
        409
      );
    }
    if (err.status) return j({ ok: false, error: err.message, code: err.code }, err.status);
    console.error("ERROR anulando venta:", err);
    return j({ ok: false, error: `No se pudo anular la venta: ${err.message}`, code: "ANULAR_FALLO" }, 500);
  }
}
