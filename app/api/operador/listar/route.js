import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function GET(req) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto === true },
        { status: scope.status }
      );
    }

    const asignaciones = await prisma.operadorEnLocal.findMany({
      where: { localId: scope.localId, operador: { activo: true } },
      select: {
        operador: { select: { id: true, nombre: true } },
      },
      orderBy: { operador: { nombre: "asc" } },
    });

    const items = asignaciones.map((a) => a.operador);

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("operador/listar:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
