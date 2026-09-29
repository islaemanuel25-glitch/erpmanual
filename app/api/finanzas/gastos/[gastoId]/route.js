// app/api/finanzas/gastos/[gastoId]/route.js
//
// UN GASTO, con sus pagos en el orden en que salió la plata.
//
// ── UN GASTO AJENO ES 403, NO 404 ────────────────────────────────────────
//
// El mismo criterio que una cuenta por pagar: el rechazo se ve y dice por qué.
// Uno que no existe sí es 404.
//
// ── VER NO ES PAGAR ──────────────────────────────────────────────────────
//
// `puedeEscribir` es el permiso; `puedePagar` además exige operar la ubicación
// del gasto, con `puedePagarElGasto`, la misma condición que el servidor
// vuelve a exigir al escribir. Es para que la pantalla no ofrezca un botón que
// el servidor va a rechazar, no la garantía.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { ERROR_FUERA_DE_ALCANCE } from "@/lib/finanzas/alcanceFinanciero";
import { MEDIOS_PAGO_GASTO, ROTULO_MEDIO_GASTO, gastoEnAlcance, puedePagarElGasto } from "@/lib/finanzas/gastos";
import {
  ERROR_GASTO_NO_ENCONTRADO,
  SELECT_GASTO,
  SELECT_PAGO_GASTO,
  alcanceDeGastos,
  serializarGasto,
  serializarPagoGasto,
} from "@/lib/finanzas/gastosServer";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";

const noEncontrado = () => NextResponse.json({ ok: false, error: ERROR_GASTO_NO_ENCONTRADO }, { status: 404 });

export async function GET(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const perm = checkPerm(session, PERMISO_VER_FINANZAS);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const { gastoId: crudo } = await params;
    const gastoId = Number(crudo);
    if (!Number.isInteger(gastoId) || gastoId <= 0) return noEncontrado();

    const alcance = await alcanceDeGastos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const gasto = await prisma.gasto.findUnique({ where: { id: gastoId }, select: SELECT_GASTO });
    if (!gasto) return noEncontrado();
    if (!gastoEnAlcance(gasto, alcance)) {
      return NextResponse.json({ ok: false, error: ERROR_FUERA_DE_ALCANCE }, { status: 403 });
    }

    // En el orden en que salió la plata: el día del pago, y dentro del día el
    // orden en que se registró.
    const pagos = await prisma.pagoGasto.findMany({
      where: { gastoId },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
      select: SELECT_PAGO_GASTO,
    });

    return NextResponse.json({
      ok: true,
      gasto: serializarGasto(gasto),
      pagos: pagos.map(serializarPagoGasto),
      puedeEscribir: alcance.puedeEscribir,
      puedePagar: puedePagarElGasto(gasto, alcance),
      medios: MEDIOS_PAGO_GASTO.map((m) => ({ valor: m, texto: ROTULO_MEDIO_GASTO[m] })),
    });
  } catch (e) {
    console.error("[finanzas/gastos/gasto]", e);
    return NextResponse.json({ ok: false, error: `No se pudo abrir el gasto: ${e.message}` }, { status: 500 });
  }
}
