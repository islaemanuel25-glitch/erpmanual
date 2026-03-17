import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getContextoActivo } from "@/lib/contexto";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const contexto = getContextoActivo(req, session);
    if (contexto.needsContexto) {
      return NextResponse.json(
        { ok: false, error: "Contexto requerido" },
        { status: 409 }
      );
    }

    const localId = contexto.localId;
    const limite = Number(req.nextUrl.searchParams.get("limite")) || 10;

    const ventas = await prisma.venta.findMany({
      where: { localId },
      orderBy: { fecha: "desc" },
      take: limite,
      select: {
        id: true,
        numero: true,
        fecha: true,
        total: true,
        formaPago: true,
        cliente: {
          select: { id: true, nombre: true },
        },
        vendedor: {
          select: { id: true, nombre: true },
        },
      },
    });

    const items = ventas.map((v) => ({
      id: v.id,
      numero: v.numero,
      fecha: v.fecha,
      total: Number(v.total),
      formaPago: v.formaPago,
      cliente: v.cliente?.nombre || "Consumidor final",
      vendedor: v.vendedor?.nombre || "",
    }));

    return NextResponse.json({ ok: true, ventas: items });
  } catch (error) {
    console.error("Error dashboard/ventas-recientes:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
