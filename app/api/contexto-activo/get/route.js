// app/api/contexto-activo/get/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getContextoActivo } from "@/lib/contexto";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "No autenticado" },
        { status: 401 }
      );
    }

    // Resolver localId efectivo
    const contexto = getContextoActivo(req, session);

    if (contexto.needsContexto) {
      return NextResponse.json(
        { ok: false, needsContexto: true },
        { status: 409 }
      );
    }

    // Buscar datos del local
    const local = await prisma.local.findUnique({
      where: { id: contexto.localId },
      select: { id: true, nombre: true, es_deposito: true, activo: true },
    });

    if (!local) {
      return NextResponse.json(
        { ok: false, needsContexto: true, error: "Local no encontrado" },
        { status: 409 }
      );
    }

    if (!local.activo) {
      return NextResponse.json(
        { ok: false, needsContexto: true, error: "Contexto inactivo" },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      localId: local.id,
      nombre: local.nombre,
      esDeposito: local.es_deposito === true,
    });
  } catch (err) {
    console.error("Error contexto-activo/get:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
