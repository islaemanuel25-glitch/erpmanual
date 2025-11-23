// app/api/transferencias/sugeridos/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const destinoId = Number(searchParams.get("destinoId") || 0);

    if (!destinoId) {
      return NextResponse.json(
        { ok: false, error: "destinoId requerido" },
        { status: 400 }
      );
    }

    // ===========================================================
    // 1) STOCK DEL LOCAL DESTINO
    // ===========================================================
    const stocks = await prisma.stockLocal.findMany({
      where: { localId: destinoId },
      select: {
        productoId: true,
        cantidad: true,
        stockMin: true,
        stockMax: true,
        producto: {
          select: {
            id: true,
            nombre: true,
            codigo_barra: true,
            factor_pack: true,
            precio_costo: true,
          },
        },
      },
    });

    // ===========================================================
    // 2) CALCULAR FALTANTES Y SUGERIDOS (REGLA OFICIAL)
    // ===========================================================
    const sugeridos = stocks
      .map((s) => {
        const stockActual = s.cantidad || 0;
        const stockMax = s.stockMax || 0;

        // Solo sugerimos si falta stock
        if (stockActual >= stockMax) return null;

        const faltante = stockMax - stockActual;
        const factor = s.producto.factor_pack || 1;

        // Reglas oficiales de packs/cajones
        const cajones = Math.ceil(faltante / factor);
        const sugerido = cajones * factor;

        return {
          productoId: s.productoId,
          nombre: s.producto.nombre,
          codigo_barra: s.producto.codigo_barra,
          factor_pack: factor,
          stockActual,
          stockMin: s.stockMin || 0,
          stockMax,
          faltante,
          sugerido, // cantidad a enviar
          precio_costo: s.producto.precio_costo || 0,
        };
      })
      .filter(Boolean); // quitar nulls

    return NextResponse.json({
      ok: true,
      items: sugeridos,
      total: sugeridos.length,
      error: null,
    });
  } catch (error) {
    console.error("Error en /api/transferencias/sugeridos:", error);
    return NextResponse.json(
      { ok: false, items: [], error: "Error al calcular sugeridos" },
      { status: 500 }
    );
  }
}
