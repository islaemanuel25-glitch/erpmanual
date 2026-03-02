import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

export async function GET(req) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!id || Number.isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido." },
        { status: 400 }
      );
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id },
      include: { rol: true, local: true },
    });

    if (!usuario) {
      return NextResponse.json(
        { ok: false, error: "Usuario no encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, usuario }, { status: 200 });
  } catch (e) {
    console.error("usuarios/obtener", e);
    return NextResponse.json(
      { ok: false, error: "Error al obtener usuario." },
      { status: 500 }
    );
  }
}
