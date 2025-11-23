import { NextResponse } from "next/server";
import { SesionCookie } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  // invalidar cookie
  res.cookies.set(SesionCookie.nombre, "", { ...SesionCookie.opciones, maxAge: 0 });
  return res;
}
