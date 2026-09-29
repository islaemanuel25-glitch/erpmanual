// app/api/finanzas/gastos/[gastoId]/pagos/route.js
//
// REGISTRAR UN PAGO sobre un gasto que ya existe.
//
// La regla vive en `registrarPagoGasto` —la misma puerta que usa el alta para
// el pago inicial—; acá queda lo que es de la ruta: permisos, ver el gasto, y
// rechazar temprano lo que aquélla rechazaría. La forma es la de
// `pagos-proveedores/[cuentaId]/pagos`.
//
// ── CADA UBICACIÓN PAGA SUS GASTOS ───────────────────────────────────────
//
// La plata sale de la ubicación del gasto y la registra quien opera esa
// ubicación. El origen no se elige: se deriva del gasto, y uno distinto en el
// cuerpo es 403. El movimiento de caja tampoco se elige: en efectivo lo crea el
// pago, y un `cajaMovimientoId` en el cuerpo no se lee.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { OPCIONES_TX } from "@/lib/caja/cierreRelevoServer";
import { ERROR_FUERA_DE_ALCANCE } from "@/lib/finanzas/alcanceFinanciero";
import { PERMISO_REGISTRAR_GASTOS, gastoEnAlcance, puedePagarElGasto } from "@/lib/finanzas/gastos";
import {
  ERROR_GASTO_NO_ENCONTRADO,
  ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO,
  ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO,
  ErrorGasto,
  alcanceDeGastos,
  pagoDeGastoYaRegistrado,
  registrarPagoGasto,
} from "@/lib/finanzas/gastosServer";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";

export async function POST(req, { params }) {
  // Lo que hace falta para contestar un P2002 desde el `catch`.
  let gastoIdLeido = null;
  let claveLeida = null;
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    for (const p of [PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_GASTOS]) {
      const perm = checkPerm(session, p);
      if (!perm.ok) {
        return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
      }
    }

    const { gastoId: crudo } = await params;
    const gastoId = Number(crudo);
    if (!Number.isInteger(gastoId) || gastoId <= 0) {
      return NextResponse.json({ ok: false, error: ERROR_GASTO_NO_ENCONTRADO }, { status: 404 });
    }

    const alcance = await alcanceDeGastos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const gasto = await prisma.gasto.findUnique({
      where: { id: gastoId },
      select: { id: true, grupoId: true, localId: true },
    });
    if (!gasto) {
      return NextResponse.json({ ok: false, error: ERROR_GASTO_NO_ENCONTRADO }, { status: 404 });
    }
    if (!gastoEnAlcance(gasto, alcance)) {
      return NextResponse.json({ ok: false, error: ERROR_FUERA_DE_ALCANCE }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    gastoIdLeido = gastoId;
    claveLeida = body?.idempotencyKey ?? null;

    // Ver el gasto no es poder pagarlo: hay que operar su ubicación. Se rechaza
    // antes de abrir la transacción; `registrarPagoGasto` lo vuelve a exigir.
    if (!puedePagarElGasto(gasto, alcance)) {
      return NextResponse.json({ ok: false, error: ERROR_OPERAR_EN_LA_UBICACION_DEL_GASTO }, { status: 403 });
    }

    const pedido = body?.localOrigenId;
    if (pedido !== undefined && pedido !== null && pedido !== "" && Number(pedido) !== gasto.localId) {
      return NextResponse.json({ ok: false, error: ERROR_ORIGEN_DE_OTRA_UBICACION_GASTO }, { status: 403 });
    }

    const resultado = await prisma.$transaction(
      (tx) =>
        registrarPagoGasto(tx, {
          session,
          gastoId,
          monto: body?.monto,
          medio: body?.medio,
          localOrigenId: gasto.localId,
          localOperativoId: alcance.vista.localId,
          turnoId: body?.turnoId,
          fecha: body?.fecha,
          nota: body?.nota,
          idempotencyKey: body?.idempotencyKey,
        }),
      OPCIONES_TX
    );

    // Un reintento del mismo intento contesta 200 con el pago de antes y
    // `repetido: true`: para quien reintenta, el pago está hecho.
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    // Choque contra el UNIQUE (gastoId, idempotencyKey): otro envío del mismo
    // intento ganó la carrera. Se devuelve el pago que quedó.
    if (e?.code === "P2002" && gastoIdLeido && claveLeida) {
      const ganador = await pagoDeGastoYaRegistrado(prisma, { gastoId: gastoIdLeido, idempotencyKey: claveLeida }).catch(() => null);
      if (ganador) return NextResponse.json({ ok: true, ...ganador });
    }
    if (e instanceof ErrorGasto) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[finanzas/gastos/pagos]", e);
    return NextResponse.json({ ok: false, error: `No se pudo registrar el pago: ${e.message}` }, { status: 500 });
  }
}
