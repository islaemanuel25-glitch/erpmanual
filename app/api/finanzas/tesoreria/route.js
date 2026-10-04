// app/api/finanzas/tesoreria/route.js
//
// GET /api/finanzas/tesoreria — LA LECTURA DE TESORERÍA, SERVER-DRIVEN.
//
//   ?unidad=DIA|SEMANA|MES|OTRO   (por defecto DIA)
//   &desplazamiento=0|-1|…   (0 = el período en curso; no va con OTRO)
//   &desde=AAAA-MM-DD&hasta=AAAA-MM-DD   (solo con OTRO, y las dos)
//   &destino=<localId>       (solo el depósito puede pedir otro local de su grupo)
//   &entrada=1               (el depósito pide la lista de locales)
//
// OTRO es el rango elegido a mano, con los nombres de Transferencias y la
// validación de Finanzas (`leerRangoElegido`): un rango mal formado, invertido,
// incompleto, o fechas sin OTRO, son 400 —nunca se cae en silencio a otra
// unidad—. No navega: `puedeAvanzar` y `puedeRetroceder` van en false.
//
// Es una capa FINA: decide quién puede mirar qué local y qué período, y le pide
// todo lo demás a `leerTesoreria` (lib/tesoreria/lecturaTesoreriaServer.js).
// Ninguna regla de plata vive acá: qué es efectivo declarado, qué resta y qué
// no, cómo se agrupan las cajas en turnos comerciales. Si mañana cambia una de
// esas reglas, esta ruta no se entera.
//
// Solo lee. Ninguna escritura, ni siquiera de bitácora.
//
// ── EL ALCANCE ES EL DE FINANZAS ────────────────────────────────────────
//
// Quién mira qué local sale de los MISMOS resolutores que el tablero de
// Finanzas —`resolveVistaOperativa`, `esVistaDeDeposito`, `resolverLocalPedido`
// —: un local mira solo el suyo y pedir otro es 403; el depósito, cualquiera de
// su grupo. No hay un segundo sistema de alcance.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { esVistaDeDeposito, resolverLocalPedido } from "@/lib/finanzas/alcanceFinanciero";
import { localesDeFinanzas } from "@/lib/finanzas/localesDelGrupo";
import {
  CLAVE_OTRO_FINANZAS,
  DESPLAZAMIENTO_POR_DEFECTO,
  ERROR_RANGO_SIN_OTRO,
  descripcionFinanciera,
  desplazamientoFinanciero,
  leerRangoElegido,
  puedeAvanzar,
  unidadFinanciera,
} from "@/lib/finanzas/periodoFinanciero";
import { corteDeUbicacion } from "@/lib/semanaOperativa/semanaOperativa";
import { primerDiaComercialDelLocal } from "@/lib/finanzas/primerDiaComercialServer";
import { leerTesoreria, rangoDeTesoreria } from "@/lib/tesoreria/lecturaTesoreriaServer";
import {
  PERMISO_ANULAR_VERIFICACION,
  PERMISO_VER_TESORERIA,
  PERMISO_VERIFICAR_EFECTIVO,
} from "@/lib/tesoreria/permisos";

