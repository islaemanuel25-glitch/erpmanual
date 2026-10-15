// app/api/empleados/listar-todos/route.js
//
// LA LISTA DE EMPLEADOS de Administración → Empleados. Mismo permiso y mismo
// alcance que Operadores: un no-admin ve los de SU local. Trae además los
// operadores que se le pueden asociar a un empleado: los del alcance que
// todavía no son de ninguno.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { SELECT_EMPLEADO, serializarEmpleado } from "@/lib/empleados/empleadosServer";

export async function GET(req) {
  try {
    const perm = requirePerm(req, "config_local.operadores");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }
    const session = perm.session;

    let porLocal = {};
    if (!session.esAdmin) {
      const propio = Number(session.localId) || 0;
      if (!propio) {
        return NextResponse.json({ ok: false, error: "Sin alcance autorizado." }, { status: 403 });
      }
      porLocal = { locales: { some: { localId: propio } } };
    }

    const [empleados, operadoresLibres] = await Promise.all([
      prisma.empleado.findMany({ where: porLocal, select: SELECT_EMPLEADO, orderBy: { nombre: "asc" } }),
      prisma.operadorLocal.findMany({
        where: { ...porLocal, empleado: null },
        select: { id: true, nombre: true },
        orderBy: { nombre: "asc" },
      }),
    ]);

    return NextResponse.json({ ok: true, items: empleados.map(serializarEmpleado), operadoresLibres });
  } catch (e) {
    console.error("empleados/listar-todos:", e);
    return NextResponse.json({ ok: false, error: `No se pudo cargar la lista de empleados: ${e.message}` }, { status: 500 });
  }
}
