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
    const localId = Number(searchParams.get("localId"));

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    // Top 10 productos mas vendidos en este local (ultimos 30 dias)
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    const topProductos = await prisma.ventaDetalle.groupBy({
      by: ["productoBaseId"],
      where: {
        venta: {
          localId,
          fecha: { gte: hace30Dias },
        },
      },
      _sum: { cantidad: true },
      orderBy: { _sum: { cantidad: "desc" } },
      take: 10,
    });

    if (topProductos.length === 0) {
      return NextResponse.json({ ok: true, items: [] });
    }

    const ids = topProductos.map((t) => t.productoBaseId);

    // Obtener datos de cada producto con su stock en el local
    const productos = await prisma.productoLocal.findMany({
      where: {
        baseId: { in: ids },
        localId,
        activo: true,
      },
      include: {
        base: { select: { id: true, nombre: true, codigo_barra: true } },
        stock: { where: { localId }, select: { cantidad: true } },
      },
    });

    const items = productos
      .map((pl) => {
        const stockCant = pl.stock[0]?.cantidad
          ? Number(pl.stock[0].cantidad)
          : 0;
        if (stockCant <= 0) return null;
        return {
          productoBaseId: pl.base.id,
          nombre: pl.nombre || pl.base.nombre,
          codigoBarra: pl.base.codigo_barra,
          precioVenta: Number(pl.precio_venta),
          stock: stockCant,
        };
      })
      .filter(Boolean);

    // Ordenar por cantidad vendida (mismo orden que topProductos)
    items.sort((a, b) => {
      return ids.indexOf(a.productoBaseId) - ids.indexOf(b.productoBaseId);
    });

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("Error en favoritos:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
