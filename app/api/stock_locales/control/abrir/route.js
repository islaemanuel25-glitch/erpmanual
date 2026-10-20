// app/api/stock_locales/control/abrir/route.js
//
// POST: empezar un control de stock en el local. Uno solo abierto por local:
// si ya hay, 409.

import { NextResponse } from "next/server";
import { PERMISO_GESTIONAR_CONTROL } from "@/lib/stock/control/controlStock";
import { abrirControl, autorizarControl, respuestaDeError, respuestaDeRechazo } from "@/lib/stock/control/controlStockServer";

export async function POST(req) {
  try {
    const a = await autorizarControl(req, PERMISO_GESTIONAR_CONTROL);
    if (!a.ok) return respuestaDeRechazo(a);
    const control = await abrirControl({ localId: a.localId, quien: a.quien });
    return NextResponse.json({ ok: true, control: { id: control.id, abiertoEn: control.abiertoEn } });
  } catch (e) {
    return respuestaDeError(e, "empezar el control");
  }
}
