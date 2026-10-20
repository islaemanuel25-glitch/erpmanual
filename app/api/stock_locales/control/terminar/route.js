// app/api/stock_locales/control/terminar/route.js
//
// GET: lo que nadie contó y el sistema dice que hay, partido en vendidos durante
// el control (no se tocan) y los que quedan en cero.
// POST { productos: [productoLocalId…] }: poner en cero los que la pantalla
// mostró y cerrar el control.

import { NextResponse } from "next/server";
import { PERMISO_GESTIONAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  leerTerminar,
  respuestaDeError,
  respuestaDeRechazo,
  terminarControl,
} from "@/lib/stock/control/controlStockServer";

export async function GET(req) {
  try {
    const a = await autorizarControl(req, PERMISO_GESTIONAR_CONTROL, { lectura: true, persona: "cuenta" });
    if (!a.ok) return respuestaDeRechazo(a);
    const r = await leerTerminar({ localId: a.localId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "leer lo que falta contar");
  }
}

export async function POST(req) {
  try {
    const a = await autorizarControl(req, PERMISO_GESTIONAR_CONTROL, { persona: "cuenta" });
    if (!a.ok) return respuestaDeRechazo(a);
    const body = await req.json().catch(() => ({}));
    const r = await terminarControl({ localId: a.localId, grupoId: a.grupoId, quien: a.quien, vistos: body.productos });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "terminar el control");
  }
}
