// app/api/transferencias/editar-envio/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);

    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const permisos = session.permisos || [];
    const esAdmin = permisos.includes("*");

    if (!esAdmin) {
      return NextResponse.json(
        { ok: false, error: "Solo admin puede editar cantidades enviadas" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { detalleId, cantidadNueva } = body;

    if (!detalleId || cantidadNueva == null) {
      return NextResponse.json(
        { ok: false, error: "Datos inválidos" },
        { status: 400 }
      );
    }

    await prisma.transferenciaDetalle.update({
      where: { id: Number(detalleId) },
      data: {
        cantidad: Number(cantidadNueva),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("ERROR editar-envio:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
