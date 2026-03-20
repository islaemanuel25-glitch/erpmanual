import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

export async function GET(req) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(null, { status: 404 });
  }
  const auth = requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

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
