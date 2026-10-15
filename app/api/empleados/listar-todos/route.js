// app/api/empleados/listar-todos/route.js
//
// LA LISTA DE EMPLEADOS de Administración → Empleados: los del local ACTIVO,
// sea admin o no. Trae además los operadores que se le pueden asociar a un
// empleado: los del mismo local que todavía no son de ninguno.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { SELECT_EMPLEADO, serializarEmpleado } from "@/lib/empleados/empleadosServer";

export async function GET(req) {
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

    const [empleados, operadoresLibres] = await Promise.all([
      prisma.empleado.findMany({ where: { localId }, select: SELECT_EMPLEADO, orderBy: { nombre: "asc" } }),
      prisma.operadorLocal.findMany({
        where: { localId, empleado: null },
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
