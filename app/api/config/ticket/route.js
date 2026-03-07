import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/authorize";

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
    const admin = requireAdmin(req);
    if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

    const { localId } = admin.session;
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
