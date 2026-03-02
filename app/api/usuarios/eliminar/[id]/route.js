import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

export async function DELETE(req, { params }) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

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
