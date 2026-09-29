// app/api/finanzas/pagos-proveedores/turnos-operativos/route.js
//
// DE QUÉ CAJA PUEDE SALIR UN PAGO EN EFECTIVO: los turnos operativos de la
// ubicación que opera la sesión, que es la única que puede pagar.
//
// "Operativo" es `WHERE_TURNO_OPERATIVO` —la condición con la que el POS decide
// si un turno puede vender— más `anuladoEn: null`, igual que al abrir. No se
// escribe una segunda definición: `registrarPagoProveedor` vuelve a pedir la
// misma al escribir, bajo el lock del turno, así que lo que muestra esta lista
// es una ayuda para elegir y no la garantía.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { WHERE_TURNO_OPERATIVO } from "@/lib/caja/cierreRelevo";
import { aCargoDelTurno } from "@/lib/finanzas/actividadFinanciera";
import { PERMISO_REGISTRAR_GASTOS } from "@/lib/finanzas/gastos";
import { PERMISO_REGISTRAR_PAGOS } from "@/lib/finanzas/pagosProveedores";
import {
  ERROR_TURNO_DE_OTRA_UBICACION,
  alcanceDePagos,
} from "@/lib/finanzas/pagosProveedoresServer";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    // Es parte del formulario de pago, y el permiso es el de REGISTRAR pagos y
    // nada más. No se exige además `finanzas.ver` porque el formulario también
    // vive en el cierre de una compra, que exige solo ése para pagar: quien
    // puede sacar plata para pagarle a un proveedor tiene que poder elegir de
    // qué caja sale, aunque no mire el resto de Finanzas.
    //
    // El pago de un gasto sale del cajón con la MISMA regla —`resolverSalidaDelPago`—
    // y su formulario necesita la misma lista, así que el permiso de registrar
    // gastos también la abre. No es otra lista: son los mismos turnos, los de la
    // ubicación que opera la sesión.
    const perm = checkPerm(session, PERMISO_REGISTRAR_PAGOS);
    if (!perm.ok && !checkPerm(session, PERMISO_REGISTRAR_GASTOS).ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const alcance = await alcanceDePagos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    // ── SOLO LOS TURNOS DE LA UBICACIÓN QUE OPERA LA SESIÓN ──────────────
    //
    // Una deuda la paga la ubicación que la debe y la registra quien opera esa
    // ubicación, así que el único cajón del que puede salir un efectivo es uno
    // de la ubicación que opera la sesión. Un admin en vista global no opera
    // ninguna: no hay turnos que ofrecerle.
    //
    // `origen`, si viene, tiene que ser esa misma ubicación. Pedir los turnos
    // de otra es 403 y no una lista vacía: es un intento de cruce y se tiene
    // que ver.
    const propia = Number(alcance.vista.localId) || null;
    const { searchParams } = new URL(req.url);
    const pedido = searchParams.get("origen");
    if (pedido && Number(pedido) !== propia) {
      return NextResponse.json({ ok: false, error: ERROR_TURNO_DE_OTRA_UBICACION }, { status: 403 });
    }
    if (!propia) return NextResponse.json({ ok: true, turnos: [] });

    const turnos = await prisma.turno.findMany({
      where: { localId: propia, anuladoEn: null, ...WHERE_TURNO_OPERATIVO },
      orderBy: { apertura: "desc" },
      select: {
        id: true,
        apertura: true,
        vendedor: { select: { nombre: true } },
        operador: { select: { nombre: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      turnos: turnos.map((t) => ({
        id: t.id,
        apertura: t.apertura,
        // Quién está en la caja, con la MISMA función que rotula los turnos en
        // la actividad del tablero.
        quien: aCargoDelTurno({
          operadorNombre: t.operador?.nombre,
          vendedorNombre: t.vendedor?.nombre,
        }),
      })),
    });
  } catch (e) {
    console.error("[finanzas/pagos-proveedores/turnos-operativos]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer los turnos abiertos: ${e.message}` },
      { status: 500 }
    );
  }
}
