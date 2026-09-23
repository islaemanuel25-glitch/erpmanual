// app/api/finanzas/pagos-proveedores/[cuentaId]/route.js
//
// UNA CUENTA POR PAGAR: GET la abre con su historial, PATCH mueve la fecha
// prevista de pago.
//
// ── EL HISTORIAL DICE DE DÓNDE SALIÓ LA PLATA ────────────────────────────
//
// Cada pago viaja con su ubicación de ORIGEN, que puede no ser la del gasto: el
// depósito le paga a Arcor una compra de Casiano. La cuenta dice de quién es el
// gasto; el pago, de qué caja salió.
//
// ── UNA CUENTA AJENA ES 403, NO 404 ──────────────────────────────────────
//
// Mismo criterio que el tablero de Finanzas con un local que no es tuyo: el
// rechazo se ve y dice por qué. Una que no existe sí es 404.
//
// ── PATCH SOLO TOCA LA FECHA PREVISTA ────────────────────────────────────
//
// Es la decisión NUESTRA de cuándo pagar. El vencimiento es la condición que dio
// el proveedor y no se reescribe desde acá; si viene en el cuerpo, se ignora.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { ERROR_FUERA_DE_ALCANCE } from "@/lib/finanzas/alcanceFinanciero";
import {
  MEDIOS_PAGO_PROVEEDOR,
  PERMISO_REGISTRAR_PAGOS,
  PERMISO_VER_FINANZAS,
  ROTULO_MEDIO_PAGO,
} from "@/lib/finanzas/pagosProveedores";
import {
  ERROR_CUENTA_NO_ENCONTRADA,
  ErrorPagoProveedor,
  SELECT_CUENTA,
  SELECT_PAGO,
  alcanceDePagos,
  cambiarFechaPrevistaPago,
  cuentaEnAlcance,
  puedePagarLaCuenta,
  serializarCuenta,
  serializarPago,
} from "@/lib/finanzas/pagosProveedoresServer";

function idDeCuenta(crudo) {
  const n = Number(crudo);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const noEncontrada = () =>
  NextResponse.json({ ok: false, error: ERROR_CUENTA_NO_ENCONTRADA }, { status: 404 });
const ajena = () => NextResponse.json({ ok: false, error: ERROR_FUERA_DE_ALCANCE }, { status: 403 });

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

    const { cuentaId: crudo } = await params;
    const cuentaId = idDeCuenta(crudo);
    if (!cuentaId) return noEncontrada();

    const alcance = await alcanceDePagos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const cuenta = await prisma.cuentaPorPagarProveedor.findUnique({
      where: { id: cuentaId },
      select: SELECT_CUENTA,
    });
    if (!cuenta) return noEncontrada();
    if (!cuentaEnAlcance(cuenta, alcance)) return ajena();

    const pagos = await prisma.pagoProveedor.findMany({
      where: { cuentaId },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      select: SELECT_PAGO,
    });

    return NextResponse.json({
      ok: true,
      cuenta: serializarCuenta(cuenta),
      pagos: pagos.map(serializarPago),
      // Dos respuestas distintas, a propósito. `puedeEscribir` es el permiso, y
      // habilita la fecha prevista de una cuenta que se ve. `puedePagar` además
      // exige operar la ubicación que debe: VER una cuenta no es poder PAGARLA.
      // El origen no viaja como lista: es siempre la ubicación de la deuda,
      // que ya va en `cuenta.localGasto`.
      puedeEscribir: alcance.puedeEscribir,
      puedePagar: puedePagarLaCuenta(cuenta, alcance),
      medios: MEDIOS_PAGO_PROVEEDOR.map((m) => ({ valor: m, texto: ROTULO_MEDIO_PAGO[m] })),
    });
  } catch (e) {
    console.error("[finanzas/pagos-proveedores/cuenta]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo abrir la cuenta por pagar: ${e.message}` },
      { status: 500 }
    );
  }
}

export async function PATCH(req, { params }) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    // Los DOS: ver Finanzas y escribir en pagos. Escribir sin poder ver no es un
    // caso que tenga sentido habilitar.
    for (const p of [PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_PAGOS]) {
      const perm = checkPerm(session, p);
      if (!perm.ok) {
        return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
      }
    }

    const { cuentaId: crudo } = await params;
    const cuentaId = idDeCuenta(crudo);
    if (!cuentaId) return noEncontrada();

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
    if (!cuenta) return noEncontrada();
    if (!cuentaEnAlcance(cuenta, alcance)) return ajena();

    const body = await req.json().catch(() => ({}));
    if (!body || !Object.prototype.hasOwnProperty.call(body, "fechaPrevistaPago")) {
      return NextResponse.json(
        { ok: false, error: "Falta la fecha prevista de pago (o null para quitarla)." },
        { status: 400 }
      );
    }

    const actualizada = await cambiarFechaPrevistaPago(prisma, {
      cuentaId,
      fechaPrevistaPago: body.fechaPrevistaPago,
    });
    return NextResponse.json({ ok: true, cuenta: actualizada });
  } catch (e) {
    if (e instanceof ErrorPagoProveedor) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    }
    console.error("[finanzas/pagos-proveedores/cuenta PATCH]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo cambiar la fecha prevista: ${e.message}` },
      { status: 500 }
    );
  }
}
