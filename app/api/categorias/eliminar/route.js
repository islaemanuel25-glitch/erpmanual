// app/api/categorias/eliminar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { requireAdmin } from "@/lib/authorize";

export async function POST(req) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const id = Number(body.id);

    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const categoria = await prisma.categoria.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!categoria) {
      return NextResponse.json(
        { ok: false, error: "Categoría no encontrada" },
        { status: 404 }
      );
    }

    const enUso = await prisma.productoBase.findFirst({
      where: { categoria_id: id },
      select: { id: true },
    });

    if (enUso) {
      return NextResponse.json(
        { ok: false, error: "La categoría tiene productos asociados y no se puede eliminar." },
        { status: 400 }
      );
    }

    await prisma.categoria.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ERROR /api/categorias/eliminar:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno al eliminar categoría" },
      { status: 500 }
    );
  }
}
