// app/api/pos-ventas/venta/[id]/anular/route.js
//
// ANULAR UNA VENTA. Marca la venta como anulada, revierte el stock, revierte la
// cuenta corriente y los puntos, y cancela el remito vinculado. Todo en una
// transacción: o pasa todo o no pasa nada.
//
// ── SE APOYA EN EL MOTOR QUE YA EXISTE ──────────────────────────────────────
//
// No se escribió un motor nuevo. Las tres piezas que mueven algo son las mismas
// que usa la corrección completa —`aplicarDeltaStock`, `ajustarCuentaCorriente`,
// `ajustarPuntosCorreccion`— llamadas con "el después es nada": stock que vuelve
// entero, cuenta corriente sin débito nuevo, puntos sin crédito nuevo. Anular es
// el caso extremo de corregir, no otra operación.
//
// Y la cancelación del remito usa `reversionStockOrigen`, la inversa simétrica
// que ya vive en `politicasStock.js`. Un cuarto lugar que devuelva stock sería
// un cuarto lugar que puede divergir.
//
// ── LOS PAGOS NO SE BORRAN ──────────────────────────────────────────────────
//
// La venta anulada conserva sus `VentaPago`. No hacen falta borrar porque la
// venta entera deja de contar: el arqueo lee ventas y el filtro la excluye.
// Borrarlos perdería el rastro de cómo se había cobrado, que es justamente lo
// que alguien va a querer mirar después.
//
// ── QUÉ PASA CON EL ARQUEO ──────────────────────────────────────────────────
//
// Si la venta contaba para el arqueo, el esperado del turno donde cae la
// anulación BAJA por el total cobrado. Si era interna —tenía remito— no contaba,
// y el esperado no se mueve. La respuesta devuelve ese número calculado para que
// la pantalla lo pueda decir ANTES de confirmar; ver `impactoEnArqueo`.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { WHERE_TURNO_OPERATIVO } from "@/lib/caja/cierreRelevo";
import { toUnidades } from "@/lib/conversiones/stock";
import {
  reversionStockOrigen,
  politicaDeLaTransferencia,
} from "@/lib/transferencias/politicasStock";
import {
  aplicarDeltaStock,
  ajustarCuentaCorriente,
  ajustarPuntosCorreccion,
} from "@/lib/pos-ventas/correccionCompletaServer";
import {
  puedeAnular,
  impactoEnArqueo,
  CODIGOS_ANULAR,
} from "@/lib/pos-ventas/anularVenta";

const j = (body, status = 200) => NextResponse.json(body, { status });

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
  turno: { select: { id: true, cierre: true } },
  pagos: { select: { medio: true, monto: true } },
  detalles: {
    select: {
      id: true,
      nombre: true,
      productoLocalId: true,
      cantidadStock: true,
      componentes: { select: { productoLocalId: true, cantidad: true } },
    },
  },
  transferencia: {
    select: {
      id: true,
      estado: true,
      origenId: true,
      ventaId: true,
      detalle: {
        select: {
          cantidad: true,
          recibido: true,
          unidadEnviada: true,
          producto: { select: { base: { select: { id: true, nombre: true, factor_pack: true } } } },
        },
      },
    },
  },
};

/**
 * Lo que hay que devolverle al stock: todo lo que la venta consumió.
 *
 * Una línea consume por sus COMPONENTES si es un combo, y por sí misma si no.
 * `cantidadStock` es la cantidad en escala física; `null` marca una línea que no
 * mueve stock (un servicio), y ésas no aportan nada.
 */
function deltaDeDevolucion(detalles = []) {
  const porProducto = new Map();
  const sumar = (productoLocalId, cantidad) => {
    if (!productoLocalId) return;
    const c = Number(cantidad);
    if (!Number.isFinite(c) || c === 0) return;
    porProducto.set(productoLocalId, (porProducto.get(productoLocalId) || 0) + c);
  };

  for (const d of detalles) {
    const comps = d.componentes || [];
    if (comps.length > 0) {
      for (const c of comps) sumar(c.productoLocalId, c.cantidad);
      continue;
    }
    sumar(d.productoLocalId, d.cantidadStock);
  }

  // `delta` es lo que se SUMA al stock: devolver lo consumido es positivo.
  return [...porProducto.entries()].map(([productoLocalId, cantidad]) => ({
    productoLocalId,
    delta: cantidad,
  }));
}

/** El turno operativo del local ahora mismo, o null. */
async function turnoAbiertoDe(db, localId) {
  return db.turno.findFirst({
    where: { localId, ...WHERE_TURNO_OPERATIVO },
    select: { id: true },
    orderBy: { apertura: "desc" },
  });
}

