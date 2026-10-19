import { NextResponse } from "next/server";
import { getOperadorActivo, firmarVoucherOperador, sesionDeOperadorSigueVigente, OperadorCookie } from "@/lib/operador";

export async function GET(req) {
  const operador = getOperadorActivo(req);
  if (!operador || !operador.operadorId) {
    return NextResponse.json({ ok: false, operador: null });
  }
  // Una sesión de PIN anterior al cierre de su caja ya no vale (lo cerró otro
  // dispositivo, o la pestaña no recibió la señal): el POS tiene que ver "sin
  // operador" y pedir el PIN, no seguir mostrando a quien cerró. Y no se le
  // firma un voucher nuevo: atribuiría ventas posteriores al cierre. La cookie
  // se borra de paso.
  if (!(await sesionDeOperadorSigueVigente(operador))) {
    const res = NextResponse.json({ ok: false, operador: null, sesionCerrada: true });
    res.cookies.set(OperadorCookie.nombre, "", { ...OperadorCookie.opciones, maxAge: 0 });
    return res;
  }
  // Voucher fresco del operador activo: el cliente lo adjunta a las ventas que
  // encola offline para conservar la atribución al sincronizar (ver crear).
  const voucher = operador.localId
    ? firmarVoucherOperador({ operadorId: operador.operadorId, localId: operador.localId })
    : null;
  return NextResponse.json({ ok: true, operador, voucher });
}
