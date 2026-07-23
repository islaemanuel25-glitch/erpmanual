import { NextResponse } from "next/server";
import { getOperadorActivo, firmarVoucherOperador } from "@/lib/operador";

export async function GET(req) {
  const operador = getOperadorActivo(req);
  if (!operador || !operador.operadorId) {
    return NextResponse.json({ ok: false, operador: null });
  }
  // Voucher fresco del operador activo: el cliente lo adjunta a las ventas que
  // encola offline para conservar la atribución al sincronizar (ver crear).
  const voucher = operador.localId
    ? firmarVoucherOperador({ operadorId: operador.operadorId, localId: operador.localId })
    : null;
  return NextResponse.json({ ok: true, operador, voucher });
}
