import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { autorizarGestionUsuarios, dentroDeAlcance } from "@/lib/usuarios/gestion";

export async function DELETE(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    const auth = autorizarGestionUsuarios(session);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const userId = Number(id);

    if (!Number.isFinite(userId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const objetivo = await prisma.usuario.findUnique({
      where: { id: userId },
      select: { id: true, localId: true },
    });
    if (!objetivo) {
      return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    // Scope: un gestor por-local solo desactiva usuarios de SU local (ajeno → 403).
    if (auth.viaLocal && !dentroDeAlcance(auth, objetivo.localId)) {
      return NextResponse.json({ ok: false, error: "Usuario fuera de tu alcance." }, { status: 403 });
    }

    await prisma.usuario.update({
      where: { id: userId },
      data: { activo: false },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("❌ usuarios/eliminar", e);
    return NextResponse.json(
      { ok: false, error: "Error al eliminar usuario." },
      { status: 500 }
    );
  }
}
