import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(req, { params }) {
  try {
    console.log("🔌 DATABASE_URL =", process.env.DATABASE_URL);

    const { id } = await params;
    console.log("🧨 ELIMINAR params.id =", id, "type:", typeof id);

    const userId = Number(id);

    if (!Number.isFinite(userId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const result = await prisma.usuario.updateMany({
      where: { id: userId },
      data: { activo: false },
    });

    if (result.count === 0) {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("❌ usuarios/eliminar", e);
    return NextResponse.json(
      { ok: false, error: "Error al eliminar usuario." },
      { status: 500 }
    );
  }
}
