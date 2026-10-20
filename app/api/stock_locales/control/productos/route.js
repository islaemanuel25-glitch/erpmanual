// app/api/stock_locales/control/productos/route.js
//
// GET: UNA tarjeta del Control de stock, con su conteo.
//
//   ?codigo=           lo que leyó el lector
//   ?productoLocalId=  el "Contar" de terminar
//
// Aparece aunque el chip activo la ocultara. La LISTA no sale de acá: es la de
// Stock Locales (`/api/stock_locales/listar?control=`). Sin producto del local
// con ese código, `item` va en null y la pantalla filtra por el texto.

import { NextResponse } from "next/server";
import { PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  buscarProducto,
  respuestaDeError,
  respuestaDeRechazo,
} from "@/lib/stock/control/controlStockServer";

export async function GET(req) {
  try {
    const a = await autorizarControl(req, [PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL], { lectura: true, persona: "opcional" });
    if (!a.ok) return respuestaDeRechazo(a);
    const p = req.nextUrl.searchParams;
    const codigo = (p.get("codigo") || "").trim() || null;
    const productoLocalId = Number(p.get("productoLocalId") || 0) || null;
    if (!codigo && !productoLocalId) {
      return NextResponse.json({ ok: false, error: "Falta el código o el producto." }, { status: 400 });
    }
    const r = await buscarProducto({ localId: a.localId, codigo, productoLocalId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "leer el producto");
  }
}
