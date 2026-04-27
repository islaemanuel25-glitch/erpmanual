import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";

export async function GET(req) {
  try {
    const perm = requirePerm(req, "usuarios.gestionar");
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const locales = await prisma.local.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, es_deposito: true },
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json({ ok: true, locales });
  } catch (e) {
    console.error("operador/locales:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
