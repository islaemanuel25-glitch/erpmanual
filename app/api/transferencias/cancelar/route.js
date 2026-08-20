// app/api/transferencias/cancelar/route.js
//
// CANCELAR UNA TRANSFERENCIA, con su venta si la tiene. Una transacción: o pasa
// todo o no pasa nada.
//
// ── QUÉ CAMBIÓ EL 2026-08-20, Y POR QUÉ ─────────────────────────────────────
//
// Antes esta ruta solo dejaba cancelar al ORIGEN y rechazaba de plano cualquier
// transferencia nacida de una venta. Las dos cosas eran problemas distintos:
//
// · El destino veía el botón en la pantalla y recibía un 403 acá. El local que
//   RECIBE el remito es justamente quien descubre que no le corresponde.
//
// · Una transferencia de venta no se podía cancelar por ningún lado. El bloqueo
//   era correcto para lo que la ruta hacía —devolver `cantidad` al origen habría
//   inventado mercadería que la venta sigue cobrando— pero tapaba el síntoma en
//   vez de revertir las dos cosas juntas.
//
// Ahora la reversión es completa y usa las piezas que ya existen:
// `reversionStockOrigen` para el tránsito según la política con la que el remito
// nació, y `revertirVenta` para la venta. No hay un motor nuevo.
//
// ── ERP AZUL NO BORRA LA HISTORIA ───────────────────────────────────────────
//
// Nada se elimina. La transferencia conserva su fila y sus líneas con las
// cantidades originales; queda en "Cancelada" con autor, fecha y motivo. La venta
// conserva su ticket y queda anulada, también con su rastro. Lo único que cambia
// es que dejan de contar como movimiento operativo.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { getCookieValue } from "@/lib/auth";
import { getGrupoIdDeLocal } from "@/lib/grupos";
import { toUnidades } from "@/lib/conversiones/stock";
import { WHERE_TURNO_OPERATIVO } from "@/lib/caja/cierreRelevo";
import {
  reversionStockOrigen,
  politicaDeLaTransferencia,
} from "@/lib/transferencias/politicasStock";
import {
  puedeCancelarTransferencia,
  resumenDeLaCancelacion,
  CODIGOS_CANCELAR,
} from "@/lib/transferencias/cancelarTransferencia";
import { revertirVenta } from "@/lib/pos-ventas/reversionVenta";

const j = (body, status = 200) => NextResponse.json(body, { status });

/** El select completo. Igual para el preview (GET) y para cancelar (POST). */
const SELECT_TRANSFERENCIA = {
  id: true,
  estado: true,
  origenId: true,
  destinoId: true,
  ventaId: true,
  origen: { select: { id: true, nombre: true } },
  destino: { select: { id: true, nombre: true } },
  detalle: {
    select: {
      id: true,
      cantidad: true,
      recibido: true,
      unidadEnviada: true,
      producto: {
        select: { base: { select: { id: true, nombre: true, factor_pack: true } } },
      },
    },
  },
  venta: {
    select: {
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
    },
  },
};

/** El local desde el que se opera: contexto activo primero, sesión después. */
function localDeLaSesion(req, session) {
  const raw = getCookieValue(req, "erpazul_contexto_activo");
  if (raw) {
    try {
      const ctx = Number(JSON.parse(raw).localId);
      if (ctx > 0) return ctx;
    } catch {}
  }
  return session.localId ? Number(session.localId) : null;
}

/** El turno operativo de un local, o null. */
function turnoAbiertoDe(db, localId) {
  if (!localId) return null;
  return db.turno.findFirst({
    where: { localId, ...WHERE_TURNO_OPERATIVO },
    select: { id: true },
    orderBy: { apertura: "desc" },
  });
}

// ── GET: el PREVIEW ─────────────────────────────────────────────────────────
//
// La pantalla pregunta antes de mostrar el botón: si se puede y qué va a pasar.
// Cancelar un remito manual y cancelar uno que vino de una venta cobrada hacen
// cosas muy distintas, y desde el botón se ven iguales.
export async function GET(req) {
  try {
    const auth = requirePerm(req, "transferencias.cancelar");
    if (!auth.ok) return j({ ok: false, error: auth.error }, auth.status);

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id") || 0);
    if (!id) return j({ ok: false, error: "id requerido" }, 400);

    const t = await prisma.transferencia.findUnique({
      where: { id },
      select: SELECT_TRANSFERENCIA,
    });
    if (!t) return j({ ok: false, error: "Transferencia no encontrada" }, 404);

    const localId = localDeLaSesion(req, auth.session);
    const turnoAbierto = t.venta ? await turnoAbiertoDe(prisma, t.venta.localId) : null;

    // Se evalúa con un motivo válido de mentira: el preview contesta si el
    // remito es cancelable, no si el operador ya escribió el motivo.
    const veredicto = puedeCancelarTransferencia({
      transferencia: t,
      localId,
      esAdmin: !!auth.session.esAdmin,
      motivo: "preview de cancelacion",
      turnoAbierto,
    });

    return j({
      ok: true,
      cancelable: veredicto.puede,
      codigo: veredicto.codigo,
      motivoBloqueo: veredicto.puede ? null : veredicto.error,
      revierteVenta: veredicto.puede ? veredicto.revierteVenta : t.venta != null,
      venta: t.venta ? { id: t.venta.id, numero: t.venta.numero, total: t.venta.total } : null,
      ...resumenDeLaCancelacion(t),
    });
  } catch (err) {
    console.error("Error en preview de cancelación:", err);
    return j({ ok: false, error: `No se pudo evaluar la cancelación: ${err.message}` }, 500);
  }
}

