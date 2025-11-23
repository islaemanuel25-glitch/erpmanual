import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// ========================================================
// GET /api/grupos/:id
// ========================================================
export async function GET(req, context) {
  try {
    const { id } = await context.params;
    const numId = Number(id);

    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json(
        { error: "ID inválido" },
        { status: 400 }
      );
    }

    const grupo = await prisma.grupo.findUnique({
      where: { id: numId },
      include: {
        // ✅ depósitos del grupo (GrupoDeposito)
        locales: {
          include: { local: true },
        },

        // ✅ locales asignados (GrupoLocal)
        localesGrupo: {
          include: { local: true },
        },
      },
    });

    if (!grupo) {
      return NextResponse.json(
        { error: "El grupo no existe" },
        { status: 404 }
      );
    }

    return NextResponse.json(grupo);

  } catch (e) {
    console.error("GET grupo ERROR:", e);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}

// ========================================================
// PUT /api/grupos/:id
// ========================================================
export async function PUT(req, context) {
  try {
    const { id } = await context.params;
    const numId = Number(id);

    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json(
        { error: "ID inválido" },
        { status: 400 }
      );
    }

    const { nombre } = await req.json();
    if (!nombre?.trim()) {
      return NextResponse.json(
        { error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const grupo = await prisma.grupo.update({
      where: { id: numId },
      data: { nombre: nombre.trim() },
    });

    return NextResponse.json({ ok: true, data: grupo });

  } catch (e) {
    console.error("PUT grupo ERROR:", e);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}

// ========================================================
// DELETE /api/grupos/:id
// ========================================================
export async function DELETE(req, context) {
  try {
    const { id } = await context.params;
    const numId = Number(id);

    if (!numId || Number.isNaN(numId)) {
      return NextResponse.json(
        { error: "ID inválido" },
        { status: 400 }
      );
    }

    await prisma.grupo.delete({
      where: { id: numId },
    });

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("DELETE grupo ERROR:", e);
    return NextResponse.json(
      { error: "Error interno" },
      { status: 500 }
    );
  }
}
