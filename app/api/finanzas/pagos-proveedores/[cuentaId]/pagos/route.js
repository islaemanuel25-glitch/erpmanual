// app/api/finanzas/pagos-proveedores/[cuentaId]/pagos/route.js
//
// REGISTRAR UN PAGO sobre una cuenta por pagar.
//
// La regla vive en `registrarPagoProveedor` —la misma función que va a usar el
// cierre de la compra para el pago inicial—; acá solo queda lo que es de la
// ruta: permisos, alcance y de qué ubicación puede salir la plata.
//
// ── DE DÓNDE SALE LA PLATA, Y QUIÉN PUEDE ELEGIRLO ───────────────────────
//
// Con `resolverLocalPedido`, la misma regla que el tablero usa para abrir un
// local: quien no es depósito solo puede pagar desde SU local —pedir otro es
// 403, no un silencioso "te lo pago del tuyo"— y el depósito elige cualquiera
// de su grupo. El número que manda el cliente se comprueba contra la lista del
// grupo, no se cree.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";
import { ERROR_FUERA_DE_ALCANCE, resolverLocalPedido } from "@/lib/finanzas/alcanceFinanciero";
import { PERMISO_REGISTRAR_PAGOS, PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";
import {
  ERROR_CUENTA_NO_ENCONTRADA,
  ErrorPagoProveedor,
  alcanceDePagos,
  cuentaEnAlcance,
  pagoYaRegistrado,
  registrarPagoProveedor,
} from "@/lib/finanzas/pagosProveedoresServer";

const ERROR_FALTA_ORIGEN ="Elegí de qué ubicación sale el dinero.";

export async function POST(req, { params }) {
  // Lo que hace falta para contestar un P2002 desde el `catch`.
  let cuentaIdLeida = null;
  let claveLeida = null;
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    for (const p of [PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_PAGOS]) {
      const perm = checkPerm(session, p);
      if (!perm.ok) {
        return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
      }
    }

    const { cuentaId: crudo } = await params;
    const cuentaId = Number(crudo);
    if (!Number.isInteger(cuentaId) || cuentaId <= 0) {
      return NextResponse.json({ ok: false, error: ERROR_CUENTA_NO_ENCONTRADA }, { status: 404 });
    }

    const alcance = await alcanceDePagos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const cuenta = await prisma.cuentaPorPagarProveedor.findUnique({
      where: { id: cuentaId },
      select: { id: true, grupoId: true, localGastoId: true },
    });
    if (!cuenta) {
      return NextResponse.json({ ok: false, error: ERROR_CUENTA_NO_ENCONTRADA }, { status: 404 });
    }
    if (!cuentaEnAlcance(cuenta, alcance)) {
      return NextResponse.json({ ok: false, error: ERROR_FUERA_DE_ALCANCE }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    cuentaIdLeida = cuentaId;
    claveLeida = body?.idempotencyKey ?? null;

    const origen = resolverLocalPedido({
      esDeposito: alcance.esDeposito,
      localDeLaSesion: alcance.vista.localId,
      destinoPedido: body?.localOrigenId,
      localesDelGrupo: alcance.locales,
    });
    if (origen.error) {
      return NextResponse.json({ ok: false, error: origen.error }, { status: 403 });
    }
    if (!origen.localId) {
      return NextResponse.json({ ok: false, error: ERROR_FALTA_ORIGEN }, { status: 400 });
    }

    const resultado = await prisma.$transaction(
      (tx) =>
        registrarPagoProveedor(tx, {
          cuentaId,
          monto: body?.monto,
          medio: body?.medio,
          localOrigenId: origen.localId,
          turnoId: body?.turnoId,
          fecha: body?.fecha,
          nota: body?.nota,
          idempotencyKey: body?.idempotencyKey,
          usuarioId: session.id,
        }),
      OPCIONES_TX
    );

    // Un reintento del mismo intento contesta 200 con el pago de antes y
    // `repetido: true`: para quien reintenta, el pago está hecho, que es la
    // verdad. Es la respuesta del arqueo de Caja.
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    // Choque contra el UNIQUE (cuentaId, idempotencyKey): otro envío del mismo
    // intento ganó la carrera. No es un error para quien paga: se devuelve el
    // pago que quedó.
    if (e?.code === "P2002" && cuentaIdLeida && claveLeida) {
      const ganador = await pagoYaRegistrado(prisma, {
        cuentaId: cuentaIdLeida,
        idempotencyKey: claveLeida,
      }).catch(() => null);
      if (ganador) return NextResponse.json({ ok: true, ...ganador });
    }
    if (e instanceof ErrorPagoProveedor) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[finanzas/pagos-proveedores/pagos]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo registrar el pago: ${e.message}` },
      { status: 500 }
    );
  }
}
