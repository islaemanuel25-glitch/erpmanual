// app/api/categorias/editar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

// Helper para parsear booleanos robustamente
function parseBoolean(value, defaultValue = null) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "1" || v === "si" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
  }
  return defaultValue;
}

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
    let { id, nombre, activo } = body;
    
    // Debug: log del valor recibido
    console.log("🔍 EDITAR - activo recibido:", activo, "tipo:", typeof activo);

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

    const categoria = await prisma.categoria.findUnique({
      where: { id },
      select: { id: true, activo: true },
    });

    if (!categoria) {
      return NextResponse.json(
        { ok: false, error: "Categoría no encontrada" },
        { status: 404 }
      );
    }

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

    // Parsear activo: si viene undefined/null, mantener el valor actual
    const activoParsed = activo !== undefined && activo !== null 
      ? parseBoolean(activo, categoria.activo)
      : categoria.activo;
    
    console.log("🔍 EDITAR - activo actual:", categoria.activo, "activo parseado:", activoParsed);

    const actualizada = await prisma.categoria.update({
      where: { id },
      data: {
        nombre,
        activo: activoParsed,
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
