import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

// GET /api/clientes/tags?localId=...
// Las etiquetas llevan el DESCUENTO por segmento, así que son política comercial
// del local y no un catálogo cualquiera. Sus dos consumidores —la pantalla de
// clientes y la de analytics— se cierran las dos con `clientes.ver`, que es el
// permiso de ese módulo en el registro del menú.
//
// Contado contra los roles de producción: lo tienen ENCARGADO, Admin, Deposito y
// DUEÑO_LOCAL —4 usuarios activos—. No lo tienen CAJERO ni Mini, y ninguno de los
// dos puede abrir esas pantallas tampoco, así que no se rompe ninguna.
const PERMISO_VER_TAGS = "clientes.ver";

export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const permiso = checkPerm(scope.session, PERMISO_VER_TAGS);
    if (!permiso.ok) {
      return NextResponse.json(
        { ok: false, error: permiso.error },
        { status: permiso.status }
      );
    }

    const { localId } = scope;

    const tags = await prisma.tagCliente.findMany({
      where: { localId },
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        descuentoPorcentaje: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, items: tags });
  } catch (error) {
    console.error("Error obteniendo tags:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// POST /api/clientes/tags (crear tag)
export async function POST(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { localId, session } = scope;

    const perm = checkPerm(session, "clientes.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { nombre, descuentoPorcentaje } = await req.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const tag = await prisma.tagCliente.create({
      data: {
        localId,
        nombre: nombre.trim(),
        descuentoPorcentaje: descuentoPorcentaje !== "" && descuentoPorcentaje != null ? Number(descuentoPorcentaje) : null,
      },
      select: {
        id: true,
        nombre: true,
        descuentoPorcentaje: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ ok: true, item: tag });
  } catch (error) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe una etiqueta con ese nombre en este local" },
        { status: 409 }
      );
    }
    console.error("Error creando tag:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

