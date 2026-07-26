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

    // Scope: un no-admin solo ve SU local como destino de asignación.
    const where = { activo: true };
    if (!session.esAdmin) {
      const propio = Number(session.localId) || 0;
      if (!propio) {
        return NextResponse.json({ ok: false, error: "Sin alcance autorizado." }, { status: 403 });
      }
      where.id = propio;
    }

    const locales = await prisma.local.findMany({
      where,
      select: { id: true, nombre: true, es_deposito: true },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, locales });
  } catch (e) {
    console.error("operador/locales:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
