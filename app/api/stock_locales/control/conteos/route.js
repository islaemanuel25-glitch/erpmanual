// app/api/stock_locales/control/conteos/route.js
//
// POST { productoLocalId, cantidad }: guardar un conteo. El primero del producto
// en el control fija el stock en lo contado; los siguientes suman. Se aplica en
// el momento.

import { NextResponse } from "next/server";
import { PERMISO_CONTAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  registrarConteo,
  respuestaDeError,
  respuestaDeRechazo,
} from "@/lib/stock/control/controlStockServer";

export async function POST(req) {
  try {
    const a = await autorizarControl(req, PERMISO_CONTAR_CONTROL);
    if (!a.ok) return respuestaDeRechazo(a);
    const body = await req.json().catch(() => ({}));
    const r = await registrarConteo({
      localId: a.localId,
      grupoId: a.grupoId,
      quien: a.quien,
      productoLocalId: Number(body.productoLocalId || 0),
      cantidad: body.cantidad,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "guardar el conteo");
  }
}
