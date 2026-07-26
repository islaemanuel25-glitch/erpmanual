import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";

export async function GET(req) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const { localId } = auth.session;
    if (!localId) return NextResponse.json({ ok: false, error: "Sin local asignado" }, { status: 400 });

    const row = await prisma.ticketConfig.findUnique({ where: { localId } });

    return NextResponse.json({
      ok: true,
      config: row?.configJson ?? null,
    });
  } catch (error) {
    console.error("Error obteniendo ticket config:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    // Config de ticket por local: admin o config_local.ticket. El scope es intrínseco:
    // se usa SIEMPRE session.localId, nunca un localId del request.
    if (!session.esAdmin && !checkPerm(session, "config_local.ticket").ok) {
      return NextResponse.json({ ok: false, error: "Sin permiso: config_local.ticket" }, { status: 403 });
    }

    const { localId } = session;
    if (!localId) return NextResponse.json({ ok: false, error: "Sin local asignado" }, { status: 400 });

    const body = await req.json();
    const configJson = body.config;
    if (!configJson || typeof configJson !== "object") {
      return NextResponse.json({ ok: false, error: "Config invalida" }, { status: 400 });
    }

    const row = await prisma.ticketConfig.upsert({
      where: { localId },
      update: { configJson },
      create: { localId, configJson },
    });

    return NextResponse.json({ ok: true, config: row.configJson });
  } catch (error) {
    console.error("Error guardando ticket config:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