// ── GET: el PREVIEW ─────────────────────────────────────────────────────────
//
// La pantalla pregunta antes de mostrar el botón: si se puede, y qué va a pasar
// con el arqueo. Sin esto el cajero se entera del salto al cerrar la caja.
export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return j({ ok: false, error: "No autenticado" }, 401);

    const perm = checkPerm(session, "ventas.corregir_completa");
    if (!perm.ok) return j({ ok: false, error: perm.error }, perm.status);

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId) return j({ ok: false, error: "ID de venta inválido" }, 400);

    const venta = await prisma.venta.findUnique({ where: { id: ventaId }, select: SELECT_VENTA });
    if (!venta) return j({ ok: false, error: "No se encontró la venta." }, 404);

    const turnoAbierto = await turnoAbiertoDe(prisma, venta.localId);
    const puedeTurnoCerrado =
      !!session.esAdmin || checkPerm(session, "ventas.corregir_turno_cerrado").ok;

    // Se evalúa con un motivo válido de mentira: el preview contesta si la venta
    // es anulable, no si el operador ya escribió el motivo.
    const veredicto = puedeAnular({
      venta,
      turnoAbierto,
      motivo: "preview de anulacion",
      puedeTurnoCerrado,
    });

    return j({
      ok: true,
      anulable: veredicto.puede,
      codigo: veredicto.codigo,
      motivoBloqueo: veredicto.puede ? null : veredicto.error,
      yaAnulada: venta.anuladaEn != null,
      turnoOriginalCerrado: veredicto.puede ? veredicto.turnoOriginalCerrado : null,
      turnoDestinoId: veredicto.puede ? veredicto.turnoDestinoId : null,
      transferencia: venta.transferencia
        ? { id: venta.transferencia.id, estado: venta.transferencia.estado }
        : null,
      arqueo: impactoEnArqueo(venta),
    });
  } catch (err) {
    console.error("ERROR en preview de anulación:", err);
    return j({ ok: false, error: `No se pudo evaluar la anulación: ${err.message}` }, 500);
  }
}

// ── POST: anular ────────────────────────────────────────────────────────────

