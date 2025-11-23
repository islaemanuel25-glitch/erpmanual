import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function DELETE(req, context) {
  try {
    const { id } = context.params;          // ✅ corregido (sin await)
    const userId = Number(id);

    if (!userId || Number.isNaN(userId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido." },
        { status: 400 }
      );
    }

    // ✅ Verificar si existe
    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      include: { rol: true },
    });

    if (!usuario) {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    // ✅ Protección: NO permitir eliminar Admin global
    if (usuario.rol?.nombre === "Admin") {
      return NextResponse.json(
        { ok: false, error: "No se puede eliminar el usuario administrador." },
        { status: 403 }
      );
    }

    // ✅ Desactivar
    const eliminado = await prisma.usuario.update({
      where: { id: userId },
      data: { activo: false },
      include: { rol: true, local: true },
    });

    return NextResponse.json(
      { ok: true, usuario: eliminado },
      { status: 200 }
    );
  } catch (e) {
    if (e?.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    console.error("❌ usuarios/eliminar", e);

    return NextResponse.json(
      { ok: false, error: "Error al eliminar usuario." },
      { status: 500 }
    );
  }
}
