import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  const items = await prisma.productoLocal.findMany({
    include: {
      base: true,
      stock: true
    }
  });

  return NextResponse.json({
    ok: true,
    count: items.length,
    items
  });
}
