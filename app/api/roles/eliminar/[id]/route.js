import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(req, context) {
  try {
    const { id } = await context.params; // ✅ Next 15
    const rolId = Number(id);

    if (!rolId || Number.isNaN(rolId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    await prisma.rol.delete({
      where: { id: rolId }
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (e.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "Rol no encontrado o en uso" },
        { status: 409 }
      );
    }

    console.error("roles/eliminar", e);
    return NextResponse.json(
      { ok: false, error: "Error al eliminar rol" },
      { status: 500 }
    );
  }
}
