// app/api/finanzas/pagos-proveedores/[cuentaId]/pagos/route.js
//
// REGISTRAR UN PAGO sobre una cuenta por pagar.
//
// La regla vive en `registrarPagoProveedor` —la misma función que usa el
// cierre de la compra para el pago inicial—; acá solo queda lo que es de la
// ruta: permisos, ver la cuenta, y rechazar temprano lo que aquélla rechazaría.
//
// ── CADA UBICACIÓN PAGA SUS DEUDAS ───────────────────────────────────────
//
// La plata sale de la ubicación que debe y la registra quien opera esa
// ubicación. El origen no se elige: se deriva de la cuenta. Antes se elegía con
// `resolverLocalPedido`, que le dejaba al depósito cualquier ubicación del grupo
// —y con eso pagar lo de Casiano con su caja—. Esa regla es de VER, no de pagar.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";
import { ERROR_FUERA_DE_ALCANCE } from "@/lib/finanzas/alcanceFinanciero";
import { PERMISO_REGISTRAR_PAGOS, PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";
import {
  ERROR_CUENTA_NO_ENCONTRADA,
  ERROR_OPERAR_EN_LA_UBICACION_DE_LA_DEUDA,
  ERROR_ORIGEN_DE_OTRA_UBICACION,
  ErrorPagoProveedor,
  alcanceDePagos,
  cuentaEnAlcance,
  pagoYaRegistrado,
  puedePagarLaCuenta,
  registrarPagoProveedor,
} from "@/lib/finanzas/pagosProveedoresServer";

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

    // ── VER LA CUENTA NO ES PODER PAGARLA ─────────────────────────────────
    //
    // Hasta acá llegó porque la ve. Para pagarla hay que estar OPERANDO la
    // ubicación que la debe: el depósito ve las de Casiano y no las paga, y un
    // admin en vista global no opera ninguna. Se rechaza antes de abrir la
    // transacción; `registrarPagoProveedor` lo vuelve a exigir al escribir.
    if (!puedePagarLaCuenta(cuenta, alcance)) {
      return NextResponse.json(
        { ok: false, error: ERROR_OPERAR_EN_LA_UBICACION_DE_LA_DEUDA },
        { status: 403 }
      );
    }

    // EL ORIGEN NO SE ELIGE: es la ubicación de la deuda. Si el cliente manda
    // otro, se rechaza —no se corrige en silencio—, porque un pedido que dice
    // "pagá con la plata del depósito" es un intento de cruce y tiene que verse.
    const pedido = body?.localOrigenId;
    if (pedido !== undefined && pedido !== null && pedido !== "" && Number(pedido) !== cuenta.localGastoId) {
      return NextResponse.json({ ok: false, error: ERROR_ORIGEN_DE_OTRA_UBICACION }, { status: 403 });
    }

    const resultado = await prisma.$transaction(
      (tx) =>
        registrarPagoProveedor(tx, {
          cuentaId,
          monto: body?.monto,
          medio: body?.medio,
          localOrigenId: cuenta.localGastoId,
          localOperativoId: alcance.vista.localId,
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
