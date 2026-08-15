import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";

// Devuelve los NOMBRES de los operarios del local. Las otras cinco rutas de
// `operador/` piden `config_local.operadores`, pero acá no alcanza con ése: el
// selector de operario del POS y la pantalla de bloqueo también la llaman, y
// quien opera la caja no administra operarios.
//
// Va `pos.usar` al lado, que es exactamente el caso para el que `requirePerm`
// acepta varios —la misma forma que `clientes/buscar`, que se abre con
// `clientes.ver` o `pos.usar`—.
const PERMISO_VER_OPERADORES = ["config_local.operadores", "pos.usar"];

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_VER_OPERADORES);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto === true },
        { status: scope.status }
      );
    }

    const asignaciones = await prisma.operadorEnLocal.findMany({
      where: { localId: scope.localId, operador: { activo: true } },
      select: {
        operador: { select: { id: true, nombre: true } },
      },
      orderBy: { operador: { nombre: "asc" } },
    });

    const items = asignaciones.map((a) => a.operador);

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    console.error("operador/listar:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
