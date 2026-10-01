// GET /api/stock_locales/diario/transferencias
//
// Las transferencias que formaron la categoría Transferencias del Valor del
// Stock en el período: una fila por transferencia, con su impacto a costo en la
// ubicación mirada. Solo lectura, con el permiso y el alcance de las demás rutas
// del Valor del Stock. El armado está en `stockDiarioRutas.js`.

import { NextResponse } from "next/server";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { responderTransferenciasDelValor } from "@/lib/stock/libro/stockDiarioRutas";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = getUsuarioSession(req);
  if (!session) return NextResponse.json({ ok: false, error: "Sesión no encontrada o vencida. Volvé a entrar." }, { status: 401 });
  const perm = checkPerm(session, "stock.ver");
  if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
  return responderTransferenciasDelValor(req);
}
