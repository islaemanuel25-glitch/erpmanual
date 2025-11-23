import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function DELETE(req) {
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

    if (!detalleId) {
      return NextResponse.json(
        { ok: false, error: "detalleId requerido" },
        { status: 400 }
      );
    }

    const detalle = await prisma.posTransferenciaDetalle.findUnique({
      where: { id: detalleId },
      include: {
        pos: { select: { id: true, estado: true, origenId: true } },
        producto: { include: { base: true } },
      },
    });

    if (!detalle) {
      return NextResponse.json(
        { ok: false, error: "Detalle no encontrado" },
        { status: 404 }
      );
    }

    if (detalle.pos.estado === "Enviado") {
      return NextResponse.json(
        { ok: false, error: "No se puede eliminar un item de una POS enviada" },
        { status: 400 }
      );
    }

    const stockOrigen = await prisma.stockLocal.findUnique({
      where: {
        localId_productoId: {
          localId: detalle.pos.origenId,
          productoId: detalle.productoId,
        },
      },
      select: { cantidad: true },
    });

    await prisma.posTransferenciaDetalle.delete({
      where: { id: detalleId },
    });

    const productoLocal = detalle.producto;
    const base = productoLocal?.base;
    const stockActual = Number(stockOrigen?.cantidad || 0);

    const item = {
      detalleId,
      productoLocalId: detalle.productoId,
      baseId: productoLocal?.baseId,
      tipo: detalle.tipo,
      sugerido: Number(detalle.sugerido || 0),
      preparado: Number(detalle.preparado || 0),
      productoNombre: productoLocal?.nombre || base?.nombre || "",
      codigoBarra: base?.codigo_barra || "",
      stockActual,
      cantidadReal: stockActual,
      precioCosto: Number(
        productoLocal?.precio_costo || base?.precio_costo || 0
      ),
      unidadMedida: base?.unidad_medida || "unidad",
      factorPack: Number(base?.factor_pack || 1),
    };

    return NextResponse.json({
      ok: true,
      item,
      error: null,
    });
  } catch (err) {
    console.error("Error eliminarItem POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al eliminar item" },
      { status: 500 }
    );
  }
}
// app/api/pos-transferencias/eliminarItem/route.js
