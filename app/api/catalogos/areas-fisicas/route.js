import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, items: [], error: "No autenticado" },
        { status: 401 }
      );
    }

    const areas = await prisma.areaFisica.findMany({
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, items: areas });
  } catch (err) {
    console.error("❌ Error AREAS FISICAS:", err);
    return NextResponse.json(
      { ok: false, items: [], error: "Error al cargar áreas físicas" },
      { status: 500 }
    );
  }
}
