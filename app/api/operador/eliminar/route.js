import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { ERROR_LOCAL_AJENO, esDelLocal } from "@/lib/empleados/empleados";

export async function POST(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // Se elimina desde SU local, el activo.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error, needsContexto: scope.needsContexto === true }, { status: scope.status });
    }

    const body = await req.json().catch(() => ({}));
    const { id } = body;

    if (!id) {
      return NextResponse.json({ ok: false, error: "ID requerido." }, { status: 400 });
    }

    const operador = await prisma.operadorLocal.findUnique({
      where: { id: Number(id) },
      select: { id: true, localId: true },
    });
    if (!operador) {
      return NextResponse.json({ ok: false, error: "Operador no encontrado." }, { status: 404 });
    }
    if (!esDelLocal(operador, scope.localId)) {
      return NextResponse.json({ ok: false, error: ERROR_LOCAL_AJENO }, { status: 403 });
    }

    await prisma.operadorLocal.delete({ where: { id: operador.id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("operador/eliminar:", e);
    return NextResponse.json({ ok: false, error: `No se pudo eliminar el operador: ${e.message}` }, { status: 500 });
  }
}
