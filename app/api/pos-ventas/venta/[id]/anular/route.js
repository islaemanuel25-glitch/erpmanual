// app/api/pos-ventas/venta/[id]/anular/route.js
//
// ANULAR UNA VENTA COMÚN DEL MOSTRADOR. Marca la venta como anulada, devuelve al
// stock del local lo que la venta descontó, revierte la cuenta corriente y los
// puntos, refleja la anulación en el cierre de su turno si ya estaba cerrado, y
// deja el rastro. Todo en una transacción.
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
// así que el esperado de su turno BAJA por lo cobrado en efectivo. Con el turno
// abierto eso es todo: el cierre todavía no existe.
//
// Con el turno CERRADO (decisión de Emanuel del 2026-10-10, que reemplaza la del
// 20/8): el cierre ya quedó grabado, y el ajuste va a ESE cierre —el del turno de
// la venta, nunca otro—. Su esperado baja y su diferencia se recalcula contra lo
// que el operador contó, que no se toca. Lo arma `ajusteDelCierrePorAnulacion`
// con el turno bloqueado, lo escribe el motor, y el registro de la anulación
// guarda el antes y el después. Hace falta `ventas.corregir_turno_cerrado`, y lo
// pregunta esta ruta, no solo la pantalla.
//
// El GET devuelve todos esos números para que la pantalla los diga ANTES de
// confirmar.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { bloquearTurno } from "@/lib/caja/cierreRelevoServer";
import { ESTADO_CIERRE } from "@/lib/caja/cierreRelevo";
import {
  revertirVenta,
  impactoEnArqueo,
  veredictoAnulacionVentaComun,
  validarMotivoAnulacion,
  ajusteDelCierrePorAnulacion,
  CODIGOS_ANULAR,
} from "@/lib/pos-ventas/reversionVenta";

const j = (body, status = 200) => NextResponse.json(body, { status });

const PERMISO = "ventas.corregir_completa";
const PERMISO_TURNO_CERRADO = "ventas.corregir_turno_cerrado";

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
  // Los campos que lee `estadoDelTurno`, más el cierre grabado del turno.
  turno: {
    select: {
      id: true,
      cierre: true,
      cierreEnPreparacionEn: true,
      anuladoEn: true,
      montoEsperadoEfectivo: true,
      montoRealEfectivo: true,
      diferenciaEfectivo: true,
      totalVentasEfectivo: true,
      totalVentasDigital: true,
      cantidadVentas: true,
    },
  },
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
  const puedeTurnoCerrado = checkPerm(session, PERMISO_TURNO_CERRADO).ok;
  return { session, ventaId, venta, puedeTurnoCerrado };
}

/**
 * El ajuste del cierre del turno ORIGINAL de la venta, leído de la base. Las
 * filas son siempre las del `venta.turnoId`: no hay otro turno que buscar.
 */
async function ajusteDelCierre(db, venta) {
  const [corte, arqueoFinal] = await Promise.all([
    db.cierrePreparacion.findFirst({
      where: { turnoId: venta.turnoId, estado: ESTADO_CIERRE.CONFIRMADO },
      orderBy: { id: "desc" },
      select: {
        id: true, turnoId: true, estado: true, efectivoEsperadoCorte: true, totalCambio: true,
        efectivoRetiradoEsperado: true, totalRetiroContado: true, totalContado: true,
        diferencia: true, cantidadVentasCorte: true,
      },
    }),
    db.arqueoCaja.findFirst({
      where: { turnoId: venta.turnoId, tipo: "FINAL" },
      orderBy: { fechaHora: "desc" },
      select: { id: true, turnoId: true, tipo: true, efectivoEsperado: true, efectivoContado: true, diferencia: true },
    }),
  ]);
  return ajusteDelCierrePorAnulacion({ venta, turno: venta.turno, corte, arqueoFinal });
}

// ── GET: el PREVIEW ─────────────────────────────────────────────────────────
//
// El panel pregunta al abrirse si se puede y qué va a pasar con el arqueo. Sin
// esto el cajero se entera del salto al cerrar la caja — o, con el turno
// cerrado, nadie se entera de cómo quedó su diferencia.
export async function GET(req, { params }) {
  try {
    const r = await cargar(prisma, req, params);
    if (r.error) return r.error;
    const { venta, puedeTurnoCerrado } = r;

    const veredicto = veredictoAnulacionVentaComun(venta, { puedeTurnoCerrado });
    let cierreDelTurnoOriginal = null;
    if (veredicto.puede && veredicto.turnoCerrado) {
      const ajuste = await ajusteDelCierre(prisma, venta);
      if (!ajuste.ok) {
        return j({ ok: true, anulable: false, codigo: CODIGOS_ANULAR.CIERRE_NO_COINCIDE, motivoBloqueo: ajuste.error });
      }
      cierreDelTurnoOriginal = { turnoId: ajuste.turnoId, efectivoAnulado: ajuste.efectivoAnulado, ...ajuste.cierre };
    }
    return j({
      ok: true,
      anulable: veredicto.puede,
      codigo: veredicto.codigo,
      motivoBloqueo: veredicto.puede ? null : veredicto.error,
      numero: venta.numero,
      turnoOriginalCerrado: veredicto.puede ? veredicto.turnoCerrado : null,
      arqueo: impactoEnArqueo(venta),
      cierreDelTurnoOriginal,
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
  [CODIGOS_ANULAR.SIN_PERMISO_TURNO_CERRADO]: 403,
};

export async function POST(req, { params }) {
  try {
    const r = await cargar(prisma, req, params);
    if (r.error) return r.error;
    const { session, ventaId, puedeTurnoCerrado } = r;

    const body = await req.json().catch(() => ({}));
    const vm = validarMotivoAnulacion(body?.motivo);
    if (!vm.ok) return j({ ok: false, error: vm.error, code: vm.codigo }, 400);
    const versionEsperada = Number(body?.version);

    const grupoId = await getGrupoIdDeLocal(r.venta.localId);

    const resultado = await prisma.$transaction(async (tx) => {
      // El mismo candado por venta que la corrección completa: una corrección y
      // una anulación de la misma venta no pueden cruzarse.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ventaId})`;
      // Y el turno, con el mismo candado que usan el cierre y los movimientos de
      // caja: dos anulaciones del mismo turno cerrado leerían el mismo esperado y
      // la segunda pisaría a la primera.
      if (r.venta.turnoId) await bloquearTurno(tx, r.venta.turnoId);

      // Se relee y se vuelve a decidir ADENTRO: entre el preview y el toque el
      // turno pudo cerrarse, o alguien pudo anularla.
      const venta = await tx.venta.findUnique({ where: { id: ventaId }, select: SELECT_VENTA });
      const veredicto = veredictoAnulacionVentaComun(venta, { puedeTurnoCerrado });
      const falla = (codigo, error) => {
        const e = new Error(error);
        e.code = codigo;
        e.status = STATUS_POR_CODIGO[codigo] ?? 409;
        return e;
      };
      if (!veredicto.puede) throw falla(veredicto.codigo, veredicto.error);

      let ajusteCierre = null;
      if (veredicto.turnoCerrado) {
        const ajuste = await ajusteDelCierre(tx, venta);
        if (!ajuste.ok) throw falla(CODIGOS_ANULAR.CIERRE_NO_COINCIDE, ajuste.error);
        ajusteCierre = ajuste;
      }

      const reversion = await revertirVenta(tx, {
        venta,
        grupoId,
        usuarioId: session.id ?? null,
        motivo: vm.motivo,
        ajusteCierre,
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
