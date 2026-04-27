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
    const { id, nombre, pin, activo, localIds } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID requerido." }, { status: 400 });
    }

    const operador = await prisma.operadorLocal.findUnique({
      where: { id: Number(id) },
    });
    if (!operador) {
      return NextResponse.json({ ok: false, error: "Operador no encontrado." }, { status: 404 });
    }

    const data = {};

    if (nombre !== undefined && nombre !== null) {
      const nombreNorm = String(nombre).trim();
      if (nombreNorm.length < 2) {
        return NextResponse.json({ ok: false, error: "El nombre debe tener al menos 2 caracteres." }, { status: 400 });
      }
      const dup = await prisma.operadorLocal.findFirst({
        where: { nombre: nombreNorm, id: { not: operador.id } },
      });
      if (dup) {
        return NextResponse.json({ ok: false, error: "Ya existe otro operador con ese nombre." }, { status: 409 });
      }
      data.nombre = nombreNorm;
    }

    if (pin !== undefined && pin !== null && pin !== "") {
      if (String(pin).length < 4) {
        return NextResponse.json({ ok: false, error: "El PIN debe tener al menos 4 dígitos." }, { status: 400 });
      }
      data.pinHash = await bcrypt.hash(String(pin), 10);
    }

    if (activo !== undefined) {
      data.activo = Boolean(activo);
    }

    await prisma.operadorLocal.update({
      where: { id: operador.id },
      data,
    });

    if (Array.isArray(localIds)) {
      await prisma.operadorEnLocal.deleteMany({ where: { operadorId: operador.id } });
      if (localIds.length > 0) {
        await prisma.operadorEnLocal.createMany({
          data: localIds.map((lid) => ({ operadorId: operador.id, localId: Number(lid) })),
        });
      }
    }

    const updated = await prisma.operadorLocal.findUnique({
      where: { id: operador.id },
      select: {
        id: true,
        nombre: true,
        activo: true,
        locales: { select: { local: { select: { id: true, nombre: true } } } },
      },
    });

    return NextResponse.json({
      ok: true,
      operador: {
        ...updated,
        locales: updated.locales.map((l) => l.local),
      },
    });
  } catch (e) {
    console.error("operador/editar:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
