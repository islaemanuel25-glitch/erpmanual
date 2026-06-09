export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolverScopeNotif } from "@/lib/notificaciones/scope";
import { enviarPush, pushConfigurado } from "@/lib/notificaciones/enviarPush";

export async function POST(req) {
  try {
    const scope = await resolverScopeNotif(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    if (!pushConfigurado()) {
      return NextResponse.json(
        { ok: false, error: "VAPID no configurado (faltan WEB_PUSH_*_KEY)" },
        { status: 500 }
      );
    }

    const payload = {
      titulo: "Prueba — ERP Azul",
      cuerpo: "Si ves esto, las notificaciones push funcionan ✔",
      href: "/modulos/notificaciones",
      tag: "push-prueba",
    };

    // Primario: suscripciones activas guardadas del usuario actual.
    let subs = [];
    if (scope.grupoId) {
      subs = await prisma.pushSubscription.findMany({
        where: { grupoId: scope.grupoId, usuarioId: scope.userId ?? null, activo: true },
      });
    }

    if (subs.length > 0) {
      const r = await enviarPush(subs, payload);
      if (r.enviadas === 0) {
        return NextResponse.json(
          { ok: false, error: "No se pudo entregar a ningún dispositivo (suscripciones vencidas, renová)." },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, enviadas: r.enviadas });
    }

    // Fallback: subscription viva enviada en el body (cuando no hay guardadas todavía).
    const body = await req.json().catch(() => ({}));
    const bodySub = body?.subscription;
    if (bodySub?.endpoint) {
      const r = await enviarPush([bodySub], payload);
      if (r.enviadas === 0) {
        return NextResponse.json(
          { ok: false, error: "No se pudo entregar al dispositivo (renová la suscripción)." },
          { status: 502 }
        );
      }
      return NextResponse.json({ ok: true, enviadas: r.enviadas });
    }

    return NextResponse.json(
      { ok: false, error: "No hay dispositivos activos para este usuario. Activá notificaciones primero." },
      { status: 400 }
    );
  } catch (err) {
    console.error("push/probar:", err);
    return NextResponse.json({ ok: false, error: "Error al enviar push" }, { status: 500 });
  }
}
