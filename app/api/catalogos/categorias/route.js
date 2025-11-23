import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const categorias = await prisma.categoria.findMany({
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json(categorias);
  } catch (err) {
    console.error("❌ Error CATEGORIAS:", err);
    return NextResponse.json(
      { error: "Error al cargar categorías" },
      { status: 500 }
    );
  }
}
