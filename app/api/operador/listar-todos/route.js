import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function GET(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // Los operadores del local ACTIVO, sea admin o no: cada uno es de un local.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error, needsContexto: scope.needsContexto === true }, { status: scope.status });
    }

    const items = await prisma.operadorLocal.findMany({
      where: { localId: scope.localId },
      select: { id: true, nombre: true, activo: true, localId: true, createdAt: true },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("operador/listar-todos:", e);
    return NextResponse.json({ ok: false, error: `No se pudo cargar la lista de operadores: ${e.message}` }, { status: 500 });
  }
}
