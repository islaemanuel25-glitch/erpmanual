// app/api/turnos-y-cierres/route.js
//
// GET /api/turnos-y-cierres — LA LECTURA DE "TURNOS Y CIERRES".
//
//   ?unidad=DIA|SEMANA|MES|OTRO   (por defecto DIA)
//   &desplazamiento=0|-1|…        (0 = el período en curso; no va con OTRO)
//   &desde=AAAA-MM-DD&hasta=AAAA-MM-DD   (solo con OTRO, y las dos)
//
// El período tiene la semántica de Tesorería —`rangoDeTesoreria`, las mismas
// validaciones y los mismos textos de `descripcionFinanciera`—, y el local es
// el de la vista operativa de la sesión.
//
// QUIÉN VE QUÉ lo decide `alcanceDeCajas` (lib/turnosYCierres/alcance.js):
//   · reportes.ver, tesoreria.ver o el dueño → el local entero, por período
//     (vista LOCAL);
//   · solo pos.usar → SUS cajas, la de hoy y las anteriores, sin período
//     (vista MIS_CAJAS). Nunca las de otro operador.
//
// Es una capa fina: los números los arma `leerTurnosYCierres`. Solo lee.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { puedeOperarSinOperador } from "@/lib/operador";
import { identidadParaMirar } from "@/lib/caja/identidadCajaServer";
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
import { primerDiaComercialDelLocal } from "@/lib/finanzas/primerDiaComercialServer";
import { rangoDeTesoreria } from "@/lib/tesoreria/lecturaTesoreriaServer";
import { ALCANCE, PERMISO_VER_TURNOS_Y_CIERRES, alcanceDeCajas } from "@/lib/turnosYCierres/alcance";
import { leerMisCajas, leerTurnosYCierres } from "@/lib/turnosYCierres/lecturaTurnosYCierresServer";

const ERROR_OTRO_SIN_DESPLAZAMIENTO = "Un período elegido con «Otro» no se desplaza: no mandes desplazamiento.";

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });

    // La puerta (dueño y admin); qué cajas ve adentro lo decide el alcance.
    const perm = checkPerm(session, PERMISO_VER_TURNOS_Y_CIERRES);
    if (!perm.ok) return NextResponse.json({ ok: false, error: perm.error }, { status: perm.status });

    const vista = await resolveVistaOperativa(req);
    if (vista.error) {
      return NextResponse.json({ ok: false, error: vista.error, needsContexto: vista.needsContexto }, { status: vista.status });
    }
    if (!vista.localId) {
      return NextResponse.json({ ok: false, error: "Elegí un local para ver sus turnos y cierres.", needsContexto: true }, { status: 409 });
    }
    const localId = vista.localId;

    const alcance = alcanceDeCajas(session, { esDueno: puedeOperarSinOperador(session, { localId }) });
    if (!alcance) return NextResponse.json({ ok: false, error: "Sin permiso para ver cajas." }, { status: 403 });

    const [local, identidad] = await Promise.all([
      prisma.local.findUnique({ where: { id: localId }, select: { id: true, nombre: true } }),
      identidadParaMirar(req, session, { localId }),
    ]);

    // EL CAJERO: sus cajas, sin período.
    if (alcance === ALCANCE.PROPIAS) {
      const mis = await leerMisCajas(prisma, { localId, alcance, identidad });
      // Quién mira: el operador del PIN, o la cuenta si opera sin operador.
      const quien = identidad.operadorId
        ? await prisma.operadorLocal.findUnique({ where: { id: identidad.operadorId }, select: { nombre: true } })
        : await prisma.usuario.findUnique({ where: { id: session.id }, select: { nombre: true } });
      return NextResponse.json({
        ok: true,
        vista: "MIS_CAJAS",
        local: { id: localId, nombre: local?.nombre || "—" },
        quien: quien?.nombre || null,
        ...mis,
      });
    }

    // EL LOCAL ENTERO, por período.
    const { searchParams } = new URL(req.url);
    const esOtro = String(searchParams.get("unidad") || "").toUpperCase() === CLAVE_OTRO_FINANZAS;
    const conFechas = searchParams.has("desde") || searchParams.has("hasta");
    let rangoFijo = null;
    if (esOtro) {
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

    const rango = await rangoDeTesoreria(prisma, { localId, unidad, desplazamiento, rangoFijo });
    const [lectura, primerMovimiento] = await Promise.all([
      leerTurnosYCierres(prisma, { localId, fechaInicio: rango.fechaInicio, fechaFin: rango.fechaFin, alcance, identidad }),
      primerDiaComercialDelLocal(prisma, localId),
    ]);

    return NextResponse.json({
      ok: true,
      vista: "LOCAL",
      unidad,
      desplazamiento: esOtro ? null : desplazamiento,
      local: { id: localId, nombre: local?.nombre || "—" },
      periodo: {
        rango: { desde: rango.desde, hasta: rango.hasta },
        instantes: { desde: rango.fechaInicio, hasta: rango.fechaFin },
        descripcion: descripcionFinanciera({ unidad, desplazamiento, vigencias: rango.vigencias, rangoFijo }),
      },
      puedeAvanzar: esOtro ? false : puedeAvanzar(desplazamiento),
      puedeRetroceder: esOtro ? false : Boolean(primerMovimiento && rango.desde > primerMovimiento),
      ...lectura,
    });
  } catch (e) {
    console.error("[turnos-y-cierres]", e);
    return NextResponse.json({ ok: false, error: `No se pudo armar Turnos y cierres: ${e.message}` }, { status: 500 });
  }
}
