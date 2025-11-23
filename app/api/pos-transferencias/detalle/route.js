// app/api/pos-transferencias/detalle/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const posId = Number(searchParams.get("posId") || 0);

    if (!posId) {
      return NextResponse.json(
        { ok: false, error: "posId requerido" },
        { status: 400 }
      );
    }

    const pos = await prisma.posTransferencia.findUnique({
      where: { id: posId },
      include: {
        origen: true,
        destino: true,
        usuario: true,
      },
    });

    if (!pos) {
      return NextResponse.json(
        { ok: false, error: "POS no encontrada" },
        { status: 404 }
      );
    }

    // ============================================
    // 1) Obtener DETALLES + PRODUCTOS
    // ============================================
    const detallesDb = await prisma.posTransferenciaDetalle.findMany({
      where: { posTransferenciaId: posId },
      include: {
        producto: {
          include: { base: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const productoIds = detallesDb.map((d) => d.productoId);

    // ============================================
    // 2) STOCK ORIGEN (depósito)
    // ============================================
    const stockOrigen = productoIds.length
      ? await prisma.stockLocal.findMany({
          where: {
            localId: pos.origenId,
            productoId: { in: productoIds },
          },
          select: { productoId: true, cantidad: true },
        })
      : [];

    const stockOrigenMap = new Map(
      stockOrigen.map((s) => [s.productoId, Number(s.cantidad || 0)])
    );

    // ============================================
    // 3) STOCK DESTINO (local)
    // ============================================
    const stockDestino = productoIds.length
      ? await prisma.stockLocal.findMany({
          where: {
            localId: pos.destinoId,
            productoId: { in: productoIds },
          },
          select: { productoId: true, cantidad: true },
        })
      : [];

    const stockDestinoMap = new Map(
      stockDestino.map((s) => [s.productoId, Number(s.cantidad || 0)])
    );

    // ============================================
    // 4) ARMAR DETALLES
    // ============================================
    let totalSugerido = 0;
    let totalPreparado = 0;

    const detalles = detallesDb.map((detalle) => {
      const productoLocal = detalle.producto;
      const base = productoLocal?.base;

      const stockDelDeposito =
        stockOrigenMap.get(detalle.productoId) || 0;

      const stockDelLocal =
        stockDestinoMap.get(detalle.productoId) || 0;

      const sugerido = Number(detalle.sugerido || 0);
      const preparado = Number(detalle.preparado || 0);

      totalSugerido += sugerido;
      totalPreparado += preparado;

      return {
        detalleId: detalle.id,
        productoLocalId: detalle.productoId,
        baseId: productoLocal?.baseId,
        tipo: detalle.tipo,

        sugerido,
        preparado,

        productoNombre: productoLocal?.nombre || base?.nombre || "",
        codigoBarra: base?.codigo_barra || "",

        // ✔ Origen = depósito
        stockActual: stockDelDeposito,

        // ✔ Destino = local
        cantidadReal: stockDelLocal,

        precioCosto: Number(
          productoLocal?.precio_costo || base?.precio_costo || 0
        ),
        unidadMedida: base?.unidad_medida || "unidad",
        factorPack: Number(base?.factor_pack || 1),
      };
    });

    return NextResponse.json({
      ok: true,
      item: {
        encabezado: {
          id: pos.id,
          posTransferenciaId: pos.id,
          estado: pos.estado,
          origen: pos.origen,
          destino: pos.destino,
          usuario: pos.usuario,
          origenId: pos.origenId,
          destinoId: pos.destinoId,
          createdAt: pos.createdAt,
          updatedAt: pos.updatedAt,
        },
        detalles,
        totales: {
          totalSugerido,
          totalPreparado,
          cantidadItems: detalles.length,
        },
      },
      error: null,
    });
  } catch (err) {
    console.error("Error POS detalle:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al obtener detalle" },
      { status: 500 }
    );
  }
}
