// app/api/empleados/crear/route.js
//
// ALTA DE UN EMPLEADO en el local activo y, si maneja la caja, su operador
// —del mismo local—. Un empleado es de UN local: el local no se elige.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { SELECT_EMPLEADO, serializarEmpleado } from "@/lib/empleados/empleadosServer";
import {
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

    const nombre = leerNombre(body.nombre);
    if (nombre.error) return NextResponse.json({ ok: false, error: nombre.error }, { status: 400 });
    const op = leerOperadorId(body.operadorId);
    if (op.error) return NextResponse.json({ ok: false, error: op.error }, { status: 400 });

    if (op.operadorId) {
      const operador = await prisma.operadorLocal.findUnique({
        where: { id: op.operadorId },
        select: { id: true, localId: true, empleado: { select: { id: true } } },
      });
      if (!operador) return NextResponse.json({ ok: false, error: ERROR_OPERADOR_INEXISTENTE }, { status: 404 });
      if (!esDelLocal(operador, localId)) return NextResponse.json({ ok: false, error: ERROR_LOCAL_AJENO }, { status: 403 });
      if (operador.empleado) return NextResponse.json({ ok: false, error: ERROR_OPERADOR_OCUPADO }, { status: 409 });
    }

    // El nombre es único DENTRO del local: dos locales pueden tener un "Juan".
    const repetido = await prisma.empleado.findUnique({
      where: { localId_nombre: { localId, nombre: nombre.nombre } },
      select: { id: true },
    });
    if (repetido) return NextResponse.json({ ok: false, error: ERROR_EMPLEADO_REPETIDO }, { status: 409 });

    const creado = await prisma.empleado.create({
      data: {
        nombre: nombre.nombre,
        activo: body.activo === undefined ? true : Boolean(body.activo),
        operadorId: op.operadorId ?? null,
        localId,
      },
      select: SELECT_EMPLEADO,
    });
    return NextResponse.json({ ok: true, empleado: serializarEmpleado(creado) });
  } catch (e) {
    // El mismo nombre en el local, o el mismo operador, dados de alta a la vez.
    if (e?.code === "P2002") {
      const campos = String(e?.meta?.target ?? "");
      return NextResponse.json({ ok: false, error: campos.includes("operadorId") ? ERROR_OPERADOR_OCUPADO : ERROR_EMPLEADO_REPETIDO }, { status: 409 });
    }
    console.error("empleados/crear:", e);
    return NextResponse.json({ ok: false, error: `No se pudo crear el empleado: ${e.message}` }, { status: 500 });
  }
}
