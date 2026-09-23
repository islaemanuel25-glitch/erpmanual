// app/api/finanzas/pagos-proveedores/turnos-operativos/route.js
//
// DE QUÉ CAJA PUEDE SALIR UN PAGO EN EFECTIVO: los turnos operativos de la
// ubicación de origen.
//
// "Operativo" es `WHERE_TURNO_OPERATIVO` —la condición con la que el POS decide
// si un turno puede vender— más `anuladoEn: null`, igual que al abrir. No se
// escribe una segunda definición: `registrarPagoProveedor` vuelve a pedir la
// misma al escribir, bajo el lock del turno, así que lo que muestra esta lista
// es una ayuda para elegir y no la garantía.
//
// La ubicación viaja como `origen` y no como `localId`, por lo mismo que el
// tablero usa `destino`: `localId` está reservado para el alcance y a una
// sesión que no es admin se le exige que sea el suyo.

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { WHERE_TURNO_OPERATIVO } from "@/lib/caja/cierreRelevo";
import { resolverLocalPedido } from "@/lib/finanzas/alcanceFinanciero";
import { aCargoDelTurno } from "@/lib/finanzas/actividadFinanciera";
import { PERMISO_REGISTRAR_PAGOS, PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";
import { alcanceDePagos } from "@/lib/finanzas/pagosProveedoresServer";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    // Es parte del formulario de pago: sin permiso de registrar no hay para qué.
    for (const p of [PERMISO_VER_FINANZAS, PERMISO_REGISTRAR_PAGOS]) {
      const perm = checkPerm(session, p);
      if (!perm.ok) {
        return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
      }
    }

    const alcance = await alcanceDePagos(req, session);
    if (alcance.error) {
      return NextResponse.json(
        { ok: false, error: alcance.error, needsContexto: alcance.needsContexto },
        { status: alcance.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const origen = resolverLocalPedido({
      esDeposito: alcance.esDeposito,
      localDeLaSesion: alcance.vista.localId,
      destinoPedido: searchParams.get("origen"),
      localesDelGrupo: alcance.locales,
    });
    if (origen.error) {
      return NextResponse.json({ ok: false, error: origen.error }, { status: 403 });
    }
    if (!origen.localId) return NextResponse.json({ ok: true, turnos: [] });

    const turnos = await prisma.turno.findMany({
      where: { localId: origen.localId, anuladoEn: null, ...WHERE_TURNO_OPERATIVO },
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
