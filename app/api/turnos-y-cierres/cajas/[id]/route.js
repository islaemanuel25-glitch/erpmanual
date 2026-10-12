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
// se muestra (403). Solo lee.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { puedeOperarSinOperador } from "@/lib/operador";
import { identidadParaMirar } from "@/lib/caja/identidadCajaServer";
import { PERMISO_CAJERO, PERMISOS_VER_TODO, alcanceDeCajas, puedeVerCajaDelModulo } from "@/lib/turnosYCierres/alcance";
import { leerDetalleDeCaja } from "@/lib/turnosYCierres/lecturaTurnosYCierresServer";

export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

    const perm = checkPerm(session, [PERMISO_CAJERO, ...PERMISOS_VER_TODO]);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const cajaId = Number((await params)?.id);
    if (!Number.isInteger(cajaId) || cajaId <= 0) {
      return NextResponse.json({ ok: false, error: "Número de caja inválido." }, { status: 400 });
    }

    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json({ ok: false, error: vista.error, needsContexto: vista.needsContexto }, { status: vista.status });
    }
    if (!vista.localId) {
      return NextResponse.json({ ok: false, error: "Elegí un local para ver sus cajas.", needsContexto: true }, { status: 409 });
    }
    const localId = vista.localId;

    const alcance = alcanceDeCajas(session, { esDueno: puedeOperarSinOperador(session, { localId }) });
    if (!alcance) return NextResponse.json({ ok: false, error: "Sin permiso para ver cajas." }, { status: 403 });

    const leida = await leerDetalleDeCaja(prisma, cajaId);
    if (!leida || leida.caja.localId !== localId) {
      return NextResponse.json({ ok: false, error: `No existe la caja #${cajaId} en este local.` }, { status: 404 });
    }
    const identidad = await identidadParaMirar(req, session, { localId });
    if (!puedeVerCajaDelModulo(leida.caja, { localId, alcance, identidad })) {
      return NextResponse.json({ ok: false, error: "Esa caja es de otro operador." }, { status: 403 });
    }

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
