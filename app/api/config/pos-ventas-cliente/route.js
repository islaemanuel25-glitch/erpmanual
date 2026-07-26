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

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId, grupoId } = scope;

    const [{ exigirClienteVenta }, cg] = await Promise.all([
      getConfigLocalEfectiva(localId, grupoId),
      prisma.configuracionGrupo.findUnique({
        where: { grupoId },
        select: { exigirClienteVentasDeposito: true, exigirClienteVentasLocal: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      exigirClienteVenta,
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

    // Valor canónico per-local. Backward-compat: aceptar el flag legacy que
    // corresponda al tipo del local (depósito vs local).
    let valor;
    if (body.exigirClienteVenta !== undefined) {
      valor = !!body.exigirClienteVenta;
    } else if (
      body.exigirClienteVentasDeposito !== undefined ||
      body.exigirClienteVentasLocal !== undefined
    ) {
      const loc = await prisma.local.findUnique({
        where: { id: localId },
        select: { es_deposito: true },
      });
      valor = loc?.es_deposito
        ? !!body.exigirClienteVentasDeposito
        : !!body.exigirClienteVentasLocal;
    }

    if (valor === undefined) {
      return NextResponse.json(
        { ok: false, error: "Nada para actualizar" },
        { status: 400 }
      );
    }

    await prisma.configuracionLocal.upsert({
      where: { localId },
      update: { exigirClienteVenta: valor },
      create: { localId, exigirClienteVenta: valor },
    });

    const { exigirClienteVenta } = await getConfigLocalEfectiva(localId, grupoId);
    return NextResponse.json({ ok: true, exigirClienteVenta });
  } catch (error) {
    console.error("Error actualizando config pos-ventas-cliente:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
