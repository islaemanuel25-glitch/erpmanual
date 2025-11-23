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
    const sugerido =
      body.sugerido !== undefined ? Number(body.sugerido) : undefined;
    const preparado =
      body.preparado !== undefined ? Number(body.preparado) : undefined;

    if (!detalleId) {
      return NextResponse.json(
        { ok: false, error: "detalleId requerido" },
        { status: 400 }
      );
    }

    const detalle = await prisma.posTransferenciaDetalle.findUnique({
      where: { id: detalleId },
      include: {
        pos: {
          select: { id: true, estado: true, origenId: true },
        },
        producto: {
          include: { base: true },
        },
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
        { ok: false, error: "No se puede editar un detalle de una POS enviada" },
        { status: 400 }
      );
    }

    const data = {};

    if (sugerido !== undefined) {
      if (isNaN(sugerido) || sugerido < 0) {
        return NextResponse.json(
          { ok: false, error: "sugerido debe ser un número válido" },
          { status: 400 }
        );
      }
      data.sugerido = sugerido;
    }

    if (preparado !== undefined) {
      if (isNaN(preparado) || preparado < 0) {
        return NextResponse.json(
          { ok: false, error: "preparado debe ser un número válido" },
          { status: 400 }
        );
      }
      data.preparado = preparado;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No hay cambios para aplicar" },
        { status: 400 }
      );
    }

    const updated = await prisma.posTransferenciaDetalle.update({
      where: { id: detalleId },
      data,
      include: {
        producto: { include: { base: true } },
        pos: { select: { origenId: true } },
      },
    });

    const stockOrigen = await prisma.stockLocal.findUnique({
      where: {
        localId_productoId: {
          localId: updated.pos.origenId,
          productoId: updated.productoId,
        },
      },
      select: { cantidad: true },
    });

    const productoLocal = updated.producto;
    const base = productoLocal?.base;
    const stockActual = Number(stockOrigen?.cantidad || 0);

    const item = {
      detalleId: updated.id,
      productoLocalId: updated.productoId,
      baseId: productoLocal?.baseId,
      tipo: updated.tipo,
      sugerido: Number(updated.sugerido || 0),
      preparado: Number(updated.preparado || 0),
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
    console.error("Error editar detalle POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al editar detalle" },
      { status: 500 }
    );
  }
}
// app/api/pos-transferencias/detalle/editar/route.js
