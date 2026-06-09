export const runtime = "nodejs";

import { NextResponse } from "next/server";

// Devuelve la VAPID public key desde el entorno del SERVIDOR (runtime),
// para no depender de inlinear NEXT_PUBLIC_ en build (el Dockerfile no lo pasa).
export async function GET() {
  const publicKey =
    process.env.WEB_PUSH_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ||
    null;
  return NextResponse.json({ ok: Boolean(publicKey), publicKey });
}
