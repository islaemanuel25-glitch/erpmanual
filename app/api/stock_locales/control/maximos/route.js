// app/api/stock_locales/control/maximos/route.js
//
// EL MÁXIMO DE CADA CATEGORÍA EN ESTA UBICACIÓN, para el filtro "Stock alto"
// del Control de stock.
//
// GET: la ubicación y cada categoría con productos acá, con su unidad (kg o un,
// la de la mayoría de sus productos) y su máximo, o null.
// PUT { maximos: [{ categoriaId, maximo }] }: los guarda todos juntos; null
// borra el máximo de esa categoría. Lo hace quien termina el control: la
// cuenta sin PIN con el permiso de gestionarlo.

import { NextResponse } from "next/server";
import { PERMISO_GESTIONAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  guardarMaximos,
  leerMaximosDeLaUbicacion,
  respuestaDeError,
  respuestaDeRechazo,
} from "@/lib/stock/control/controlStockServer";

export async function GET(req) {
  try {
    const a = await autorizarControl(req, PERMISO_GESTIONAR_CONTROL, { lectura: true, persona: "cuenta" });
    if (!a.ok) return respuestaDeRechazo(a);
    const r = await leerMaximosDeLaUbicacion({ localId: a.localId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "leer los máximos de Stock alto");
  }
}

export async function PUT(req) {
  try {
    const a = await autorizarControl(req, PERMISO_GESTIONAR_CONTROL, { persona: "cuenta" });
    if (!a.ok) return respuestaDeRechazo(a);
    const body = await req.json().catch(() => ({}));
    const r = await guardarMaximos({ localId: a.localId, maximos: body.maximos });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "guardar los máximos de Stock alto");
  }
}
