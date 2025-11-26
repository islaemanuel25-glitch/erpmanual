// app/api/pos-transferencias/buscarProductos/route.js
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

    const q = (searchParams.get("q") || "").trim();
    const origenId = Number(searchParams.get("origenId") || 0);

    if (!origenId) {
      return NextResponse.json(
        { ok: false, error: "origenId requerido" },
        { status: 400 }
      );
    }

    const whereBusqueda = {
      localId: origenId,
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: "insensitive" } },
              { base: { nombre: { contains: q, mode: "insensitive" } } },
              { base: { codigo_barra: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const productos = await prisma.productoLocal.findMany({
      where: whereBusqueda,
      include: {
        base: {
          include: {
            categoria: true,
            area_fisica: true,
          },
        },
        stock: {
          where: { localId: origenId },
          select: { cantidad: true },
        },
      },
      take: 50,
    });

    const items = productos.map((productoLocal) => {
      const base = productoLocal.base;
      const stockActual = Number(productoLocal.stock?.[0]?.cantidad || 0);

      return {
        productoLocalId: productoLocal.id,
        baseId: productoLocal.baseId,

        nombre: productoLocal.nombre || base?.nombre || "",
        codigoBarra: base?.codigo_barra || "",

        stockActual,
        precioCosto: Number(
          productoLocal.precio_costo || base?.precio_costo || 0
        ),

        unidadMedida: base?.unidad_medida || "unidad",
        factorPack: Number(base?.factor_pack || 1),

        // 🔥 NECESARIOS PARA LOS FILTROS (null, no vacío)
        categoriaNombre: base?.categoria?.nombre ?? null,
        areaFisicaNombre: base?.area_fisica?.nombre ?? null,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      total: items.length,
      error: null,
    });
  } catch (err) {
    console.error("Error buscarProductos:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos" },
      { status: 500 }
    );
  }
}
