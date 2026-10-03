// app/api/contexto-activo/get/route.js
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { getContextoActivo } from "@/lib/contexto";
import { getGrupoIdDeLocal } from "@/lib/grupos";

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

    // El grupo sale de la misma función que usa `resolveLocalAndGrupo` en el
    // servidor. El POS lo necesita para guardar una venta sin conexión, y antes
    // lo buscaba en /api/locales/[id], que nunca lo devolvía: ninguna venta
    // offline llegaba a guardarse.
    return NextResponse.json({
      ok: true,
      localId: local.id,
      nombre: local.nombre,
      esDeposito: local.es_deposito === true,
      grupoId: await getGrupoIdDeLocal(local.id),
    });
  } catch (err) {
    console.error("Error contexto-activo/get:", err);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
