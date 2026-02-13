import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // Obtener grupoId del usuario
    let grupoId = session.grupoId;
    if (!grupoId && session.localId) {
      const gl = await prisma.grupoLocal.findFirst({
        where: { localId: session.localId },
        select: { grupoId: true },
      });
      grupoId = gl?.grupoId;
    }

    if (!grupoId) {
      return NextResponse.json(
        { ok: false, error: "No se pudo determinar el grupo" },
        { status: 400 }
      );
    }

    const { nombre, documento, telefono, email, direccion } = await req.json();

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { ok: false, error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const cliente = await prisma.cliente.create({
      data: {
        grupoId,
        nombre: nombre.trim(),
        documento: documento?.trim() || null,
        telefono: telefono?.trim() || null,
        email: email?.trim() || null,
        direccion: direccion?.trim() || null,
      },
    });

    return NextResponse.json({ ok: true, cliente });
  } catch (error) {
    console.error("Error creando cliente:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
