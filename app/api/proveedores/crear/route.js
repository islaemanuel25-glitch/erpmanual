import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // Regla B: marcar el local que da de alta el proveedor (fallback de
    // visibilidad hasta que tenga productos). Admin sin contexto activo → null.
    const scope = await resolveLocalAndGrupo(req);
    const creadoEnLocalId = scope.error ? null : scope.localId ?? null;

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

    // Normalizar dias_pedido contra el enum DiaPedido (sin acentos).
    // Acepta inputs viejos con acento ("Miércoles", "Sábado") y filtra falsy/inválidos.
    const DIAS_VALIDOS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
    const ACENTOS_LEGACY = { "Miércoles": "Miercoles", "Sábado": "Sabado" };

    const diasEnum = (Array.isArray(dias_pedido) ? dias_pedido : [])
      .map((d) => ACENTOS_LEGACY[d] || d)
      .filter((d) => DIAS_VALIDOS.includes(d));

    const item = await prisma.proveedor.create({
      data: {
        nombre: nombre.trim(),
        cuit: cuit || null,
        telefono: telefono || null,
        email: email || null,
        direccion: direccion || null,
        dias_pedido: diasEnum,
        activo: Boolean(activo),
        creadoEnLocalId,
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
