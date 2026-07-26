import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { getConfigLocalEfectiva } from "@/lib/config/local";

// allowNegativeStock ("vender sin stock") es PER LOCAL (config_local.stock).
// requireMotivoAjusteStock/requireMotivoLimitesStock siguen siendo PER GRUPO (admin).

export async function GET(req) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    // Lectura de config: recurso ajeno → 404 (no revelar la config de otra ubicación).
    const scope = await resolveLocalAndGrupo(req, { lecturaAjena: true });
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const { localId, grupoId } = scope;

    const [{ allowNegativeStock }, cg] = await Promise.all([
      getConfigLocalEfectiva(localId, grupoId),
      prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { requireMotivoAjusteStock: true, requireMotivoLimitesStock: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      allowNegativeStock,
      requireMotivoAjusteStock: cg?.requireMotivoAjusteStock ?? false,
      requireMotivoLimitesStock: cg?.requireMotivoLimitesStock ?? false,
    });
  } catch (error) {
    console.error("Error obteniendo config stock:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    // Scope estricto: no-admin queda atado a session.localId; localId ajeno → 403.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId, grupoId } = scope;
    const body = await req.json();

    const tocaStockLocal = body.allowNegativeStock !== undefined;
    const tocaMotivos =
      body.requireMotivoAjusteStock !== undefined ||
      body.requireMotivoLimitesStock !== undefined;

    // Permisos: vender-sin-stock por local requiere config_local.stock (o admin).
    if (tocaStockLocal && !session.esAdmin && !checkPerm(session, "config_local.stock").ok) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso: config_local.stock" },
        { status: 403 }
      );
    }
    // Los "motivos" siguen siendo configuración de grupo (admin-only).
    if (tocaMotivos && !session.esAdmin) {
      return NextResponse.json(
        { ok: false, error: "Requiere administrador" },
        { status: 403 }
      );
    }

    if (tocaStockLocal) {
      await prisma.configuracionLocal.upsert({
        where: { localId },
        update: { allowNegativeStock: !!body.allowNegativeStock },
        create: { localId, allowNegativeStock: !!body.allowNegativeStock },
      });
    }

    if (tocaMotivos) {
      const update = {};
      if (body.requireMotivoAjusteStock !== undefined)
        update.requireMotivoAjusteStock = !!body.requireMotivoAjusteStock;
      if (body.requireMotivoLimitesStock !== undefined)
        update.requireMotivoLimitesStock = !!body.requireMotivoLimitesStock;
      await prisma.configuracionGrupo.upsert({
        where: { grupoId },
        update,
        create: { grupoId, ...update },
      });
    }

    const [{ allowNegativeStock }, cg] = await Promise.all([
      getConfigLocalEfectiva(localId, grupoId),
      prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { requireMotivoAjusteStock: true, requireMotivoLimitesStock: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      allowNegativeStock,
      requireMotivoAjusteStock: cg?.requireMotivoAjusteStock ?? false,
      requireMotivoLimitesStock: cg?.requireMotivoLimitesStock ?? false,
    });
  } catch (error) {
    console.error("Error actualizando config stock:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
