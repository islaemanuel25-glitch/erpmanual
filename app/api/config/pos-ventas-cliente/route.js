import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { getConfigLocalEfectiva } from "@/lib/config/local";

// "Cliente obligatorio" es PER LOCAL (config_local.pos). Un local es depósito o
// no, así que hay UN flag efectivo por local: exigirClienteVenta. Se conservan
// los campos legacy de grupo en el GET para no romper UIs previas (fase 1).

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

    const [{ exigirClienteVenta, exigirOperador }, cg] = await Promise.all([
      getConfigLocalEfectiva(localId, grupoId),
      prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { exigirClienteVentasDeposito: true, exigirClienteVentasLocal: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      exigirClienteVenta,
      exigirOperador,
      // Legacy (grupo) — sólo lectura, para compatibilidad transitoria.
      exigirClienteVentasDeposito: cg?.exigirClienteVentasDeposito ?? false,
      exigirClienteVentasLocal: cg?.exigirClienteVentasLocal ?? false,
    });
  } catch (error) {
    console.error("Error obteniendo config pos-ventas-cliente:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    // Scope estricto: no-admin atado a session.localId; localId ajeno → 403.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId, grupoId } = scope;

    if (!session.esAdmin && !checkPerm(session, "config_local.pos").ok) {
      return NextResponse.json(
        { ok: false, error: "Sin permiso: config_local.pos" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Ambos flags son PER LOCAL (config_local.pos). Se construye el update solo
    // con los que vengan en el body. Server-authoritative: el local sale del
    // scope, nunca del body.
    const data = {};

    // Cliente obligatorio. Backward-compat: aceptar el flag legacy que
    // corresponda al tipo del local (depósito vs local).
    if (body.exigirClienteVenta !== undefined) {
      data.exigirClienteVenta = !!body.exigirClienteVenta;
    } else if (
      body.exigirClienteVentasDeposito !== undefined ||
      body.exigirClienteVentasLocal !== undefined
    ) {
      const loc = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });
      data.exigirClienteVenta = loc?.es_deposito
        ? !!body.exigirClienteVentasDeposito
        : !!body.exigirClienteVentasLocal;
    }

    // Operario obligatorio en el POS de este local.
    if (body.exigirOperador !== undefined) {
      data.exigirOperador = !!body.exigirOperador;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nada para actualizar" },
        { status: 400 }
      );
    }

    await prisma.configuracionLocal.upsert({
      where: { localId },
      update: data,
      create: { localId, ...data },
    });

    const { exigirClienteVenta, exigirOperador } = await getConfigLocalEfectiva(localId, grupoId);
    return NextResponse.json({ ok: true, exigirClienteVenta, exigirOperador });
  } catch (error) {
    console.error("Error actualizando config pos-ventas-cliente:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
