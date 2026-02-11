import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// ========================================================
// POST /api/grupos/:id/sync-productos
// Sincroniza el catálogo del depósito a todos los locales del grupo
// ========================================================
export async function POST(req, context) {
  try {
    const { id } = await context.params;
    const grupoId = Number(id);

    if (!grupoId || Number.isNaN(grupoId)) {
      return NextResponse.json(
        { ok: false, error: "ID de grupo inválido" },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) Leer grupoId desde params (ya validado arriba)

      // 2) Buscar depósito del grupo
      const grupoDeposito = await tx.grupoDeposito.findFirst({
        where: { grupoId },
        select: { localId: true },
      });

      if (!grupoDeposito) {
        throw new Error("El grupo no tiene depósito asignado");
      }

      const depositoId = grupoDeposito.localId;

      // 3) Traer ProductoBase del grupo creados por depósito O null
      const productosBase = await tx.productoBase.findMany({
        where: {
          grupoId,
          OR: [
            { creadoEnLocalId: depositoId },
            { creadoEnLocalId: null }, // productos viejos sin creador
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
        return {
          productosBase: 0,
          locales: 0,
          productoLocalCreated: 0,
          stockCreated: 0,
        };
      }

      // 4) Traer locales del grupo (grupoLocal) y sumar depósito también
      const grupoLocales = await tx.grupoLocal.findMany({
        where: { grupoId },
        select: { localId: true },
      });

      const localIds = [
        ...new Set([
          ...grupoLocales.map((gl) => gl.localId),
          depositoId, // incluir depósito también
        ]),
      ];

      // 5) Crear ProductoLocal para cada (localId x baseId)
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

      const productoLocalResult = await tx.productoLocal.createMany({
        data: productoLocalData,
        skipDuplicates: true,
      });

      console.log(`✅ Creados ${productoLocalResult.count} ProductoLocal nuevos (${productoLocalData.length - productoLocalResult.count} ya existían)`);

      // 6) Buscar ProductoLocal ids para esos localIds/baseIds y crear StockLocal
      const productosLocal = await tx.productoLocal.findMany({
        where: {
          localId: { in: localIds },
          baseId: { in: productosBase.map((b) => b.id) },
        },
        select: { id: true, localId: true },
      });

      const stockData = productosLocal.map((pl) => ({
        localId: pl.localId,
        productoId: pl.id,
        cantidad: "0", // Decimal safe
        stockMin: null,
        stockMax: null,
      }));

      const stockResult = await tx.stockLocal.createMany({
        data: stockData,
        skipDuplicates: true,
      });

      console.log(`✅ Creados ${stockResult.count} StockLocal nuevos (${stockData.length - stockResult.count} ya existían)`);

      return {
        productosBase: productosBase.length,
        locales: localIds.length,
        productoLocalCreated: productoLocalResult.count,
        stockCreated: stockResult.count,
        productoLocalTotal: productosLocal.length,
        stockTotal: stockData.length,
      };
    });

    return NextResponse.json({
      ok: true,
      data: result,
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

