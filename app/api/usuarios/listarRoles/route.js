import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const roles = await prisma.rol.findMany({
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json(
      {
        ok: true,
        roles,   // ✅ nombre correcto para el frontend
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("usuarios/listarRoles", e);
    return NextResponse.json(
      { ok: false, error: "Error al listar roles." },
      { status: 500 }
    );
  }
}
