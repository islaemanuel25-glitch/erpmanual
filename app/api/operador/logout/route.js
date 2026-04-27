import { NextResponse } from "next/server";
import { OperadorCookie } from "@/lib/operador";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OperadorCookie.nombre, "", { ...OperadorCookie.opciones, maxAge: 0 });
  return res;
}
