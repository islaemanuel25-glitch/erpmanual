import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/authorize";

export async function POST(req) {
  try {
    const auth = requireAdmin(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const body = await req.json();

    const nombre = String(body?.nombre || "").trim();
    const permisos = Array.isArray(body?.permisos) ? body.permisos : [];

    if (!nombre) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    // No se puede crear un rol con privilegio universal "*" desde un payload arbitrario.
    if (permisos.includes("*")) {
      return NextResponse.json(
        { ok: false, error: "No se puede crear un rol con privilegio universal (*)." },
        { status: 400 }
      );
    }

    const item = await prisma.rol.create({
      data: { nombre, permisos }
    });

    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un rol con ese nombre" },
        { status: 409 }
      );
    }

    console.error("roles/crear", e);
    return NextResponse.json(
      { ok: false, error: "Error al crear rol" },
      { status: 500 }
    );
  }
}
