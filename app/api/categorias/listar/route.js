import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.categoria.findMany({
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
