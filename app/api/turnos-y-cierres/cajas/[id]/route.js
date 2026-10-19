// app/api/turnos-y-cierres/cajas/[id]/route.js
//
// GET /api/turnos-y-cierres/cajas/:id — EL DETALLE DE UNA CAJA Y SU Z.
//
// La diferencia, lo que tenía que haber y lo contado; lo cobrado por medio con
// el fiado aparte; los arqueos y el cierre con su diferencia acumulada tal cual
// se guardó; las salidas de efectivo; y los datos del comprobante Z con la forma
// que ya imprimía la ficha del turno.
//
// El alcance es el de la lista (`alcanceDeCajas`): una caja de otro local no
// existe para esta sesión (404) y la de otro operador, para un cajero, tampoco
// se muestra (403). Lo decide `cajaDelModulo`, el mismo que usa la ruta de sus
// ventas. Solo lee.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cajaDelModulo } from "@/lib/turnosYCierres/cajaDelModuloServer";

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

    return NextResponse.json({
      ok: true,
      local: { id: localId, nombre: leida.caja.local?.nombre || "—" },
      caja: {
        ...leida.detalle,
        fechaOperativa: leida.caja.fechaOperativa,
      },
      arqueos: leida.arqueos,
      z: leida.z,
    });
  } catch (e) {
    console.error("[turnos-y-cierres/cajas]", e);
    return NextResponse.json({ ok: false, error: `No se pudo leer la caja: ${e.message}` }, { status: 500 });
  }
}
