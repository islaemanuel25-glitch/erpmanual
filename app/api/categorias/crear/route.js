// app/api/categorias/crear/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req) {
  try {
    const body = await req.json();
    let { nombre, activo = true } = body;

    if (!nombre || typeof nombre !== "string") {
      return NextResponse.json(
        { ok: false, error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    nombre = nombre.trim();

    if (nombre.length < 2) {
      return NextResponse.json(
        { ok: false, error: "El nombre es demasiado corto" },
        { status: 400 }
      );
    }

    // =====================================
    // 🔍 Validar duplicado case-insensitive
    // =====================================
    const existe = await prisma.categoria.findFirst({
      where: {
        nombre: {
          equals: nombre,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (existe) {
      return NextResponse.json(
        { ok: false, error: "Ya existe una categoría con ese nombre" },
        { status: 400 }
      );
    }

    // =====================================
    // 🟢 Crear categoría
    // =====================================
    const nueva = await prisma.categoria.create({
      data: { nombre, activo: Boolean(activo) },
    });

    return NextResponse.json({ ok: true, item: nueva });

  } catch (e) {
    console.error("ERROR /api/categorias/crear", e);
    return NextResponse.json(
      { ok: false, error: "Error al crear categoría" },
      { status: 500 }
    );
  }
}
