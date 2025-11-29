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
    const id = Number(searchParams.get("id") || 0);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const item = await prisma.proveedor.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        cuit: true,
        telefono: true,
        email: true,
        direccion: true,
        dias_pedido: true,   // 🔥 EL CAMPO QUE FALTABA
        activo: true,
      },
    });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item });

  } catch (e) {
    console.error("GET proveedor:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
