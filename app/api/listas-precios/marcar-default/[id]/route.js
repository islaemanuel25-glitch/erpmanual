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

    if (!existente.activo) {
      return NextResponse.json(
        { ok: false, error: "No se puede marcar como default una lista inactiva" },
        { status: 400 }
      );
    }

    if (existente.esDefault) {
      return NextResponse.json({ ok: true, lista: existente, sinCambios: true });
    }

    await prisma.$transaction(async (tx) => {
      await tx.listaPrecio.updateMany({
        where: { grupoId, esDefault: true, id: { not: id } },
        data: { esDefault: false },
      });
      const upd = await tx.listaPrecio.updateMany({
        where: { id, grupoId, activo: true },
        data: { esDefault: true },
      });
      if (upd.count === 0) {
        throw Object.assign(new Error("Lista no encontrada"), { status: 404 });
      }
    });

    const lista = await prisma.listaPrecio.findFirst({
      where: { id, grupoId },
    });

    return NextResponse.json({ ok: true, lista });
  } catch (error) {
    if (error?.status === 404) {
      return NextResponse.json({ ok: false, error: "Lista no encontrada" }, { status: 404 });
    }
    console.error("Error marcando default lista de precios:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
