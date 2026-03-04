import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

const CHUNK_SIZE = 2000;

async function createManyChunked(model, data) {
  let total = 0;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    const r = await model.createMany({ data: chunk, skipDuplicates: true });
    total += r.count;
  }
  return total;
}

// ========================================================
// POST /api/grupos/:id/sync-productos
// Sincroniza el catálogo del depósito a todos los locales del grupo
// ========================================================
export async function POST(req, context) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { id } = await context.params;
    const grupoId = Number(id);

    if (!grupoId || Number.isNaN(grupoId)) {
      return NextResponse.json(
        { ok: false, error: "ID de grupo inválido" },
        { status: 400 }
      );
    }

    // ── 1) Lecturas fuera de transacción ──────────────────────

    const grupoDeposito = await prisma.grupoDeposito.findFirst({
      where: { grupoId },
      select: { localId: true },
    });

    if (!grupoDeposito) {
      return NextResponse.json(
        { ok: false, error: "El grupo no tiene depósito asignado" },
        { status: 400 }
      );
    }

    const depositoId = grupoDeposito.localId;

    const productosBase = await prisma.productoBase.findMany({
      where: {
        grupoId,
        OR: [
          { creadoEnLocalId: depositoId },
          { creadoEnLocalId: null },
        ],
      },
      select: {
        id: true,
        precio_costo: true,
        precio_venta: true,
        margen: true,
        activo: true,
      },
    });

    if (productosBase.length === 0) {
      return NextResponse.json({
        ok: true,
        data: {
          productosBase: 0,
          locales: 0,
          productoLocalCreated: 0,
          stockCreated: 0,
        },
      });
    }

    const grupoLocales = await prisma.grupoLocal.findMany({
      where: { grupoId },
      select: { localId: true },
    });

    // Solo locales reales, sin depósito (el depósito lee directo de ProductoBase)
    const localIds = grupoLocales
      .map((gl) => gl.localId)
      .filter((id) => id !== depositoId);

    // ── 2) Armar datos fuera de transacción (CPU puro) ───────

    const productoLocalData = [];
    for (const localId of localIds) {
      for (const base of productosBase) {
        productoLocalData.push({
          localId,
          baseId: base.id,
          precio_costo: base.precio_costo,
          precio_venta: base.precio_venta,
          margen: base.margen,
          activo: base.activo,
        });
      }
    }

    console.log(`🔍 Sincronizando ${productosBase.length} productos a ${localIds.length} locales (${productoLocalData.length} combinaciones)`);

    // ── 3) Insertar ProductoLocal en chunks (idempotente) ────

    const productoLocalCreated = await createManyChunked(
      prisma.productoLocal,
      productoLocalData
    );

    console.log(`✅ Creados ${productoLocalCreated} ProductoLocal nuevos (${productoLocalData.length - productoLocalCreated} ya existían)`);

    // ── 4) Crear StockLocal para los ProductoLocal ───────────

    const baseIds = productosBase.map((b) => b.id);
    const productosLocal = await prisma.productoLocal.findMany({
      where: {
        localId: { in: localIds },
        baseId: { in: baseIds },
      },
      select: { id: true, localId: true },
    });

    const stockData = productosLocal.map((pl) => ({
      localId: pl.localId,
      productoId: pl.id,
      cantidad: "0",
      stockMin: null,
      stockMax: null,
    }));

    const stockCreated = await createManyChunked(
      prisma.stockLocal,
      stockData
    );

    console.log(`✅ Creados ${stockCreated} StockLocal nuevos (${stockData.length - stockCreated} ya existían)`);

    return NextResponse.json({
      ok: true,
      data: {
        productosBase: productosBase.length,
        locales: localIds.length,
        productoLocalCreated,
        stockCreated,
        productoLocalTotal: productosLocal.length,
        stockTotal: stockData.length,
      },
    });
  } catch (e) {
    console.error("POST /grupos/[id]/sync-productos ERROR:", e);

    if (e.message?.includes("depósito")) {
      return NextResponse.json(
        { ok: false, error: e.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: false, error: e.message || "Error interno" },
      { status: 500 }
    );
  }
}
