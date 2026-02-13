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

    // Ventas de hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const ventas = await prisma.venta.findMany({
      where: {
        localId,
        fecha: { gte: hoy },
      },
      orderBy: { fecha: "desc" },
      select: {
        id: true,
        numero: true,
        fecha: true,
        subtotal: true,
        comision: true,
        descuento: true,
        total: true,
        formaPago: true,
        detalles: {
          select: {
            nombre: true,
            cantidad: true,
            precio: true,
            subtotal: true,
          },
        },
      },
    });

    return NextResponse.json({ ok: true, items: ventas });
  } catch (error) {
    console.error("Error historial dia:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
