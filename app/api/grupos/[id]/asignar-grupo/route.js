import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req, context) {
  try {
    const { id } = await context.params;
    const localId = Number(id);

    const { grupoId } = await req.json();

    if (!localId || !grupoId) {
      return NextResponse.json(
        { ok: false, error: "IDs inválidos" },
        { status: 400 }
      );
    }

    // ✔ verificar que el local existe
    const local = await prisma.local.findUnique({ where: { id: localId } });
    if (!local) {
      return NextResponse.json(
        { ok: false, error: "Local no encontrado" },
        { status: 404 }
      );
    }

    // ✔ verificar que el grupo existe
    const grupo = await prisma.grupo.findUnique({ where: { id: grupoId } });
    if (!grupo) {
      return NextResponse.json(
        { ok: false, error: "Grupo no encontrado" },
        { status: 404 }
      );
    }

    // ✔ un local solo puede pertenecer a un grupo (unique)
    // si ya pertenece, error 409
    const yaAsignado = await prisma.grupoLocal.findUnique({
      where: { localId }
    });

    if (yaAsignado) {
      return NextResponse.json(
        { ok: false, error: "El local ya pertenece a un grupo" },
        { status: 409 }
      );
    }

    const asignado = await prisma.grupoLocal.create({
      data: { localId, grupoId }
    });

    return NextResponse.json({ ok: true, data: asignado });

  } catch (e) {
    console.error("POST /locales/:id/asignar-grupo ERROR:", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
