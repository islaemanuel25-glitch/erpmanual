import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function DELETE(req, { params }) {
  try {
    const scope = await resolveGrupo(req, false);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, session } = scope;

    const perm = checkPerm(session, "listas_precios.eliminar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id: idParam } = await params;
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "ID invalido" }, { status: 400 });
    }

    const existente = await prisma.listaPrecio.findFirst({
      where: { id, grupoId },
      select: { id: true, esDefault: true, activo: true },
    });
    if (!existente) {
      return NextResponse.json({ ok: false, error: "Lista no encontrada" }, { status: 404 });
    }

    // Validar: no eliminar si tiene clientes asignados (mismo grupo operativo)
    const clientesAsignados = await prisma.cliente.count({
      where: { listaPrecioId: id, grupoId },
    });
    if (clientesAsignados > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `No se puede eliminar: ${clientesAsignados} cliente(s) tienen esta lista asignada`,
        },
        { status: 400 }
      );
    }

    // Validar: no eliminar la default activa unica del grupo
    if (existente.esDefault && existente.activo) {
      const otrasDefaults = await prisma.listaPrecio.count({
        where: { grupoId, esDefault: true, activo: true, id: { not: id } },
      });
      if (otrasDefaults === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "No se puede eliminar la unica lista default activa del grupo",
          },
          { status: 400 }
        );
      }
    }

    // Soft delete — atómico con grupoId para no afectar otro tenant si hubiera colisión de id
    const upd = await prisma.listaPrecio.updateMany({
      where: { id, grupoId },
      data: { activo: false },
    });
    if (upd.count === 0) {
      return NextResponse.json({ ok: false, error: "Lista no encontrada" }, { status: 404 });
    }

    const lista = await prisma.listaPrecio.findFirst({
      where: { id, grupoId },
    });

    return NextResponse.json({ ok: true, lista });
  } catch (error) {
    console.error("Error eliminando lista de precios:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
