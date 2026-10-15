// app/api/empleados/editar/route.js
//
// EDITAR UN EMPLEADO: nombre, activar o desactivar, y asociar o desasociar su
// operador (`operadorId: null`). Se edita desde SU local —el activo— y no se
// muda a otro: si trabaja en dos locales, son dos registros.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { SELECT_EMPLEADO, serializarEmpleado } from "@/lib/empleados/empleadosServer";
import {
  ERROR_EMPLEADO_INEXISTENTE,
  ERROR_EMPLEADO_REPETIDO,
  ERROR_LOCAL_AJENO,
  ERROR_NO_SE_MUDA,
  ERROR_OPERADOR_INEXISTENTE,
  ERROR_OPERADOR_OCUPADO,
  esDelLocal,
  leerNombre,
  leerOperadorId,
  pideOtroLocal,
} from "@/lib/empleados/empleados";

export async function POST(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error, needsContexto: scope.needsContexto === true }, { status: scope.status });
    }
    const localId = scope.localId;
    const body = await req.json().catch(() => ({}));
    if (pideOtroLocal(body)) return NextResponse.json({ ok: false, error: ERROR_NO_SE_MUDA }, { status: 400 });

    const id = Number(body.id);
    const empleado = Number.isInteger(id) && id > 0
      ? await prisma.empleado.findUnique({ where: { id }, select: { id: true, localId: true } })
      : null;
    if (!empleado) return NextResponse.json({ ok: false, error: ERROR_EMPLEADO_INEXISTENTE }, { status: 404 });
    if (!esDelLocal(empleado, localId)) return NextResponse.json({ ok: false, error: ERROR_LOCAL_AJENO }, { status: 403 });

    const data = {};
    if (body.nombre !== undefined && body.nombre !== null) {
      const nombre = leerNombre(body.nombre);
      if (nombre.error) return NextResponse.json({ ok: false, error: nombre.error }, { status: 400 });
      const repetido = await prisma.empleado.findFirst({
        where: { localId, nombre: nombre.nombre, id: { not: empleado.id } },
        select: { id: true },
      });
      if (repetido) return NextResponse.json({ ok: false, error: ERROR_EMPLEADO_REPETIDO }, { status: 409 });
      data.nombre = nombre.nombre;
    }
    if (body.activo !== undefined) data.activo = Boolean(body.activo);

    const op = leerOperadorId(body.operadorId);
    if (op.error) return NextResponse.json({ ok: false, error: op.error }, { status: 400 });
    if (op.operadorId) {
      const operador = await prisma.operadorLocal.findUnique({
        where: { id: op.operadorId },
        select: { id: true, localId: true, empleado: { select: { id: true } } },
      });
      if (!operador) return NextResponse.json({ ok: false, error: ERROR_OPERADOR_INEXISTENTE }, { status: 404 });
      if (!esDelLocal(operador, localId)) return NextResponse.json({ ok: false, error: ERROR_LOCAL_AJENO }, { status: 403 });
      if (operador.empleado && operador.empleado.id !== empleado.id) {
        return NextResponse.json({ ok: false, error: ERROR_OPERADOR_OCUPADO }, { status: 409 });
      }
    }
    if (op.operadorId !== undefined) data.operadorId = op.operadorId;

    const actualizado = await prisma.empleado.update({ where: { id: empleado.id }, data, select: SELECT_EMPLEADO });
    return NextResponse.json({ ok: true, empleado: serializarEmpleado(actualizado) });
  } catch (e) {
    if (e?.code === "P2002") {
      const campos = String(e?.meta?.target ?? "");
      return NextResponse.json({ ok: false, error: campos.includes("operadorId") ? ERROR_OPERADOR_OCUPADO : ERROR_EMPLEADO_REPETIDO }, { status: 409 });
    }
    console.error("empleados/editar:", e);
    return NextResponse.json({ ok: false, error: `No se pudo guardar el empleado: ${e.message}` }, { status: 500 });
  }
}
