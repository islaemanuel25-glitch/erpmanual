export const runtime = "nodejs";

import { NextResponse } from "next/server";
import webpush from "web-push";
import { getUsuarioSession } from "@/lib/auth";

const PUBLIC_KEY = process.env.WEB_PUSH_PUBLIC_KEY || process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
const PRIVATE_KEY = process.env.WEB_PUSH_PRIVATE_KEY;
const SUBJECT = process.env.WEB_PUSH_SUBJECT || "mailto:admin@erpazul";

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    if (!PUBLIC_KEY || !PRIVATE_KEY) {
      return NextResponse.json(
        { ok: false, error: "VAPID no configurado (faltan WEB_PUSH_*_KEY)" },
        { status: 500 }
      );
    }
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

    const body = await req.json().catch(() => ({}));
    const sub = body?.subscription;
    if (!sub || !sub.endpoint) {
      return NextResponse.json({ ok: false, error: "subscription requerida" }, { status: 400 });
    }

    const payload = JSON.stringify({
      titulo: "Prueba — ERP Azul",
      cuerpo: "Si ves esto, las notificaciones push funcionan ✔",
      href: "/modulos/notificaciones",
      tag: "push-prueba",
    });

    await webpush.sendNotification(sub, payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push/probar:", err?.statusCode, err?.body || err?.message);
    return NextResponse.json(
      { ok: false, error: err?.body || err?.message || "Error al enviar push" },
      { status: 500 }
    );
  }
}
