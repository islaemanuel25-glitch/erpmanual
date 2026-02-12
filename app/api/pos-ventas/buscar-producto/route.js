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
    const localId = Number(searchParams.get("localId") || 0);

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    if (!q) {
      return NextResponse.json({ ok: true, items: [] });
    }

    // Prioridad: match exacto por codigo_barra
    const exacto = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: { codigo_barra: q, activo: true },
      },
      include: {
        base: true,
        stock: { where: { localId }, select: { cantidad: true } },
      },
      take: 1,
    });

    if (exacto.length > 0) {
      const items = mapProductos(exacto);
      return NextResponse.json({ ok: true, items });
    }

    // Busqueda por nombre (LIKE)
    const productos = await prisma.productoLocal.findMany({
      where: {
        localId,
        activo: true,
        base: { activo: true },
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { base: { nombre: { contains: q, mode: "insensitive" } } },
          { base: { codigo_barra: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: {
        base: true,
        stock: { where: { localId }, select: { cantidad: true } },
      },
      take: 10,
    });

    const items = mapProductos(productos);
    return NextResponse.json({ ok: true, items });
  } catch (err) {
    console.error("Error buscar-producto POS:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno al buscar productos" },
      { status: 500 }
    );
  }
}

function mapProductos(lista) {
  return lista
    .map((pl) => {
      const stock = Number(pl.stock?.[0]?.cantidad || 0);
      return {
        productoBaseId: pl.baseId,
        productoLocalId: pl.id,
        nombre: pl.nombre || pl.base?.nombre || "",
        codigoBarra: pl.base?.codigo_barra || "",
        precioVenta: Number(pl.precio_venta || pl.base?.precio_venta || 0),
        precioCosto: Number(pl.precio_costo || pl.base?.precio_costo || 0),
        stock,
      };
    })
    .filter((p) => p.stock > 0);
}
