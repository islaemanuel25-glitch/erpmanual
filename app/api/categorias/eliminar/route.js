// app/api/categorias/eliminar/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req) {
  try {
    const body = await req.json();
    const id = Number(body.id);

    // ================================
    // 🔍 Validar ID
    // ================================
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    // ================================
    // 🔍 Verificar que exista
    // ================================
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

    // ================================
    // 🔍 Verificar si tiene productos
    // ================================
    const enUso = await prisma.productoBase.findFirst({
      where: { categoria_id: id },
      select: { id: true },
    });

    if (enUso) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La categoría tiene productos asociados y no se puede eliminar.",
        },
        { status: 400 }
      );
    }

    // ================================
    // 🗑 Eliminar
    // ================================
    await prisma.categoria.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("ERROR /api/categorias/eliminar", e);
    return NextResponse.json(
      { ok: false, error: "Error al eliminar categoría" },
      { status: 500 }
    );
  }
}
