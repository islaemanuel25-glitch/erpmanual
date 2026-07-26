// app/api/pos-transferencias/detalle/quitar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { defaultModoEnvio } from "@/lib/conversiones/stock";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const perm = checkPerm(session, "pos_transferencias.enviar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const detalleId = Number(body.detalleId || 0);

    if (!detalleId)
      return NextResponse.json(
        { ok: false, error: "detalleId requerido" },
        { status: 400 }
      );

    const detalle = await prisma.posTransferenciaDetalle.findUnique({
      where: { id: detalleId },
      include: {
        pos: { select: { origenId: true, destinoId: true, estado: true } },
        producto: { include: { base: true } },
      },
    });

    if (!detalle)
      return NextResponse.json(
        { ok: false, error: "Detalle no encontrado" },
        { status: 404 }
      );

    // Scope: no-admin solo puede operar sobre POS de su local (origen o destino).
    // ESCRITURA sobre recurso ajeno → 403.
    if (
      !session.esAdmin &&
      Number(session.localId) !== detalle.pos.origenId &&
      Number(session.localId) !== detalle.pos.destinoId
    ) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para esta transferencia" },
        { status: 403 }
      );
    }

    if (detalle.pos.estado === "Enviado")
      return NextResponse.json(
        { ok: false, error: "No se puede quitar un ítem enviado" },
        { status: 400 }
      );

    // Si está Solicitado, solo depósito/admin puede modificar
    if (detalle.pos.estado === "Solicitado") {
      const isAdmin =
        Array.isArray(session.permisos) &&
        session.permisos.includes("*") &&
        !session.localId;

      if (!isAdmin) {
        const userLocal = await prisma.local.findUnique({
          where: { id: Number(session.localId) },
          select: { es_deposito: true },
        });

        if (!userLocal?.es_deposito) {
          return NextResponse.json(
            { ok: false, error: "Solo depósito/admin puede modificar una POS solicitada" },
            { status: 403 }
          );
        }
      }
    }

    // STOCK ORIGEN
    const stockOrigen = await prisma.stockLocal.findUnique({
      where: {
        localId_productoId: {
          localId: detalle.pos.origenId,
          productoId: detalle.productoId,
        },
      },
      select: { cantidad: true },
    });

    const stockActualOrigen = Number(stockOrigen?.cantidad || 0);

    // STOCK DESTINO
    const stockDestino = await prisma.stockLocal.findUnique({
      where: {
        localId_productoId: {
          localId: detalle.pos.destinoId,
          productoId: detalle.producto.baseId,
        },
      },
      select: { cantidad: true },
    });

    const stockActualDestino = Number(stockDestino?.cantidad || 0);

    // Si tiene sugerido > 0, volver a Sugeridos (preparado=0) en vez de eliminar
    const sugeridoActual = Number(detalle.sugerido || 0);
    let accion = "eliminado";

    if (sugeridoActual > 0) {
      await prisma.posTransferenciaDetalle.update({
        where: { id: detalleId },
        data: { preparado: 0 },
      });
      accion = "devuelto_a_sugerido";
    } else {
      await prisma.posTransferenciaDetalle.delete({
        where: { id: detalleId },
      });
    }

    const item = {
      detalleId,
      productoLocalId: detalle.productoId,
      baseId: detalle.producto.baseId,
      tipo: detalle.tipo,
      sugerido: sugeridoActual,
      preparado: 0,
      productoNombre: detalle.producto.nombre || detalle.producto.base.nombre,
      codigoBarra: detalle.producto.base.codigo_barra,

      stockActual: stockActualOrigen,
      cantidadReal: stockActualDestino,

      precioCosto: Number(
        detalle.producto?.precio_costo || detalle.producto.base.precio_costo
      ),
      unidadMedida: detalle.producto.base.unidad_medida,
      factorPack: Number(detalle.producto.base.factor_pack || 1),
      modoEnvio: detalle.producto.base.modo_envio || defaultModoEnvio(detalle.producto.base.unidad_medida || "unidad"),
    };

    return NextResponse.json({ ok: true, item, accion, error: null });
  } catch (err) {
    console.error("QUITAR DETALLE POS ERROR:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al quitar detalle" },
      { status: 500 }
    );
  }
}
