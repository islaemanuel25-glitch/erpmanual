// app/api/stock_locales/control/abrir/route.js
//
// POST: empezar un control de stock en el local. Uno solo abierto por local:
// si ya hay, 409. Lo hace la cuenta sin operador activo: con PIN, 403.

import { NextResponse } from "next/server";
import { PERMISO_GESTIONAR_CONTROL } from "@/lib/stock/control/controlStock";
import { abrirControl, autorizarControl, respuestaDeError, respuestaDeRechazo } from "@/lib/stock/control/controlStockServer";

export async function POST(req) {
  try {
    const a = await autorizarControl(req, PERMISO_GESTIONAR_CONTROL, { persona: "cuenta" });
    if (!a.ok) return respuestaDeRechazo(a);
    const control = await abrirControl({ localId: a.localId, quien: a.quien });
    return NextResponse.json({ ok: true, control: { id: control.id, abiertoEn: control.abiertoEn } });
  } catch (e) {
    return respuestaDeError(e, "empezar el control");
  }
}
