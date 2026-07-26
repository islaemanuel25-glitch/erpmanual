import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";

// Apariencia INSTITUCIONAL del local (tema + opciones de negocio). Aplica a todos
// los dispositivos del local. Lectura: cualquier sesión con local (para poder
// aplicar el tema). Escritura: admin o config_local.apariencia, sobre el local
// propio (scope estricto; localId ajeno → 403).

export async function GET(req) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    // Lectura de config: recurso ajeno → 404 (no revelar la config de otra ubicación).
    const scope = await resolveLocalAndGrupo(req, { lecturaAjena: true });
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const row = await prisma.configuracionLocal.findUnique({
      where: { localId: scope.localId },
      select: { aparienciaJson: true },
    });

    return NextResponse.json({ ok: true, apariencia: row?.aparienciaJson ?? null });
  } catch (error) {
    console.error("Error obteniendo apariencia local:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    if (!session.esAdmin && !checkPerm(session, "config_local.apariencia").ok) {
      return NextResponse.json({ ok: false, error: "Sin permiso: config_local.apariencia" }, { status: 403 });
    }

    // Scope estricto: no-admin atado a session.localId; localId ajeno → 403.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId } = scope;

    const body = await req.json();
    const apariencia = body?.apariencia;
    if (apariencia !== null && (typeof apariencia !== "object" || Array.isArray(apariencia))) {
      return NextResponse.json({ ok: false, error: "Apariencia inválida" }, { status: 400 });
    }

    const row = await prisma.configuracionLocal.upsert({
      where: { localId },
      update: { aparienciaJson: apariencia },
      create: { localId, aparienciaJson: apariencia },
    });

    return NextResponse.json({ ok: true, apariencia: row.aparienciaJson ?? null });
  } catch (error) {
    console.error("Error guardando apariencia local:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
