import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { requireAdmin } from "@/lib/authorize";

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
    let { nombre, descripcion = null, tipo = null, activo = true } = body;

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

    const existe = await prisma.areaFisica.findFirst({
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
        { ok: false, error: "Ya existe un área física con ese nombre" },
        { status: 409 }
      );
    }

    const descripcionFinal =
      typeof descripcion === "string" && descripcion.trim().length > 0
        ? descripcion.trim()
        : null;
    const tipoFinal =
      typeof tipo === "string" && tipo.trim().length > 0 ? tipo.trim() : null;
    const activoParsed = parseBoolean(activo, true);

    const nueva = await prisma.areaFisica.create({
      data: {
        nombre,
        descripcion: descripcionFinal,
        tipo: tipoFinal,
        activo: activoParsed,
      },
    });

    return NextResponse.json({
      ok: true,
      item: nueva,
    });
  } catch (e) {
    console.error("ERROR /api/areas-fisicas/crear:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno al crear área física" },
      { status: 500 }
    );
  }
}
