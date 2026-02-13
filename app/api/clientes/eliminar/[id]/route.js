import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function DELETE(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Obtener grupoId del usuario
    let grupoId = session.grupoId;
    if (!grupoId && session.localId) {
      const gl = await prisma.grupoLocal.findFirst({
        where: { localId: session.localId },
        select: { grupoId: true },
      });
      grupoId = gl?.grupoId;
    }

    // Desactivar (no eliminar fisicamente)
    const cliente = await prisma.cliente.update({
      where: { id: Number(id), grupoId },
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
