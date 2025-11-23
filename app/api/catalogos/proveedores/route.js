import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const proveedores = await prisma.proveedor.findMany({
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json(proveedores);
  } catch (err) {
    console.error("❌ Error PROVEEDORES:", err);
    return NextResponse.json(
      { error: "Error al cargar proveedores" },
      { status: 500 }
    );
  }
}
