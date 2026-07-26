import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { requireAdmin } from "@/lib/authorize";

export async function PUT(req) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

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

    const numId = Number(id);
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

    // Normalizar dias_pedido contra el enum DiaPedido (sin acentos).
    // Acepta inputs viejos con acento ("Miércoles", "Sábado") y filtra falsy/inválidos.
    const DIAS_VALIDOS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
    const ACENTOS_LEGACY = { "Miércoles": "Miercoles", "Sábado": "Sabado" };

    const diasEnum = (Array.isArray(dias_pedido) ? dias_pedido : [])
      .map((d) => ACENTOS_LEGACY[d] || d)
      .filter((d) => DIAS_VALIDOS.includes(d));

    const item = await prisma.proveedor.update({
      where: { id: numId },
      data: {
        nombre: nombre.trim(),
        cuit: cuit || null,
        telefono: telefono || null,
        email: email || null,
        direccion: direccion || null,
        dias_pedido: diasEnum,
        activo: Boolean(activo),
      },
    });

    return NextResponse.json({ ok: true, item });

  } catch (e) {
    console.error("Error EDITAR PROVEEDOR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
