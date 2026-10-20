// app/api/stock_locales/control/producto/route.js
//
// GET ?productoLocalId=: el producto escaneado, listo para contar: en qué unidad
// se cuenta y el aviso si otra persona ya lo contó en este control.

import { NextResponse } from "next/server";
import { PERMISO_CONTAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  leerProductoParaContar,
  respuestaDeError,
  respuestaDeRechazo,
} from "@/lib/stock/control/controlStockServer";

export async function GET(req) {
  try {
    const a = await autorizarControl(req, PERMISO_CONTAR_CONTROL, { lectura: true });
    if (!a.ok) return respuestaDeRechazo(a);
    const productoLocalId = Number(req.nextUrl.searchParams.get("productoLocalId") || 0);
    if (!productoLocalId) return NextResponse.json({ ok: false, error: "Falta el producto." }, { status: 400 });
    const r = await leerProductoParaContar({ localId: a.localId, productoLocalId, quien: a.quien });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "leer el producto");
  }
}
