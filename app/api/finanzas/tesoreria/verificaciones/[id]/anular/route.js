// app/api/finanzas/tesoreria/verificaciones/[id]/anular/route.js
//
// POST /api/finanzas/tesoreria/verificaciones/:id/anular   { motivo }
//
// ANULA una verificación de efectivo. Es la única corrección posible: no se
// edita lo contado, se anula y se verifica de nuevo. La anulada queda con todo
// lo que se verificó, más cuándo, quién y por qué se anuló; sus entregas quedan
// libres para otra verificación.
//
// Pide `tesoreria.anular_verificacion`; verificar no alcanza. El alcance es el
// de Finanzas: la verificación tiene que ser de un local que quien pide ve.
//
// Repetirla es seguro: si ya estaba anulada contesta 200 con `yaEstabaAnulada:
// true` y lo que quedó, sin escribir —la primera anulación no se pisa—. La
// clave natural es la verificación misma: una ANULADA no vuelve a VIGENTE.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";
import { alcanceDePagos } from "@/lib/finanzas/pagosProveedoresServer";
import { idPositivo } from "@/lib/pos-ventas/cobroOffline";
import { PERMISO_ANULAR_VERIFICACION } from "@/lib/tesoreria/permisos";
import {
  CODIGO_VERIFICACION,
  RechazoVerificacion,
  anularVerificacion,
  verificacionPorId,
} from "@/lib/tesoreria/verificacionEfectivoServer";

const rechazo = (e) =>
  NextResponse.json({ ok: false, codigo: e.codigo, error: e.message, detalle: e.detalle ?? null }, { status: e.status });

export async function POST(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const perm = checkPerm(session, PERMISO_ANULAR_VERIFICACION);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const verificacionId = idPositivo((await params)?.id);
    if (!verificacionId) {
      return NextResponse.json(
        { ok: false, codigo: CODIGO_VERIFICACION.PEDIDO_INVALIDO, error: "Verificación inválida." },
        { status: 400 }
      );
    }
    const body = await req.json().catch(() => ({}));

    const alcance = await alcanceDePagos(req, session, { permisoEscribir: PERMISO_ANULAR_VERIFICACION });
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }
    const v = await verificacionPorId(prisma, verificacionId);
    if (!alcance.visibles.includes(v.localId)) {
      throw new RechazoVerificacion(CODIGO_VERIFICACION.FUERA_DE_ALCANCE, "La verificación es de un local fuera de tu alcance.", 403);
    }

    const resultado = await prisma.$transaction(
      (tx) => anularVerificacion(tx, { verificacionId, usuarioId: session.id, motivo: body?.motivo }),
      OPCIONES_TX
    );
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof RechazoVerificacion) return rechazo(e);
    console.error("[finanzas/tesoreria/verificaciones anular]", e);
    return NextResponse.json({ ok: false, error: `No se pudo anular la verificación: ${e.message}` }, { status: 500 });
  }
}
