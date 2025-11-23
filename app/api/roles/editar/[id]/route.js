import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PUT(req, context) {
  try {
    const { id } = await context.params; // ✅ Next 15
    const rolId = Number(id);

    if (!rolId || Number.isNaN(rolId)) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const data = {};

    if (body?.nombre !== undefined) {
      const nombre = String(body.nombre).trim();
      if (!nombre) {
        return NextResponse.json(
          { ok: false, error: "Nombre requerido" },
          { status: 400 }
        );
      }
      data.nombre = nombre;
    }

    if (body?.permisos !== undefined) {
      if (!Array.isArray(body.permisos)) {
        return NextResponse.json(
          { ok: false, error: "Permisos inválidos (deben ser array)" },
          { status: 400 }
        );
      }
      data.permisos = body.permisos;
    }

    const item = await prisma.rol.update({
      where: { id: rolId },
      data
    });

    return NextResponse.json({ ok: true, item }, { status: 200 });
  } catch (e) {
    if (e.code === "P2002") {
      return NextResponse.json(
        { ok: false, error: "Ya existe un rol con ese nombre" },
        { status: 409 }
      );
    }

    if (e.code === "P2025") {
      return NextResponse.json(
        { ok: false, error: "Rol no encontrado" },
        { status: 404 }
      );
    }

    console.error("roles/editar", e);
    return NextResponse.json(
      { ok: false, error: "Error al editar rol" },
      { status: 500 }
    );
  }
}
