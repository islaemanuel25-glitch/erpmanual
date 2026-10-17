// GET /api/stock_locales/diario/resumen
//
// El Stock Diario de UNA ubicación en un período: lo que se sabe del período, los
// totales de cantidad y de tránsito por separado, y los conteos de productos.
// Solo lectura, derivado del libro al consultar. El contrato está en
// `lib/stock/libro/stockDiarioApi.js`; el armado, en `stockDiarioRutas.js`.

import { NextResponse } from "next/server";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm, checkFueraDelOperador } from "@/lib/authorize";
import { responderResumen } from "@/lib/stock/libro/stockDiarioRutas";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = getUsuarioSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Sesión no encontrada o vencida. Volvé a entrar." }, { status: 401 });
  // El Stock Diario es la historia de la misma existencia física que muestra el
  // stock por local: el mismo permiso.
  const perm = checkPerm(session, "stock.ver");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
  // Es Finanzas (Valor del Stock): el operador conserva `stock.ver` pero no entra.
  const fuera = checkFueraDelOperador(session);
  if (!fuera.ok) return NextResponse.json({ ok: false, error: fuera.error }, { status: fuera.status });
  return responderResumen(req);
}
