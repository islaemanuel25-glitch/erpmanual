import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const areas = await prisma.areaFisica.findMany({
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json(areas);
  } catch (err) {
    console.error("❌ Error AREAS FISICAS:", err);
    return NextResponse.json(
      { error: "Error al cargar áreas físicas" },
      { status: 500 }
    );
  }
}
