// app/api/stock_locales/control/productos/route.js
//
// GET: las tarjetas del Control de stock, como la lista de Stock Locales, con el
// total contado de cada una.
//
//   ?filtro=sin_contar|contados (sin filtro: todos) &q= &page=
//   ?codigo=      lo que leyó el lector: UN producto, aunque el filtro lo oculte
//   ?productoLocalId=  el "Contar" de terminar: lo mismo, por id
//
// Lo lee quien cuenta y quien gestiona. Las reglas viven en `lib/stock/control/`.

import { NextResponse } from "next/server";
import { PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL, esFiltroControl } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  listarProductos,
  respuestaDeError,
  respuestaDeRechazo,
} from "@/lib/stock/control/controlStockServer";

export async function GET(req) {
  try {
    const a = await autorizarControl(req, [PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL], { lectura: true, persona: "opcional" });
    if (!a.ok) return respuestaDeRechazo(a);
    const p = req.nextUrl.searchParams;
    const filtro = p.get("filtro");
    const r = await listarProductos({
      localId: a.localId,
      filtro: esFiltroControl(filtro) ? filtro : null,
      q: p.get("q") || "",
      page: Number(p.get("page") || 1),
      codigo: (p.get("codigo") || "").trim() || null,
      productoLocalId: Number(p.get("productoLocalId") || 0) || null,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "leer los productos del control");
  }
}
