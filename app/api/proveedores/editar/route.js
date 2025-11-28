import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function PUT(req) {
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
      id,
      nombre,
      cuit,
      telefono,
      email,
      direccion,
      dias_pedido = [],
      activo,
    } = body;

    const numId = Number(id || 0);
    if (!numId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    if (!nombre || nombre.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    const item = await prisma.proveedor.update({
      where: { id: numId },
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
    console.error("EDITAR proveedor:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
