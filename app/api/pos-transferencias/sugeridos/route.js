import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const destinoId = Number(searchParams.get("destinoId") || 0);
    const posId = Number(searchParams.get("posId") || 0);

    if (!destinoId || !posId) {
      return NextResponse.json({ ok: false, error: "destinoId y posId requeridos" }, { status: 400 });
    }

    // ============================================================
    // 1) Obtener baseIds ya preparados (DEL ORIGEN)
    // ============================================================
    const detalles = await prisma.posTransferenciaDetalle.findMany({
      where: { posTransferenciaId: posId },
      include: {
        producto: { select: { baseId: true } }
      }
    });

    const preparadosBaseIds = new Set(detalles.map(d => d.producto.baseId));

    // ============================================================
    // 2) Confirmar destino
    // ============================================================
    const destino = await prisma.local.findUnique({
      where: { id: destinoId },
      select: { es_deposito: true }
    });

    if (!destino || destino.es_deposito) {
      return NextResponse.json({ ok: false, error: "Destino inválido" }, { status: 400 });
    }

    // Buscar depósito del grupo
    const grupoLocal = await prisma.grupoLocal.findUnique({
      where: { localId: destinoId },
      select: { grupoId: true }
    });

    const grupoDeposito = await prisma.grupoDeposito.findFirst({
      where: { grupoId: grupoLocal.grupoId },
      select: { localId: true }
    });

    const depositoId = grupoDeposito.localId;

    // ============================================================
    // 3) Productos del destino
    // ============================================================
    const productosDestino = await prisma.productoLocal.findMany({
      where: { localId: destinoId },
      include: {
        base: true,
        stock: {
          where: { localId: destinoId },
          select: { cantidad: true, stockMin: true, stockMax: true }
        }
      }
    });

    const items = [];

    for (const p of productosDestino) {
      // 🔥 FILTRO POR baseId
      if (preparadosBaseIds.has(p.baseId)) continue;

      const base = p.base;
      const stock = p.stock?.[0] || {};

      const stockActualDestino = Number(stock.cantidad || 0);
      const stockMax = Number(stock.stockMax || 0);

      const sugerido = stockMax > stockActualDestino
        ? stockMax - stockActualDestino
        : 0;

      if (sugerido <= 0) continue;

      // Producto en depósito
      const origen = await prisma.productoLocal.findFirst({
        where: { baseId: p.baseId, localId: depositoId },
        include: {
          stock: {
            where: { localId: depositoId },
            select: { cantidad: true }
          }
        }
      });

      const stockActualOrigen = Number(origen?.stock?.[0]?.cantidad || 0);

      items.push({
        productoLocalDestinoId: p.id,
        productoLocalOrigenId: origen?.id || null,

        baseId: p.baseId,
        productoNombre: p.nombre || base.nombre,
        codigoBarra: base.codigo_barra || "",

        stockActualDestino,
        stockMin: Number(stock.stockMin || 0),
        stockMax,

        stockActualOrigen,
        sugerido,

        precioCosto: Number(p.precio_costo || base.precio_costo || 0),
        unidadMedida: base.unidad_medida,
        factorPack: Number(base.factor_pack || 1)
      });
    }

    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
      error: null
    });

  } catch (err) {
    console.error("Error sugeridos POS:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
