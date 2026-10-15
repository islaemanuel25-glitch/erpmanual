// app/api/empleados/editar/route.js
//
// EDITAR UN EMPLEADO: nombre, activar o desactivar, sus locales, y asociar o
// desasociar su operador (`operadorId: null`). Mismo alcance que Operadores:
// un no-admin solo toca empleados de SU local y no reescribe los locales de
// uno que trabaja también en otros.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { SELECT_EMPLEADO, serializarEmpleado } from "@/lib/empleados/empleadosServer";
import {
  ERROR_EMPLEADO_AJENO,
  ERROR_EMPLEADO_INEXISTENTE,
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

    const id = Number(body.id);
    const empleado = Number.isInteger(id) && id > 0
      ? await prisma.empleado.findUnique({ where: { id }, select: { id: true, locales: { select: { localId: true } } } })
      : null;
    if (!empleado) return NextResponse.json({ ok: false, error: ERROR_EMPLEADO_INEXISTENTE }, { status: 404 });

    const localesActuales = empleado.locales.map((l) => l.localId);
    if (!session.esAdmin) {
      const propio = Number(session.localId) || 0;
      if (!propio || !localesActuales.includes(propio)) {
        return NextResponse.json({ ok: false, error: ERROR_EMPLEADO_AJENO }, { status: 403 });
      }
    }

    const data = {};
    if (body.nombre !== undefined && body.nombre !== null) {
      const nombre = leerNombre(body.nombre);
      if (nombre.error) return NextResponse.json({ ok: false, error: nombre.error }, { status: 400 });
      data.nombre = nombre.nombre;
    }
    if (body.activo !== undefined) data.activo = Boolean(body.activo);

    const op = leerOperadorId(body.operadorId);
    if (op.error) return NextResponse.json({ ok: false, error: op.error }, { status: 400 });
    if (op.operadorId) {
      const operador = await prisma.operadorLocal.findUnique({
        where: { id: op.operadorId },
        select: { id: true, empleado: { select: { id: true } }, locales: { select: { localId: true } } },
      });
      if (!operador) return NextResponse.json({ ok: false, error: ERROR_OPERADOR_INEXISTENTE }, { status: 404 });
      if (!operadorEnAlcance(operador, session)) return NextResponse.json({ ok: false, error: ERROR_LOCAL_AJENO }, { status: 403 });
      if (operador.empleado && operador.empleado.id !== empleado.id) {
        return NextResponse.json({ ok: false, error: ERROR_OPERADOR_OCUPADO }, { status: 409 });
      }
    }
    if (op.operadorId !== undefined) data.operadorId = op.operadorId;

    // Los locales: un admin los reasigna enteros; un no-admin no reescribe la
    // membresía de un empleado que trabaja también en otro local.
    let localIds = null;
    if (Array.isArray(body.localIds)) {
      const alcance = localesEnAlcance(body.localIds, session);
      if (alcance.error) return NextResponse.json({ ok: false, error: alcance.error }, { status: alcance.status });
      if (session.esAdmin) localIds = alcance.localIds;
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      await tx.empleado.update({ where: { id: empleado.id }, data });
      if (localIds) {
        await tx.empleadoEnLocal.deleteMany({ where: { empleadoId: empleado.id } });
        await tx.empleadoEnLocal.createMany({ data: localIds.map((localId) => ({ empleadoId: empleado.id, localId })) });
      }
      return tx.empleado.findUnique({ where: { id: empleado.id }, select: SELECT_EMPLEADO });
    });
    return NextResponse.json({ ok: true, empleado: serializarEmpleado(actualizado) });
  } catch (e) {
    if (e?.code === "P2002") return NextResponse.json({ ok: false, error: ERROR_OPERADOR_OCUPADO }, { status: 409 });
    console.error("empleados/editar:", e);
    return NextResponse.json({ ok: false, error: `No se pudo guardar el empleado: ${e.message}` }, { status: 500 });
  }
}
