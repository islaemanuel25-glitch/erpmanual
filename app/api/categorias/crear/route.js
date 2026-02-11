// app/api/categorias/crear/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

// Helper para parsear booleanos robustamente
function parseBoolean(value, defaultValue = true) {
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
    let { nombre, activo = true } = body;
    
    // Debug: log del valor recibido
    console.log("🔍 CREAR - activo recibido:", activo, "tipo:", typeof activo);

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
        { status: 409 }
      );
    }

    // Parsear activo robustamente
    const activoParsed = parseBoolean(activo, true);
    console.log("🔍 CREAR - activo parseado:", activoParsed);

    const nueva = await prisma.categoria.create({
      data: {
        nombre,
        activo: activoParsed,
      },
    });

    return NextResponse.json({
      ok: true,
      item: nueva,
    });
  } catch (e) {
    console.error("ERROR /api/categorias/crear:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno al crear categoría" },
      { status: 500 }
    );
  }
}
