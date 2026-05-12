import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function POST(req, { params }) {
  try {
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, session } = scope;

    const perm = checkPerm(session, "listas_precios.editar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "ID invalido" }, { status: 400 });
    }

    const existente = await prisma.listaPrecio.findFirst({
      where: { id, grupoId },
      select: { id: true, activo: true, esDefault: true },
    });
    if (!existente) {
      return NextResponse.json({ ok: false, error: "Lista no encontrada" }, { status: 404 });
    }

    const nuevoActivo = !existente.activo;

    if (!nuevoActivo) {
      const clientesAsignados = await prisma.cliente.count({
        where: { listaPrecioId: id, grupoId },
      });
      if (clientesAsignados > 0) {
        return NextResponse.json(
          {
            ok: false,
            error: `No se puede desactivar: ${clientesAsignados} cliente(s) tienen esta lista asignada`,
          },
          { status: 400 }
        );
      }
    }

    // Si vamos a desactivar y es la default activa, validar que haya otra default activa disponible
    if (!nuevoActivo && existente.esDefault) {
      const otrasDefaults = await prisma.listaPrecio.count({
        where: { grupoId, esDefault: true, activo: true, id: { not: id } },
      });
      if (otrasDefaults === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "No se puede desactivar la unica lista default activa del grupo",
          },
          { status: 400 }
        );
      }
    }

    const data = { activo: nuevoActivo };
    // Reactivar: si sigue marcada default y ya hay otra default activa, evitar violacion del indice unico parcial
    if (nuevoActivo && existente.esDefault) {
      const otraDefaultActiva = await prisma.listaPrecio.findFirst({
        where: { grupoId, id: { not: id }, esDefault: true, activo: true },
        select: { id: true },
      });
      if (otraDefaultActiva) {
        data.esDefault = false;
      }
    }

    const upd = await prisma.listaPrecio.updateMany({
      where: { id, grupoId },
      data,
    });
    if (upd.count === 0) {
      return NextResponse.json({ ok: false, error: "Lista no encontrada" }, { status: 404 });
    }

    const lista = await prisma.listaPrecio.findFirst({
      where: { id, grupoId },
    });

    return NextResponse.json({ ok: true, lista });
  } catch (error) {
    console.error("Error toggle activo lista de precios:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
