// GET /api/stock_locales/diario/productos
//
// Una fila por cadena física que existió en el período, filtrada y paginada:
// apertura y cierre con su existencia, lo que se movió en cantidad y en tránsito,
// y la identidad que se puede mostrar. Solo lectura. El contrato está en
// `lib/stock/libro/stockDiarioApi.js`; el armado, en `stockDiarioRutas.js`.

import { NextResponse } from "next/server";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { responderProductos } from "@/lib/stock/libro/stockDiarioRutas";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = getUsuarioSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Sesión no encontrada o vencida. Volvé a entrar." }, { status: 401 });
  const perm = checkPerm(session, "stock.ver");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
  return responderProductos(req);
}
