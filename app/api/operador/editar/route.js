import { NextResponse } from "next/server";
import bcrypt from "bcrypt";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { ERROR_LOCAL_AJENO, ERROR_NO_SE_MUDA, ERROR_OPERADOR_REPETIDO, esDelLocal, pideOtroLocal } from "@/lib/empleados/empleados";

export async function POST(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    // Se edita desde SU local, el activo; y no se muda a otro.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error, needsContexto: scope.needsContexto === true }, { status: scope.status });
    }

    const body = await req.json().catch(() => ({}));
    if (pideOtroLocal(body)) {
      return NextResponse.json({ ok: false, error: ERROR_NO_SE_MUDA }, { status: 400 });
    }
    const { id, nombre, pin, activo } = body;

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

    const data = {};

    if (nombre !== undefined && nombre !== null) {
      const nombreNorm = String(nombre).trim();
      if (nombreNorm.length < 2) {
        return NextResponse.json({ ok: false, error: "El nombre debe tener al menos 2 caracteres." }, { status: 400 });
      }
      const dup = await prisma.operadorLocal.findFirst({
        where: { localId: operador.localId, nombre: nombreNorm, id: { not: operador.id } },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json({ ok: false, error: ERROR_OPERADOR_REPETIDO }, { status: 409 });
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

    const updated = await prisma.operadorLocal.update({
      where: { id: operador.id },
      data,
      select: { id: true, nombre: true, activo: true, localId: true },
    });

    return NextResponse.json({ ok: true, operador: updated });
  } catch (e) {
    if (e?.code === "P2002") {
      return NextResponse.json({ ok: false, error: ERROR_OPERADOR_REPETIDO }, { status: 409 });
    }
    console.error("operador/editar:", e);
    return NextResponse.json({ ok: false, error: `No se pudo guardar el operador: ${e.message}` }, { status: 500 });
  }
}
