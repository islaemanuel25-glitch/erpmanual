// app/api/empleados/crear/route.js
//
// ALTA DE UN EMPLEADO, con sus locales y, si maneja la caja, su operador.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { SELECT_EMPLEADO, serializarEmpleado } from "@/lib/empleados/empleadosServer";
import {
  ERROR_LOCAL_AJENO,
  ERROR_OPERADOR_INEXISTENTE,
  operadorEnAlcance,
  ERROR_OPERADOR_OCUPADO,
  leerNombre,
  leerOperadorId,
  localesEnAlcance,
} from "@/lib/empleados/empleados";

export async function POST(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }
    const session = perm.session;
    const body = await req.json().catch(() => ({}));

    const nombre = leerNombre(body.nombre);
    if (nombre.error) return NextResponse.json({ ok: false, error: nombre.error }, { status: 400 });
    const alcance = localesEnAlcance(body.localIds, session);
    if (alcance.error) return NextResponse.json({ ok: false, error: alcance.error }, { status: alcance.status });
    const op = leerOperadorId(body.operadorId);
    if (op.error) return NextResponse.json({ ok: false, error: op.error }, { status: 400 });

    if (op.operadorId) {
      const operador = await prisma.operadorLocal.findUnique({
        where: { id: op.operadorId },
        select: { id: true, empleado: { select: { id: true } }, locales: { select: { localId: true } } },
      });
      if (!operador) return NextResponse.json({ ok: false, error: ERROR_OPERADOR_INEXISTENTE }, { status: 404 });
      if (!operadorEnAlcance(operador, session)) return NextResponse.json({ ok: false, error: ERROR_LOCAL_AJENO }, { status: 403 });
      if (operador.empleado) return NextResponse.json({ ok: false, error: ERROR_OPERADOR_OCUPADO }, { status: 409 });
    }

    const creado = await prisma.empleado.create({
      data: {
        nombre: nombre.nombre,
        activo: body.activo === undefined ? true : Boolean(body.activo),
        operadorId: op.operadorId ?? null,
        locales: { create: alcance.localIds.map((localId) => ({ localId })) },
      },
      select: SELECT_EMPLEADO,
    });
    return NextResponse.json({ ok: true, empleado: serializarEmpleado(creado) });
  } catch (e) {
    if (e?.code === "P2002") return NextResponse.json({ ok: false, error: ERROR_OPERADOR_OCUPADO }, { status: 409 });
    console.error("empleados/crear:", e);
    return NextResponse.json({ ok: false, error: `No se pudo crear el empleado: ${e.message}` }, { status: 500 });
  }
}
