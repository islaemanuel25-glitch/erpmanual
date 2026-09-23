// app/api/finanzas/pagos-proveedores/route.js
//
// LAS CUENTAS POR PAGAR A PROVEEDORES QUE QUIEN PREGUNTA PUEDE VER.
//
// Solo GET. No hay POST a propósito: la deuda nace de una compra por
// `crearCuentaPorPagarDesdeCompra`, y Finanzas no la origina a mano.
//
// ── EL ALCANCE LO DECIDE EL SERVIDOR ──────────────────────────────────────
//
// Un local ve las cuentas cuyo GASTO es suyo; el depósito —o un admin en vista
// global— las de todas las ubicaciones del grupo. No se lee ningún `localId`
// del cliente para decidirlo: sale de `resolveVistaOperativa` y de
// `Local.es_deposito`, como en el tablero de Finanzas.
//
// ── EL ESTADO SE FILTRA DESPUÉS DE CALCULARLO ─────────────────────────────
//
// Pendiente, parcial y pagada no son columnas: salen de total y pagos con
// `estadoDeCuenta`. Por eso se traen las cuentas del alcance y se filtran acá,
// con la misma función que usa la pantalla para dibujar el estado.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import {
  PERMISO_VER_FINANZAS,
  cuentaPasaFiltro,
  filtroDeCuentas,
} from "@/lib/finanzas/pagosProveedores";
import {
  SELECT_CUENTA,
  alcanceDePagos,
  serializarCuenta,
} from "@/lib/finanzas/pagosProveedoresServer";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const perm = checkPerm(session, PERMISO_VER_FINANZAS);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const alcance = await alcanceDePagos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const filtro = filtroDeCuentas(searchParams.get("estado"));

    const filas = alcance.visibles.length
      ? await prisma.cuentaPorPagarProveedor.findMany({
          where: { grupoId: alcance.grupoId, localGastoId: { in: alcance.visibles } },
          orderBy: [{ createdAt: "desc" }],
          select: SELECT_CUENTA,
        })
      : [];

    const cuentas = filas.map(serializarCuenta).filter((c) => cuentaPasaFiltro(c.estado, filtro));

    return NextResponse.json({
      ok: true,
      estado: filtro,
      puedeEscribir: alcance.puedeEscribir,
      // Con más de una ubicación a la vista, la tarjeta tiene que decir de cuál
      // es cada gasto; con una sola, repetirla en cada tarjeta no informa nada.
      variasUbicaciones: alcance.visibles.length > 1,
      cuentas,
    });
  } catch (e) {
    console.error("[finanzas/pagos-proveedores]", e);
    // El mensaje dice QUÉ pasó: "Error interno" deja a la pantalla muda.
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer las cuentas por pagar: ${e.message}` },
      { status: 500 }
    );
  }
}
