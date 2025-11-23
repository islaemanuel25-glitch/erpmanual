// app/api/pos-transferencias/detalle/quitar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
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

    if (detalle.pos.estado === "Enviado")
      return NextResponse.json(
        { ok: false, error: "No se puede quitar un ítem enviado" },
        { status: 400 }
      );

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

    // ELIMINAR DETALLE
    await prisma.posTransferenciaDetalle.delete({
      where: { id: detalleId },
    });

    const item = {
      detalleId,
      productoLocalId: detalle.productoId,
      baseId: detalle.producto.baseId,
      tipo: detalle.tipo,
      sugerido: Number(detalle.sugerido || 0),
      preparado: Number(detalle.preparado || 0),
      productoNombre: detalle.producto.nombre || detalle.producto.base.nombre,
      codigoBarra: detalle.producto.base.codigo_barra,

      stockActual: stockActualOrigen,
      cantidadReal: stockActualDestino,

      precioCosto: Number(
        detalle.producto?.precio_costo || detalle.producto.base.precio_costo
      ),
      unidadMedida: detalle.producto.base.unidad_medida,
      factorPack: Number(detalle.producto.base.factor_pack || 1),
    };

    return NextResponse.json({ ok: true, item, error: null });
  } catch (err) {
    console.error("QUITAR DETALLE POS ERROR:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al quitar detalle" },
      { status: 500 }
    );
  }
}