// ── POST: cancelar ──────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const auth = requirePerm(req, "transferencias.cancelar");
    if (!auth.ok) return j({ ok: false, error: auth.error }, auth.status);

    const body = await req.json().catch(() => ({}));
    const transferenciaId = Number(body?.transferenciaId || 0);
    const motivo = typeof body?.motivo === "string" ? body.motivo.trim() : "";
    if (!transferenciaId) return j({ ok: false, error: "transferenciaId requerido" }, 400);

    const t = await prisma.transferencia.findUnique({
      where: { id: transferenciaId },
      select: SELECT_TRANSFERENCIA,
    });
    if (!t) return j({ ok: false, error: "Transferencia no encontrada" }, 404);

    const localId = localDeLaSesion(req, auth.session);
    const turnoAbierto = t.venta ? await turnoAbiertoDe(prisma, t.venta.localId) : null;

    const veredicto = puedeCancelarTransferencia({
      transferencia: t,
      localId,
      esAdmin: !!auth.session.esAdmin,
      motivo,
      turnoAbierto,
    });
    if (!veredicto.puede) {
      const status =
        veredicto.codigo === CODIGOS_CANCELAR.NO_ENCONTRADA
          ? 404
          : veredicto.codigo === CODIGOS_CANCELAR.FUERA_DE_ALCANCE
          ? 403
          : veredicto.codigo === CODIGOS_CANCELAR.MOTIVO_AUSENTE
          ? 400
          : 409;
      return j({ ok: false, error: veredicto.error, code: veredicto.codigo }, status);
    }

    const grupoId = t.venta ? await getGrupoIdDeLocal(t.venta.localId) : null;

    const resultado = await prisma.$transaction(async (tx) => {
      // ── 1 · Barrera atómica ────────────────────────────────────────────────
      // Lo primero, porque es lo único que otro proceso puede estar tocando en
      // este instante: el destino registrando la recepción.
      const lock = await tx.transferencia.updateMany({
        where: { id: t.id, estado: "Enviada" },
        data: { estado: "Cancelando" },
      });
      if (lock.count === 0) throw new Error("YA_PROCESADA");

      // ── 2 · El tránsito del origen, según la política del remito ───────────
      //
      // Acá está lo delicado. Con `DESCONTAR_Y_TRANSITO` —un remito manual— se
      // devuelve `cantidad` porque esta transferencia fue la que la descontó.
      // Con `SOLO_TRANSITO` —nació de una venta— NO se devuelve: la descontó la
      // venta, y de devolverla se encarga la reversión de la venta, más abajo.
      // Si las dos devolvieran, el origen recuperaría la mercadería dos veces.
      const politica = politicaDeLaTransferencia(t);
      const impactoTransito = [];
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
        // resuelve por baseId.
        const productoOrigen = await tx.productoLocal.findUnique({
          where: { localId_baseId: { localId: t.origenId, baseId: d.producto.base.id } },
          select: { id: true },
        });
        if (!productoOrigen) continue;

        const { update } = reversionStockOrigen(politica, unidades);
        await tx.stockLocal.updateMany({
          where: { localId: t.origenId, productoId: productoOrigen.id },
          data: update,
        });
        impactoTransito.push({
          baseId: d.producto.base.id,
          nombre: d.producto.base.nombre,
          unidades,
          politica,
        });
      }

      // ── 3 · La venta vinculada, si la hay ──────────────────────────────────
      //
      // Se reusa el motor de reversión de ventas. No se escribe uno nuevo.
      let reversion = null;
      if (t.venta) {
        reversion = await revertirVenta(tx, {
          venta: { ...t.venta, transferencia: { id: t.id } },
          grupoId,
          usuarioId: auth.session.id ?? null,
          motivo,
          turnoDestinoId: turnoAbierto?.id ?? null,
          turnoOriginalCerrado: t.venta.turno ? t.venta.turno.cierre != null : false,
          versionEsperada: t.venta.version,
          origen: `cancelacion de la transferencia #${t.id}`,
        });
      }

      // ── 4 · Cerrar el remito, con su rastro ────────────────────────────────
      await tx.transferencia.update({
        where: { id: t.id },
        data: {
          estado: "Cancelada",
          canceladaEn: new Date(),
          canceladaPorId: auth.session.id ?? null,
          motivoCancelacion: motivo,
        },
      });

      return {
        transferenciaId: t.id,
        politica,
        lineasLiberadas: impactoTransito.length,
        venta: reversion
          ? { id: t.venta.id, numero: t.venta.numero, ...reversion }
          : null,
      };
    });

    return j({ ok: true, ...resultado });
  } catch (err) {
    if (err.message === "YA_PROCESADA") {
      return j(
        {
          ok: false,
          error: "Alguien tocó esta transferencia mientras la cancelábamos. Volvé a cargar la pantalla.",
          code: "YA_PROCESADA",
        },
        409
      );
    }
    if (err.message === "VERSION_DESACTUALIZADA") {
      return j(
        {
          ok: false,
          error: "La venta vinculada fue modificada por otra persona mientras tanto. Volvé a cargar la pantalla.",
          code: "VERSION_DESACTUALIZADA",
        },
        409
      );
    }
    console.error("ERROR cancelando transferencia:", err);
    return j(
      { ok: false, error: `No se pudo cancelar la transferencia: ${err.message}`, code: "CANCELAR_FALLO" },
      500
    );
  }
}
