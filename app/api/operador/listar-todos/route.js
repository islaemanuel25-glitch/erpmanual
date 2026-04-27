import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const perm = requirePerm(req, "usuarios.gestionar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const operadores = await prisma.operadorLocal.findMany({
      select: {
        id: true,
        nombre: true,
        activo: true,
        createdAt: true,
        locales: {
          select: { localId: true, local: { select: { id: true, nombre: true } } },
        },
      },
      orderBy: { nombre: "asc" },
    });

    const items = operadores.map((op) => ({
      id: op.id,
      nombre: op.nombre,
      activo: op.activo,
      createdAt: op.createdAt,
      locales: op.locales.map((l) => l.local),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("operador/listar-todos:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
