import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

export async function POST(req) {
  try {
    const perm = requirePerm(req, "usuarios.gestionar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const body = await req.json();
    const { nombre, pin, localIds } = body;

    if (!nombre || typeof nombre !== "string" || nombre.trim().length < 2) {
      return NextResponse.json({ ok: false, error: "El nombre debe tener al menos 2 caracteres." }, { status: 400 });
    }
    if (!pin || String(pin).length < 4) {
      return NextResponse.json({ ok: false, error: "El PIN debe tener al menos 4 dígitos." }, { status: 400 });
    }
    if (!Array.isArray(localIds) || localIds.length === 0) {
      return NextResponse.json({ ok: false, error: "Seleccioná al menos un local." }, { status: 400 });
    }

    const nombreNorm = nombre.trim();

    const existente = await prisma.operadorLocal.findUnique({
      where: { nombre: nombreNorm },
    });
    if (existente) {
      return NextResponse.json({ ok: false, error: "Ya existe un operador con ese nombre." }, { status: 409 });
    }

    const pinHash = await bcrypt.hash(String(pin), 10);

    const operador = await prisma.operadorLocal.create({
      data: { nombre: nombreNorm, pinHash },
      select: { id: true, nombre: true, activo: true, createdAt: true },
    });

    await prisma.operadorEnLocal.createMany({
      data: localIds.map((lid) => ({ operadorId: operador.id, localId: Number(lid) })),
    });

    return NextResponse.json({ ok: true, operador });
  } catch (e) {
    console.error("operador/crear:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
