export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolverScopeNotif } from "@/lib/notificaciones/scope";

export async function POST(req) {
  try {
    const scope = await resolverScopeNotif(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    if (!scope.grupoId) {
      return NextResponse.json({ ok: false, error: "Sin grupo activo" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const endpoint = body?.endpoint;
    if (!endpoint) {
      return NextResponse.json({ ok: false, error: "endpoint requerido" }, { status: 400 });
    }

    // Scope seguro: solo dentro del grupo del usuario. No borrado físico.
    await prisma.pushSubscription.updateMany({
      where: { endpoint, grupoId: scope.grupoId },
      data: { activo: false },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push/desuscribir:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
