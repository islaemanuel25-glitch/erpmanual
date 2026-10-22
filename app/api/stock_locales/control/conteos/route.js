// app/api/stock_locales/control/conteos/route.js
//
// PUT { productoLocalId, total }: aceptar el TOTAL contado de un producto en el
// control. Se mide contra el stock vivo de ese instante y el stock pasa a ser lo
// contado, sea el primer conteo o uno que lo vuelve a contar; `total: null` lo
// borra, deshace su ajuste y el producto vuelve a "Sin contar". `estaBien: true`
// en lugar de `total`: el total es el stock del sistema en ese momento. Se
// aplica en el momento. Contesta la tarjeta como queda y los contadores.

import { NextResponse } from "next/server";
import { PERMISO_CONTAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  fijarTotal,
  respuestaDeError,
  respuestaDeRechazo,
} from "@/lib/stock/control/controlStockServer";

export async function PUT(req) {
  try {
    const a = await autorizarControl(req, PERMISO_CONTAR_CONTROL);
    if (!a.ok) return respuestaDeRechazo(a);
    const body = await req.json().catch(() => ({}));
    const r = await fijarTotal({
      localId: a.localId,
      grupoId: a.grupoId,
      quien: a.quien,
      productoLocalId: Number(body.productoLocalId || 0),
      total: body.total === null || body.total === undefined || body.total === "" ? null : body.total,
      estaBien: body.estaBien === true,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return respuestaDeError(e, "guardar el conteo");
  }
}
