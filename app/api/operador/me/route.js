import { NextResponse } from "next/server";
import { getOperadorActivo } from "@/lib/operador";

export async function GET(req) {
  const operador = getOperadorActivo(req);
  if (!operador || !operador.operadorId) {
    return NextResponse.json({ ok: false, operador: null });
  }
  return NextResponse.json({ ok: true, operador });
}
