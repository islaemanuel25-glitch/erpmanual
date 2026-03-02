import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

export async function GET(req) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const roles = await prisma.rol.findMany({
      orderBy: { nombre: "asc" },
    });

    return NextResponse.json(
      {
        ok: true,
        roles,
        items: roles, // ✅ compat con front que espera items
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("usuarios/listarRoles", e);
    return NextResponse.json(
      { ok: false, error: "Error al listar roles." },
      { status: 500 }
    );
  }
}
