import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";

// GET /api/puntos-config?localId=...
// Las REGLAS del programa de puntos —cuántos pesos por punto, exclusiones— son
// configuración del negocio, no el saldo de un cliente. Su único consumidor es
// `/modulos/fidelidad`, que se cierra con `config_local.fidelidad`.
//
// No se le suma `clientes.puntos.ver`: ese permiso es para VER Y CANJEAR los
// puntos de una persona, y eso lo sirve `clientes/[id]/puntos`, que sigue
// abierta para el cajero. Ver el saldo de alguien no es ver cómo se calcula.
const PERMISO_CONFIG_PUNTOS = "config_local.fidelidad";

export async function GET(req) {
  try {
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const permiso = checkPerm(scope.session, PERMISO_CONFIG_PUNTOS);
    if (!permiso.ok) {
      return NextResponse.json(
        { ok: false, error: permiso.error },
        { status: permiso.status }
      );
    }

    const { localId } = scope;

    const config = await prisma.puntosConfigLocal.findFirst({
      where: { localId },
    });

    return NextResponse.json({
      ok: true,
      config: config || null,
    });
  } catch (error) {
    console.error("Error obteniendo config puntos:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}

// PUT /api/puntos-config
export async function PUT(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    if (!session.esAdmin && !checkPerm(session, "config_local.fidelidad").ok) {
      return NextResponse.json({ ok: false, error: "Sin permiso: config_local.fidelidad" }, { status: 403 });
    }

    // Scope estricto por local (no-admin atado a session.localId; ajeno → 403).
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error },
        { status: scope.status }
      );
    }

    const { grupoId, localId } = scope;
    const body = await req.json();
    const { activo, reglasJson, redencionJson, exclusionesJson } = body;

    const config = await prisma.puntosConfigLocal.upsert({
      where: { localId },
      update: {
        activo: activo !== undefined ? !!activo : undefined,
        reglasJson: reglasJson !== undefined ? reglasJson : undefined,
        redencionJson: redencionJson !== undefined ? redencionJson : undefined,
        exclusionesJson: exclusionesJson !== undefined ? exclusionesJson : undefined,
      },
      create: {
        grupoId,
        localId,
        activo: !!activo,
        reglasJson: reglasJson || null,
        redencionJson: redencionJson || null,
        exclusionesJson: exclusionesJson || null,
      },
    });

    return NextResponse.json({ ok: true, config });
  } catch (error) {
    console.error("Error actualizando config puntos:", error);
    return NextResponse.json(
      { ok: false, error: "Error interno" },
      { status: 500 }
    );
  }
}
