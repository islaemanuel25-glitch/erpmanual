// app/api/pos-transferencias/agregarItem/route.js
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

    const posId = Number(body.posId || 0);
    const productoLocalId = Number(body.productoLocalId || 0);
    const cantidad = Number(body.cantidad || 0);
    const tipo = body.tipo === "manual" ? "manual" : "sugerido";

    if (!posId || !productoLocalId || cantidad <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "posId, productoLocalId y cantidad válidos requeridos",
        },
        { status: 400 }
      );
    }

    // ================================
    // 1) OBTENER POS (origen + destino)
    // ================================
    const pos = await prisma.posTransferencia.findUnique({
      where: { id: posId },
      select: { id: true, estado: true, origenId: true, destinoId: true },
    });

    if (!pos) {
      return NextResponse.json(
        { ok: false, error: "POS inexistente" },
        { status: 404 }
      );
    }

    if (pos.estado === "Enviado") {
      return NextResponse.json(
        { ok: false, error: "La POS ya fue enviada" },
        { status: 400 }
      );
    }

    // ================================
    // 2) PRODUCTO DEL ORIGEN
    // ================================
    const productoLocal = await prisma.productoLocal.findFirst({
      where: {
        id: productoLocalId,
        localId: pos.origenId,
      },
      include: {
        base: true,
      },
    });

    if (!productoLocal) {
      return NextResponse.json(
        { ok: false, error: "Producto del origen inexistente" },
        { status: 404 }
      );
    }

    // ================================
    // 3) STOCK DEL ORIGEN (DEPÓSITO)
    // ================================
    const stockOrigen = await prisma.stockLocal.findUnique({
      where: {
        localId_productoId: {
          localId: pos.origenId,
          productoId: productoLocalId,
        },
      },
      select: { cantidad: true },
    });

    const stockActualOrigen = Number(stockOrigen?.cantidad || 0);

    // ================================
    // 4) STOCK DEL DESTINO (LOCAL)
    // ================================
    const stockDestino = await prisma.stockLocal.findUnique({
      where: {
        localId_productoId: {
          localId: pos.destinoId,
          productoId: productoLocal.baseId, // producto base
        },
      },
      select: { cantidad: true },
    });

    const stockActualDestino = Number(stockDestino?.cantidad || 0);

    // ================================
    // 5) DETALLE
    // ================================
    const existente = await prisma.posTransferenciaDetalle.findFirst({
      where: {
        posTransferenciaId: posId,
        productoId: productoLocalId,
      },
    });

    let detalle;

    if (existente) {
      detalle = await prisma.posTransferenciaDetalle.update({
        where: { id: existente.id },
        data: {
          preparado: Number(existente.preparado || 0) + cantidad,
          ...(tipo === "sugerido" ? { sugerido: cantidad } : {}),
        },
      });
    } else {
      detalle = await prisma.posTransferenciaDetalle.create({
        data: {
          posTransferenciaId: posId,
          productoId: productoLocalId,
          sugerido: tipo === "sugerido" ? cantidad : 0,
          preparado: cantidad,
          tipo,
        },
      });
    }

    // ================================
    // 6) DEVOLVER VALORES CORRECTOS
    // ================================
    const item = {
      detalleId: detalle.id,
      productoLocalId,
      baseId: productoLocal.baseId,
      productoNombre: productoLocal.nombre || productoLocal.base.nombre,
      codigoBarra: productoLocal.base.codigo_barra,

      // ✔ ESTE ES EL MODELO FINAL
      stockActual: stockActualOrigen,          // stock del depósito
      cantidadReal: stockActualDestino,        // stock del local destino

      unidadMedida: productoLocal.base.unidad_medida || "unidad",
      factorPack: Number(productoLocal.base.factor_pack || 1),
      precioCosto: Number(
        productoLocal.precio_costo || productoLocal.base.precio_costo || 0
      ),

      sugerido: Number(detalle.sugerido || 0),
      preparado: Number(detalle.preparado || 0),
      tipo: detalle.tipo,
    };

    return NextResponse.json({
      ok: true,
      item,
      error: null,
    });
  } catch (err) {
    console.error("Error agregarItem:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al agregar item" },
      { status: 500 }
    );
  }
}
