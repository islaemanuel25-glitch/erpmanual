import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/authorize";

export async function GET(req) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

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
