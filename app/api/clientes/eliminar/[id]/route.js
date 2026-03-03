import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { checkPerm } from "@/lib/authorize";

export async function DELETE(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId, session } = scope;

    const perm = checkPerm(session, "clientes.eliminar");
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const { id } = await params;

    const clienteExistente = await prisma.cliente.findFirst({
      where: { id: Number(id), localId, grupoId },
      select: { id: true },
    });

    if (!clienteExistente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado para este local" },
        { status: 404 }
      );
    }

    // Desactivar (no eliminar fisicamente)
    const cliente = await prisma.cliente.update({
      where: { id: Number(id), localId: Number(localId) },
      data: { activo: false },
    });

    return NextResponse.json({ ok: true, cliente });
  } catch (error) {
    console.error("Error desactivando cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
