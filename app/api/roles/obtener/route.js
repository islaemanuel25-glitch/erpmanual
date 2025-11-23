import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));

    if (!id || Number.isNaN(id)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const item = await prisma.rol.findUnique({ where: { id } });

    if (!item) {
      return NextResponse.json(
        { ok: false, error: "Rol no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (e) {
    console.error("roles/obtener", e);
    return NextResponse.json(
      { ok: false, error: "Error al obtener rol" },
      { status: 500 }
    );
  }
}
