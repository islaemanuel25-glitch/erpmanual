import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const locales = await prisma.local.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json(
      {
        ok: true,
        locales,   // ✅ nombre correcto para tu frontend
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("usuarios/listarLocales", e);
    return NextResponse.json(
      { ok: false, error: "Error al listar locales." },
      { status: 500 }
    );
  }
}
