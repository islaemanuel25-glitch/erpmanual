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
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    const userAgent = body?.userAgent ? String(body.userAgent).slice(0, 255) : null;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { ok: false, error: "Datos de suscripción incompletos" },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        grupoId: scope.grupoId,
        usuarioId: scope.userId ?? null,
        p256dh,
        auth,
        userAgent,
        activo: true,
      },
      create: {
        grupoId: scope.grupoId,
        usuarioId: scope.userId ?? null,
        endpoint,
        p256dh,
        auth,
        userAgent,
        activo: true,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push/suscribir:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
