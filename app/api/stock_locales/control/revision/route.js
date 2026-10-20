// app/api/stock_locales/control/revision/route.js
//
// GET: la revisión del control abierto. Por cada producto contado, si el stock
// de hoy es lo contado más lo que pasó después en el Libro. Solo lee.
// POST { productoLocalId }: dejar ese producto en lo que debería, con un Ajuste
// por control que queda en el Libro y en la bitácora. Si ya está bien, no mueve
// nada.
//
// Es de quien gestiona el control, como terminar: corrige stock sin un conteo
// nuevo.

import { NextResponse } from "next/server";
import { PERMISO_GESTIONAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  repararProducto,
  respuestaDeError,
  respuestaDeRechazo,
  revisarControl,
} from "@/lib/stock/control/controlStockServer";

export async function GET(req) {
  try {
    const a = await autorizarControl(req, PERMISO_GESTIONAR_CONTROL, { lectura: true, persona: "cuenta" });
    if (!a.ok) return respuestaDeRechazo(a);
    const r = await revisarControl({ localId: a.localId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "revisar el control");
  }
}

export async function POST(req) {
  try {
    const a = await autorizarControl(req, PERMISO_GESTIONAR_CONTROL, { persona: "cuenta" });
    if (!a.ok) return respuestaDeRechazo(a);
    const body = await req.json().catch(() => ({}));
    const r = await repararProducto({ localId: a.localId, grupoId: a.grupoId, quien: a.quien, productoLocalId: body.productoLocalId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "corregir el stock del producto");
  }
}