const ERROR_OTRO_SIN_DESPLAZAMIENTO = "Un período elegido con «Otro» no se desplaza: no mandes desplazamiento.";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    // Admin pasa por el comodín "*", como en todo el ERP.
    const perm = checkPerm(session, PERMISO_VER_TESORERIA);
    if (!perm.ok) {
      return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });
    }

    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json(
        { ok: false, error: vista.error, needsContexto: vista.needsContexto },
        { status: vista.status }
      );
    }

    const { searchParams } = new URL(req.url);
    const esOtro = String(searchParams.get("unidad") || "").toUpperCase() === CLAVE_OTRO_FINANZAS;
    const conFechas = searchParams.has("desde") || searchParams.has("hasta");
    let rangoFijo = null;
    if (esOtro) {
      // Un rango elegido no se desplaza: pedir las dos cosas es ambiguo.
      if (searchParams.has("desplazamiento")) {
        return NextResponse.json({ ok: false, error: ERROR_OTRO_SIN_DESPLAZAMIENTO }, { status: 400 });
      }
      const leido = leerRangoElegido({ desde: searchParams.get("desde"), hasta: searchParams.get("hasta") });
      if (leido.error) return NextResponse.json({ ok: false, error: leido.error }, { status: 400 });
      rangoFijo = leido.rango;
    } else if (conFechas) {
      return NextResponse.json({ ok: false, error: ERROR_RANGO_SIN_OTRO }, { status: 400 });
    }
    const unidad = esOtro ? CLAVE_OTRO_FINANZAS : unidadFinanciera(searchParams.get("unidad"));
    const desplazamiento = esOtro
      ? DESPLAZAMIENTO_POR_DEFECTO
      : desplazamientoFinanciero(searchParams.get("desplazamiento") ?? DESPLAZAMIENTO_POR_DEFECTO);

    const localPropio = vista.localId
      ? await prisma.local.findUnique({
          where: { id: vista.localId },
          select: { id: true, nombre: true, es_deposito: true },
        })
      : null;
    const esDeposito = esVistaDeDeposito({ modo: vista.modo, localPropio });
    const { locales } = await localesDeFinanzas(vista.grupoId);

    // El depósito sin local elegido recibe la lista, sin importes: un importe
    // es siempre el de un período y un local, y acá todavía no hay ninguno.
    if (searchParams.get("entrada") === "1" && esDeposito) {
      return NextResponse.json({ ok: true, vista: "ENTRADA", locales });
    }

    // `destino` y no `localId`: el mismo nombre y la misma regla que el
    // tablero. `resolveVistaOperativa` no mira este parámetro; esto sí.
    const alcance = resolverLocalPedido({
      esDeposito,
      localDeLaSesion: vista.localId,
      destinoPedido: searchParams.get("destino"),
      localesDelGrupo: locales,
    });
    if (alcance.error) {
      return NextResponse.json({ ok: false, error: alcance.error }, { status: 403 });
    }
    if (!alcance.localId) {
      return NextResponse.json({ ok: true, vista: "ENTRADA", locales });
    }
    const localId = alcance.localId;

    // El período con la misma semántica que Finanzas: Día, Semana operativa de
    // la ubicación, Mes; cortado en días argentinos.
    const rango = await rangoDeTesoreria(prisma, { localId, unidad, desplazamiento, rangoFijo });
    const [lectura, primerMovimiento] = await Promise.all([
      leerTesoreria(prisma, { localId, fechaInicio: rango.fechaInicio, fechaFin: rango.fechaFin }),
      primerDiaComercialDelLocal(prisma, localId),
    ]);

    const delGrupo = locales.find((l) => l.localId === localId);
    const semanaDelLocal = corteDeUbicacion(rango.vigencias);

    return NextResponse.json({
      ok: true,
      vista: "UN_LOCAL",
      unidad,
      // Con OTRO no hay desplazamiento: el período es el elegido.
      desplazamiento: esOtro ? null : desplazamiento,
      local: {
        id: localId,
        nombre: delGrupo?.nombre || localPropio?.nombre || "—",
        esDeposito: Boolean(delGrupo?.esDeposito),
        inactivo: Boolean(delGrupo?.inactivo),
        diaDeCorte: semanaDelLocal.diaDeCorte,
        sinConfigurar: semanaDelLocal.sinConfigurar,
      },
      periodo: {
        rango: { desde: rango.desde, hasta: rango.hasta },
        // Los instantes exactos con que se filtró la base, para que nadie
        // reconstruya el corte del día en la pantalla.
        instantes: { desde: rango.fechaInicio, hasta: rango.fechaFin },
        descripcion: descripcionFinanciera({ unidad, desplazamiento, vigencias: rango.vigencias, rangoFijo }),
      },
      // Un rango elegido no navega con flechas: se elige otro.
      puedeAvanzar: esOtro ? false : puedeAvanzar(desplazamiento),
      // Hacia atrás, hasta donde haya dato; mismo criterio que el tablero.
      puedeRetroceder: esOtro ? false : Boolean(primerMovimiento && rango.desde > primerMovimiento),
      primerMovimiento,
      // Qué puede HACER quien pregunta sobre ESTE local —que ya pasó el alcance
      // de arriba—, con los permisos reales de la sesión (el comodín "*"
      // incluido). Las acciones vuelven a chequear todo: esto es para no ofrecer
      // un botón que el servidor va a rechazar.
      puedeVerificarEfectivo: checkPerm(session, PERMISO_VERIFICAR_EFECTIVO).ok,
      puedeAnularVerificacion: checkPerm(session, PERMISO_ANULAR_VERIFICACION).ok,
      // La lectura, tal cual la arma el dominio: resumen, turnos comerciales,
      // cajas, entregas, egresos, pagos desde caja y alertas.
      tesoreria: lectura,
    });
  } catch (e) {
    console.error("[finanzas/tesoreria]", e);
    // El mensaje dice QUÉ pasó: "Error interno" deja a la pantalla muda.
    return NextResponse.json(
      { ok: false, error: `No se pudo armar la lectura de Tesorería: ${e.message}` },
      { status: 500 }
    );
  }
}
