import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";

const CONFIG_FIELDS = {
  allowNegativeStock: true,
  requireMotivoAjusteStock: true,
  requireMotivoLimitesStock: true,
};

export async function GET(req) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const { grupoId } = scope;

    const config = await prisma.configuracionGrupo.findUnique({
      where: { grupoId },
      select: CONFIG_FIELDS,
    });

    return NextResponse.json({
      ok: true,
      allowNegativeStock: config?.allowNegativeStock ?? false,
      requireMotivoAjusteStock: config?.requireMotivoAjusteStock ?? false,
      requireMotivoLimitesStock: config?.requireMotivoLimitesStock ?? false,
    });
  } catch (error) {
    console.error("Error obteniendo config stock:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const admin = requireAdmin(req);
    if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const { grupoId } = scope;
    const body = await req.json();

    const update = {};
    if (body.allowNegativeStock !== undefined) update.allowNegativeStock = !!body.allowNegativeStock;
    if (body.requireMotivoAjusteStock !== undefined) update.requireMotivoAjusteStock = !!body.requireMotivoAjusteStock;
    if (body.requireMotivoLimitesStock !== undefined) update.requireMotivoLimitesStock = !!body.requireMotivoLimitesStock;

    const config = await prisma.configuracionGrupo.upsert({
      where: { grupoId },
      update,
      create: { grupoId, ...update },
    });

    return NextResponse.json({
      ok: true,
      allowNegativeStock: config.allowNegativeStock,
      requireMotivoAjusteStock: config.requireMotivoAjusteStock,
      requireMotivoLimitesStock: config.requireMotivoLimitesStock,
    });
  } catch (error) {
    console.error("Error actualizando config stock:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
