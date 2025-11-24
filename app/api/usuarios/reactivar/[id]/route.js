import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(req, context) {
  try {
    const { id } = await context.params;   // ⬅️ FIX obligatorio
    const userId = Number(id);

    if (!userId || Number.isNaN(userId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido." },
        { status: 400 }
      );
    }

    const usuario = await prisma.usuario.update({
      where: { id: userId },
      data: { activo: true },
      include: { rol: true, local: true },
    });

    return NextResponse.json({ ok: true, usuario }, { status: 200 });
  } catch (e) {
    if (e?.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    console.error("usuarios/reactivar", e);
    return NextResponse.json(
      { ok: false, error: "Error al reactivar usuario." },
      { status: 500 }
    );
  }
}
