// GET /api/stock_locales/diario/producto
//
// Una sola cadena física en el período: identidad, apertura, cierre, lo que se
// movió, las reinterpretaciones una por una y sus movimientos paginados en la
// base. Solo lectura. Una cadena de otra ubicación no se encuentra: todo se
// busca dentro del local del alcance. El contrato está en
// `lib/stock/libro/stockDiarioApi.js`; el armado, en `stockDiarioRutas.js`.

import { NextResponse } from "next/server";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { responderProducto } from "@/lib/stock/libro/stockDiarioRutas";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = getUsuarioSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Sesión no encontrada o vencida. Volvé a entrar." }, { status: 401 });
  const perm = checkPerm(session, "stock.ver");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
  return responderProducto(req);
}