export async function POST(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return j({ ok: false, error: "No autenticado" }, 401);

    const perm = checkPerm(session, "ventas.corregir_completa");
    if (!perm.ok) return j({ ok: false, error: perm.error }, perm.status);

    const { id } = await params;
    const ventaId = Number(id);
    if (!ventaId) return j({ ok: false, error: "ID de venta inválido" }, 400);

    const body = await req.json().catch(() => ({}));
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    const expectedVersion = Number(body?.version);

    const venta = await prisma.venta.findUnique({ where: { id: ventaId }, select: SELECT_VENTA });
    if (!venta) return j({ ok: false, error: "No se encontró la venta." }, 404);

    const turnoAbierto = await turnoAbiertoDe(prisma, venta.localId);
    const puedeTurnoCerrado =
      !!session.esAdmin || checkPerm(session, "ventas.corregir_turno_cerrado").ok;

    const veredicto = puedeAnular({ venta, turnoAbierto, motivo, puedeTurnoCerrado });
    if (!veredicto.puede) {
      const status =
        veredicto.codigo === CODIGOS_ANULAR.VENTA_AUSENTE
          ? 404
          : veredicto.codigo === CODIGOS_ANULAR.MOTIVO_AUSENTE
          ? 400
          : veredicto.codigo === CODIGOS_ANULAR.SIN_PERMISO_TURNO_CERRADO
          ? 403
          : 409;
      return j({ ok: false, error: veredicto.error, code: veredicto.codigo }, status);
    }

    const grupoId = await getGrupoIdDeLocal(venta.localId);
    const arqueo = impactoEnArqueo(venta);

    const resultado = await prisma.$transaction(async (tx) => {
      // ── 1 · La transferencia, si la hay ────────────────────────────────────
      //
      // Va PRIMERO y con barrera atómica: es lo único que otro proceso puede
      // estar tocando en este instante (el destino recibiendo). Si perdimos la
      // carrera, se corta acá y no se tocó nada más.
      let transferenciaCancelada = null;
      const t = venta.transferencia;
      if (t) {
        const lock = await tx.transferencia.updateMany({
          where: { id: t.id, estado: "Enviada" },
          data: { estado: "Cancelando" },
        });
        if (lock.count === 0) throw new Error("TRANSFERENCIA_YA_PROCESADA");

        const politica = politicaDeLaTransferencia(t);
        for (const d of t.detalle) {
          const enviada = Number(d.cantidad || 0);
          if (enviada <= 0) continue;
          const unidades = toUnidades({
            cantidad: enviada,
            unidad: d.unidadEnviada || "BULTO",
            factorPack: Number(d.producto?.base?.factor_pack || 1),
          });
          if (unidades <= 0) continue;

          // El detalle apunta al ProductoLocal del DESTINO; el del origen se
          // resuelve por baseId, igual que en las otras superficies.
          const productoOrigen = await tx.productoLocal.findUnique({
            where: { localId_baseId: { localId: t.origenId, baseId: d.producto.base.id } },
            select: { id: true },
          });
          if (!productoOrigen) continue;

          // SOLO_TRANSITO baja el tránsito y NO devuelve la cantidad: de eso se
          // encarga la devolución de la venta, más abajo. Si acá se devolviera
          // también, el depósito recuperaría la mercadería DOS veces.
          const { update } = reversionStockOrigen(politica, unidades);
          await tx.stockLocal.updateMany({
            where: { localId: t.origenId, productoId: productoOrigen.id },
            data: update,
          });
        }

        await tx.transferencia.update({ where: { id: t.id }, data: { estado: "Cancelada" } });
        transferenciaCancelada = t.id;
      }

      // ── 2 · El stock de la venta ───────────────────────────────────────────
      const delta = deltaDeDevolucion(venta.detalles);
      await aplicarDeltaStock(tx, venta.localId, delta);

      // ── 3 · Marcar la venta ────────────────────────────────────────────────
      //
      // Con bloqueo optimista: si otra corrección movió la versión mientras
      // tanto, se cae todo, incluida la cancelación del remito.
      const versionBase = Number.isFinite(expectedVersion) ? expectedVersion : venta.version;
      const upd = await tx.venta.updateMany({
        where: { id: venta.id, version: versionBase, anuladaEn: null },
        data: {
          anuladaEn: new Date(),
          anuladaPorId: session.id ?? null,
          motivoAnulacion: motivo,
          version: { increment: 1 },
        },
      });
      if (upd.count === 0) throw new Error("VERSION_DESACTUALIZADA");

      // ── 4 · El rastro ──────────────────────────────────────────────────────
      const correccion = await tx.ventaCorreccion.create({
        data: {
          ventaId: venta.id,
          tipo: "ANULACION",
          motivo,
          usuarioId: session.id ?? null,
          operadorId: venta.operadorId ?? null,
          localId: venta.localId,
          grupoId: grupoId ?? null,
          turnoIdOriginal: veredicto.turnoOriginalId,
          // ACÁ cae la diferencia: el turno abierto AHORA, que puede no ser el
          // original. Es lo que permite anular una venta de un turno cerrado sin
          // tocar un arqueo ya contado.
          turnoIdCorreccion: veredicto.turnoDestinoId,
          turnoCerrado: veredicto.turnoOriginalCerrado,
          versionAntes: versionBase,
          versionDespues: versionBase + 1,
          totalAnterior: venta.total,
          totalNuevo: 0,
          diferencia: Number(venta.total) * -1,
          snapshotAntes: {
            total: String(venta.total),
            clienteId: venta.clienteId,
            esFiado: venta.esFiado,
            pagos: venta.pagos.map((p) => ({ medio: p.medio, monto: String(p.monto) })),
            transferenciaId: t?.id ?? null,
          },
          snapshotDespues: { anulada: true, motivo },
          diffProductos: venta.detalles.map((d) => ({
            nombre: d.nombre,
            productoLocalId: d.productoLocalId,
            cantidadAntes: d.cantidadStock,
            cantidadDespues: 0,
          })),
          diffPagos: venta.pagos.map((p) => ({
            medio: p.medio,
            montoAntes: String(p.monto),
            montoDespues: "0",
          })),
          impactoStock: delta,
          impactoCaja: arqueo,
        },
      });

      // ── 5 · Cuenta corriente y puntos ──────────────────────────────────────
      //
      // Las mismas funciones de la corrección completa, con "el después es
      // nada": solo emiten la reversa. Van DESPUÉS del registro porque las dos
      // necesitan su id para poder distinguir sus movimientos.
      const movimientosCC = await ajustarCuentaCorriente(tx, {
        correccionId: correccion.id,
        grupoId,
        localId: venta.localId,
        ventaId: venta.id,
        numero: venta.numero,
        userId: session.id ?? null,
        esFiadoAntes: venta.esFiado === true,
        esFiadoDespues: false,
        clienteAntes: venta.clienteId,
        clienteDespues: null,
        totalAnterior: venta.total,
        totalNuevo: 0,
      });

      const puntos = await ajustarPuntosCorreccion(tx, {
        correccionId: correccion.id,
        grupoId,
        localId: venta.localId,
        ventaId: venta.id,
        numero: venta.numero,
        userId: session.id ?? null,
        clienteAntes: venta.clienteId,
        clienteDespues: null,
        puntosOriginal: null,
        puntosNuevo: 0,
      });

      return {
        correccionId: correccion.id,
        transferenciaCancelada,
        productosDevueltos: delta.length,
        movimientosCuenta: movimientosCC.length,
        movimientosPuntos: (puntos?.movimientos || []).length,
      };
    });

    return j({ ok: true, ...resultado, arqueo, turnoDestinoId: veredicto.turnoDestinoId });
  } catch (err) {
    if (err.message === "TRANSFERENCIA_YA_PROCESADA") {
      return j(
        {
          ok: false,
          error: "Alguien tocó el remito de esta venta mientras la anulábamos. Volvé a cargar la pantalla.",
          code: "TRANSFERENCIA_YA_PROCESADA",
        },
        409
      );
    }
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
    console.error("ERROR anulando venta:", err);
    return j({ ok: false, error: `No se pudo anular la venta: ${err.message}`, code: "ANULAR_FALLO" }, 500);
  }
}
