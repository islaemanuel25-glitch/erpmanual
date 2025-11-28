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

    const body = await req.json();
    const {
      nombre,
      cuit,
      telefono,
      email,
      direccion,
      dias_pedido = [],
      activo = true,
    } = body;

    if (!nombre || nombre.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    const item = await prisma.proveedor.create({
      data: {
        nombre,
        cuit,
        telefono,
        email,
        direccion,
        dias_pedido,
        activo,
      },
    });

    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error("Error CREAR PROVEEDOR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
