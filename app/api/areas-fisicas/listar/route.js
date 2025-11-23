import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.areaFisica.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({
      ok: true,
      items,
      error: null,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      items: [],
      error: err.message,
    });
  }
}
