// app/api/turnos-y-cierres/cajas/[id]/ventas/route.js
//
// GET /api/turnos-y-cierres/cajas/:id/ventas — LAS VENTAS DE UNA CAJA.
//
// Todas, en orden de hora, con las anuladas y las internas marcadas; y al pie
// cuántos tickets y cuánto por medio, del resumen de la MISMA caja que dibuja la
// tarjeta, así que coincide con "Ventas en efectivo" y con cada medio.
//
// Existe por la #951: no había forma de saber qué vendió una caja ni a qué hora,
// y el reporte de ventas no dice qué caja vendió.
//
// El permiso y el alcance son los del detalle de la caja, con la misma función
// (`cajaDelModulo`): una caja de otro local da 404 aunque se mande su id a mano.
// Solo lee.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cajaDelModulo } from "@/lib/turnosYCierres/cajaDelModuloServer";
import { leerVentasDeLaCaja } from "@/lib/turnosYCierres/lecturaTurnosYCierresServer";
import { pieDeVentasDeLaCaja } from "@/lib/turnosYCierres/lecturaTurnosYCierres";

export async function GET(req, { params }) {
  try {
    const acceso = await cajaDelModulo(req, prisma, (await params)?.id);
    if (!acceso.ok) {
      return NextResponse.json(
        { ok: false, error: acceso.error, ...(acceso.needsContexto ? { needsContexto: true } : {}) },
        { status: acceso.status }
      );
    }
    const { leida, localId } = acceso;
    const ventas = await leerVentasDeLaCaja(prisma, leida.caja.id);
    return NextResponse.json({
      ok: true,
      local: { id: localId, nombre: leida.caja.local?.nombre || "—" },
      caja: {
        ...leida.detalle,
        fechaOperativa: leida.caja.fechaOperativa,
      },
      ventas,
      pie: pieDeVentasDeLaCaja(leida.detalle),
    });
  } catch (e) {
    console.error("[turnos-y-cierres/cajas/ventas]", e);
    return NextResponse.json({ ok: false, error: `No se pudieron leer las ventas de la caja: ${e.message}` }, { status: 500 });
  }
}
