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

    const localId =
      session.localId ||
      Number(req.nextUrl.searchParams.get("localId"));

    if (!localId) {
      return NextResponse.json(
        { ok: false, error: "localId requerido" },
        { status: 400 }
      );
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Cantidad de ventas y total
    const agg = await prisma.venta.aggregate({
      where: {
        localId,
        fecha: { gte: hoy },
      },
      _count: { id: true },
      _sum: { total: true },
    });

    // Items vendidos
    const itemsAgg = await prisma.ventaDetalle.aggregate({
      where: {
        venta: {
          localId,
          fecha: { gte: hoy },
        },
      },
      _sum: { cantidad: true },
    });

    return NextResponse.json({
      ok: true,
      stats: {
        ventas: agg._count.id || 0,
        total: Number(agg._sum.total) || 0,
        items: Number(itemsAgg._sum.cantidad) || 0,
      },
    });
  } catch (error) {
    console.error("Error stats dia:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
