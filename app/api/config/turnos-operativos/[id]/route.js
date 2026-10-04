// app/api/config/turnos-operativos/[id]/route.js
//
// Renombrar o activar/desactivar UN turno del catálogo del local. No hay
// DELETE: una caja o una verificación pueden apuntarlo. Desactivado, deja de
// ofrecerse para abrir caja y la historia sigue leyéndose con su nombre.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { CODIGO_TURNO_OPERATIVO, idDeTurnoOperativo, validarNombreTurnoOperativo } from "@/lib/caja/turnoOperativo";
import { SELECT_TURNO_OPERATIVO } from "@/lib/caja/turnoOperativoServer";

export async function PATCH(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error, needsContexto: scope.needsContexto }, { status: scope.status });
    }
    if (!session.esAdmin && !checkPerm(session, "config_local.pos").ok) {
      return NextResponse.json({ ok: false, error: "Sin permiso: config_local.pos" }, { status: 403 });
    }

    const id = idDeTurnoOperativo((await params)?.id);
    const actual = id ? await prisma.turnoOperativo.findUnique({ where: { id }, select: SELECT_TURNO_OPERATIVO }) : null;
    // El de otro local se contesta igual que uno que no existe.
    if (!actual || actual.localId !== scope.localId) {
      return NextResponse.json({ ok: false, error: "Ese turno operativo no existe en este local.", codigo: CODIGO_TURNO_OPERATIVO.NO_EXISTE }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const data = {};
    if (body?.nombre !== undefined) {
      const nombre = validarNombreTurnoOperativo(body.nombre);
      if (!nombre.valido) {
        return NextResponse.json({ ok: false, error: nombre.error, codigo: CODIGO_TURNO_OPERATIVO.NOMBRE_INVALIDO }, { status: 400 });
      }
      data.nombre = nombre.nombre;
    }
    if (body?.activo !== undefined) {
      if (typeof body.activo !== "boolean") {
        return NextResponse.json({ ok: false, error: "«activo» es verdadero o falso." }, { status: 400 });
      }
      data.activo = body.activo;
    }
    if (!Object.keys(data).length) {
      return NextResponse.json({ ok: false, error: "No hay nada para cambiar: se cambia el nombre o si está activo." }, { status: 400 });
    }

    const turno = await prisma.turnoOperativo.update({ where: { id }, data, select: SELECT_TURNO_OPERATIVO });
    return NextResponse.json({ ok: true, turno });
  } catch (error) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya hay un turno con ese nombre en este local.", codigo: CODIGO_TURNO_OPERATIVO.NOMBRE_REPETIDO },
        { status: 409 }
      );
    }
    console.error("Error actualizando turno operativo:", error);
    return NextResponse.json({ ok: false, error: "No se pudo guardar el turno operativo." }, { status: 500 });
  }
}
