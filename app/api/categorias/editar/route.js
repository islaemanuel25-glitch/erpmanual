// app/api/categorias/editar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(req) {
  try {
    const body = await req.json();
    let { id, nombre, activo } = body;

    // ================================
    // 🔍 Validación básica
    // ================================
    id = Number(id);
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

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
    // 🔍 Verificar que exista
    // ================================
    const categoria = await prisma.categoria.findUnique({
      where: { id },
    });

    if (!categoria) {
      return NextResponse.json(
        { ok: false, error: "Categoría no encontrada" },
        { status: 404 }
      );
    }

    // ================================
    // 🔍 Duplicado case-insensitive
    // Ignora la categoría actual
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
        { status: 400 }
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

    return NextResponse.json({ ok: true, item: actualizada });

  } catch (e) {
    console.error("ERROR /api/categorias/editar", e);
    return NextResponse.json(
      { ok: false, error: "Error al editar categoría" },
      { status: 500 }
    );
  }
}
