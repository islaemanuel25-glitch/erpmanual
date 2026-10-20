// app/api/stock_locales/control/route.js
//
// GET: el Control de stock del local con el que se trabaja. Sin control
// abierto, el último terminado; con control, el avance, quién está contando y
// lo que contó esta persona.
//
// Lo leen quien cuenta y quien gestiona. La persona es opcional para leer: el
// dueño o una cuenta con PIN pendiente ven el estado aunque todavía no puedan
// contar. Las reglas viven en `lib/stock/control/`.

import { NextResponse } from "next/server";
import { PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL } from "@/lib/stock/control/controlStock";
import { autorizarControl, leerEstado, respuestaDeError, respuestaDeRechazo } from "@/lib/stock/control/controlStockServer";

export async function GET(req) {
  try {
    const a = await autorizarControl(req, [PERMISO_CONTAR_CONTROL, PERMISO_GESTIONAR_CONTROL], { lectura: true, persona: "opcional" });
    if (!a.ok) return respuestaDeRechazo(a);
    const estado = await leerEstado({ localId: a.localId, quien: a.quien });
    return NextResponse.json({ ok: true, ...estado, quien: a.quien ? { nombre: a.quien.nombre } : null });
  } catch (e) {
    return respuestaDeError(e, "leer el control de stock");
  }
}
