// app/api/stock_locales/control/conteos/[id]/route.js
//
// PATCH { cantidad }: corregir un conteo propio. DELETE: borrarlo. Solo quien
// contó, y solo con el control abierto; el stock se ajusta por la diferencia.

import { NextResponse } from "next/server";
import { PERMISO_CONTAR_CONTROL } from "@/lib/stock/control/controlStock";
import {
  autorizarControl,
  corregirConteo,
  respuestaDeError,
  respuestaDeRechazo,
} from "@/lib/stock/control/controlStockServer";

async function cambiar(req, context, { borrar }) {
  const a = await autorizarControl(req, PERMISO_CONTAR_CONTROL);
  if (!a.ok) return respuestaDeRechazo(a);
  const { id } = await context.params;
  const body = borrar ? {} : await req.json().catch(() => ({}));
  const r = await corregirConteo({
    localId: a.localId,
    grupoId: a.grupoId,
    quien: a.quien,
    conteoId: Number(id),
    cantidad: body.cantidad,
    borrar,
  });
  return NextResponse.json({ ok: true, ...r });
}

export async function PATCH(req, context) {
  try {
    return await cambiar(req, context, { borrar: false });
  } catch (e) {
    return respuestaDeError(e, "corregir el conteo");
  }
}

export async function DELETE(req, context) {
  try {
    return await cambiar(req, context, { borrar: true });
  } catch (e) {
    return respuestaDeError(e, "borrar el conteo");
  }
}
