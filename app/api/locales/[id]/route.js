import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// ========================================================
// GET /api/locales/:id
// ========================================================
export async function GET(req, context) {
  try {
    const { id } = await context.params; 
    const numId = Number(id);

    if (!numId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const local = await prisma.local.findUnique({
      where: { id: numId },
      include: {
        grupoLocales: {
          include: { grupo: true },
        },
        grupoDepositos: {
          include: { grupo: true },
        },
      },
    });

    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, item: local });

  } catch (e) {
    console.error("GET LOCAL ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// ========================================================
// PUT /api/locales/:id
// ========================================================
export async function PUT(req, context) {
  try {
    const { id } = await context.params;
    const numId = Number(id);

    if (!numId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const esDeposito =
      body?.tipo === "deposito" || body?.es_deposito === true;

    const actualizado = await prisma.local.update({
      where: { id: numId },
      data: {
        nombre: body.nombre,
        tipo: body.tipo ?? "local",
        direccion: body.direccion ?? null,
        telefono: body.telefono ?? null,
        email: body.email ?? null,
        cuil: body.cuil ?? null,
        ciudad: body.ciudad ?? null,
        provincia: body.provincia ?? null,
        codigoPostal: body.codigoPostal ?? null,
        activo: body.activo ?? true,
        es_deposito: esDeposito,
      },
    });

    return NextResponse.json({ ok: true, item: actualizado });

  } catch (e) {
    console.error("EDITAR LOCAL ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error actualizando" },
      { status: 500 }
    );
  }
}

// ========================================================
// DELETE /api/locales/:id
// ========================================================
export async function DELETE(req, context) {
  try {
    const { id } = await context.params;
    const numId = Number(id);

    if (!numId) {
      return NextResponse.json(
        { ok: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    await prisma.local.delete({ where: { id: numId } });

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("ELIMINAR LOCAL ERROR:", e);
    return NextResponse.json(
      { ok: false, error: "Error eliminando" },
      { status: 500 }
    );
  }
}
