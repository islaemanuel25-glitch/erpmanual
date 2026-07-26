import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }
    const session = perm.session;

    // Scope: un no-admin solo ve los operadores de SU local.
    let where = {};
    if (!session.esAdmin) {
      const propio = Number(session.localId) || 0;
      if (!propio) {
        return NextResponse.json({ ok: false, error: "Sin alcance autorizado." }, { status: 403 });
      }
      where = { locales: { some: { localId: propio } } };
    }

    const operadores = await prisma.operadorLocal.findMany({
      where,
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
