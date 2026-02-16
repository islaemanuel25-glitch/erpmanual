import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

export async function PUT(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId } = scope;

    const { id } = await params;
    const body = await req.json();
    const { nombre, documento, telefono, email, direccion, observaciones } = body;

    const clienteExistente = await prisma.cliente.findFirst({
      where: { id: Number(id), localId, grupoId },
      select: { id: true },
    });

    if (!clienteExistente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado para este local" },
        { status: 404 }
      );
    }

    const esEdicionCompleta =
      nombre !== undefined ||
      documento !== undefined ||
      telefono !== undefined ||
      email !== undefined ||
      direccion !== undefined ||
      observaciones !== undefined;

    if (esEdicionCompleta && (!nombre || !nombre.trim())) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const cliente = await prisma.cliente.update({
      where: { id: Number(id), localId: Number(localId) },
      data: esEdicionCompleta
        ? {
            nombre: nombre.trim(),
            documento: documento?.trim() || null,
            telefono: telefono?.trim() || null,
            email: email?.trim() || null,
            direccion: direccion?.trim() || null,
            observaciones: observaciones?.trim() || null,
            activo: body.activo,
          }
        : {
            activo: body.activo,
          },
    });

    return NextResponse.json({ ok: true, cliente });
  } catch (error) {
    console.error("Error actualizando estado de cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(req, { params }) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { grupoId, localId } = scope;

    const { id } = await params;
    const body = await req.json();
    const { nombre, documento, telefono, email, direccion, observaciones } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const clienteExistente = await prisma.cliente.findFirst({
      where: { id: Number(id), localId, grupoId },
      select: { id: true },
    });

    if (!clienteExistente) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado para este local" },
        { status: 404 }
      );
    }

    const cliente = await prisma.cliente.update({
      where: { id: Number(id), localId: Number(localId) },
      data: {
        nombre: nombre.trim(),
        documento: documento?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        direccion: direccion?.trim() || null,
        observaciones: observaciones?.trim() || null,
        activo: body.activo,
      },
    });

    return NextResponse.json({ ok: true, cliente });
  } catch (error) {
    console.error("Error editando cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
