// app/api/finanzas/sueldos/[gastoId]/route.js
//
// PATCH — ASIGNAR EL EMPLEADO A UN SUELDO VIEJO: uno cargado en Gastos con un
// nombre escrito a mano, de antes de que un sueldo exigiera empleado.
//
//   { empleadoId, modalidadSueldo }
//
// Completa esos dos datos y nada más: ni montos, ni pagos, ni la caja. Las
// reglas —empleado activo del local del gasto, quien asigna opera ese local,
// un sueldo ya asignado no se reasigna— las impone `asignarEmpleadoASueldo`.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { PERMISO_REGISTRAR_GASTOS } from "@/lib/finanzas/gastos";
import { ErrorGasto, alcanceDeGastos, asignarEmpleadoASueldo } from "@/lib/finanzas/gastosServer";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";

export async function PATCH(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    for (const p of [PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_GASTOS]) {
      const perm = checkPerm(session, p);
      if (!perm.ok) {
        return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
      }
    }
    const alcance = await alcanceDeGastos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const { gastoId } = await params;
    const body = await req.json().catch(() => ({}));
    const sueldo = await prisma.$transaction((tx) =>
      asignarEmpleadoASueldo(tx, {
        gastoId,
        empleadoId: body?.empleadoId,
        modalidadSueldo: body?.modalidadSueldo,
        localOperativoId: Number(alcance.vista.localId) || null,
        session,
      })
    );
    return NextResponse.json({ ok: true, sueldo });
  } catch (e) {
    if (e instanceof ErrorGasto) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[finanzas/sueldos PATCH]", e);
    return NextResponse.json({ ok: false, error: `No se pudo asignar el empleado: ${e.message}` }, { status: 500 });
  }
}
