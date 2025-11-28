// app/api/categorias/editar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(req) {
  try {
    const body = await req.json();
    let { id, nombre, activo } = body;

    // ================================
    // 🟠 Validación ID
    // ================================
    id = Number(id);
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // ================================
    // 🟠 Validación nombre
    // ================================
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

    // ================================
    // 🔍 Verificar existencia
    // ================================
    const categoria = await prisma.categoria.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!categoria) {
      return NextResponse.json(
        { ok: false, error: "Categoría no encontrada" },
        { status: 404 }
      );
    }

    // ================================
    // 🔍 Duplicado ignorando la actual
    // ================================
    const duplicado = await prisma.categoria.findFirst({
      where: {
        id: { not: id },
        nombre: {
          equals: nombre,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (duplicado) {
      return NextResponse.json(
        { ok: false, error: "Ya existe otra categoría con ese nombre" },
        { status: 409 }
      );
    }

    // ================================
    // 🟢 Actualizar
    // ================================
    const actualizada = await prisma.categoria.update({
      where: { id },
      data: {
        nombre,
        activo: Boolean(activo),
      },
    });

    return NextResponse.json({
      ok: true,
      item: actualizada,
    });

  } catch (e) {
    console.error("ERROR /api/categorias/editar:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno al editar categoría" },
      { status: 500 }
    );
  }
}
