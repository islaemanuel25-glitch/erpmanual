// app/api/stock_locales/control/diferencias/route.js
//
// GET ?controlId=: el informe de diferencias de un control del local —sin
// `controlId`, el abierto—. Qué productos estaban mal, por cuánto y cuánta plata
// es. El de un control terminado se lee congelado y no cambia.
//
// Lo ven quien cuenta y quien gestiona. La PLATA solo con `costos.ver` —o el
// comodín—: es el costo de la mercadería, y quien no ve costos en el resto del
// sistema tampoco lo ve acá. Sin el permiso, el informe va con las cantidades y
// sin importes.

import { NextResponse } from "next/server";
import { checkPerm } from "@/lib/authorize";
import { PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  leerDiferencias,
  respuestaDeError,
  respuestaDeRechazo,
} from "@/lib/stock/control/controlStockServer";

const PERMISO_PLATA_DE_LAS_DIFERENCIAS = "costos.ver";

export async function GET(req) {
  try {
    const a = await autorizarControl(req, [PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL], { lectura: true, persona: "opcional" });
    if (!a.ok) return respuestaDeRechazo(a);
    const controlId = Number(req.nextUrl.searchParams.get("controlId") || 0) || null;
    const conPlata = checkPerm(a.session, PERMISO_PLATA_DE_LAS_DIFERENCIAS).ok;
    const r = await leerDiferencias({ localId: a.localId, controlId, conPlata });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "leer las diferencias del control");
  }
}
