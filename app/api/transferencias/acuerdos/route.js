// app/api/transferencias/acuerdos/route.js
//
// EL CORTE DE SEMANA DE CADA RELACIÓN DEPÓSITO–LOCAL.
//
// GET  → todas las relaciones del grupo, con su día de arranque y su rango en
//        curso. Las que NO tienen acuerdo vienen marcadas, nunca en silencio.
// PUT  → fija el día de una relación.
//
// ── POR QUÉ DEVUELVE TAMBIÉN LAS QUE NO TIENEN FILA ───────────────────────
//
// Porque la pantalla de configuración tiene que mostrar lo que FALTA
// configurar, y lo que falta no está en la tabla — por definición. Si esta ruta
// devolviera las filas de `AcuerdoDepositoLocal`, un local sin acuerdo no
// aparecería en la lista y no habría forma de configurarlo desde ahí. La lista
// sale de los LOCALES del grupo, y el acuerdo se le pega al lado cuando existe.
//
// ── EL PERMISO DEL PUT ────────────────────────────────────────────────────
//
// `transferencias.crear`, que es el del depósito: el que despacha es el que
// acuerda con cada local cuándo se corta la semana. No se inventó un permiso
// nuevo para esto —sería una fila más que sembrar y asignar en cada rol— y
// queda anotado como decisión revisable: si mañana la configuración la hace un
// administrativo que no despacha, va a necesitar el suyo.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { acuerdoDeLocal } from "@/lib/transferencias/bloquesPorLocal";
import { relacionesDelDeposito } from "@/lib/transferencias/relacionesDelDeposito";
import { destinosDeTransferencia } from "@/lib/transferencias/destinosDeTransferencia";
import {
  UNIDADES,
  esDiaDeCorteValido,
  rangoDelPeriodo,
} from "@/lib/transferencias/periodoDePago";

/** Las relaciones del grupo, con acuerdo o con la marca de que falta. */
async function relacionesDelGrupo(grupoId) {
  // La lista de locales sale de la MISMA puerta que usa la lista de trabajo. Si
  // cada pantalla armara la suya, un local podría aparecer en una y no en la
  // otra sin que nada lo explique.
  const { deposito, locales } = await relacionesDelDeposito(grupoId);
  if (!deposito) return { deposito: null, relaciones: [] };

  const acuerdos = await prisma.acuerdoDepositoLocal.findMany({
    where: { grupoId },
    select: { localId: true, diaDeCorte: true },
  });

  // ── LA MISMA PUERTA, TAMBIÉN ACÁ ────────────────────────────────────────
  //
  // El corte de semana es el acuerdo de PAGO de las transferencias. Un local
  // que no opera por transferencia —sin cliente vinculado— no tiene ningún corte
  // que acordar, así que ofrecer una fila para configurárselo sería ofrecer una
  // decisión que no se usa en ninguna parte.
  //
  // Es el mismo criterio que decide quién aparece en la lista de trabajo y quién
  // se ofrece como destino: las tres pantallas preguntan lo mismo en el mismo
  // lugar.
  const relaciones = destinosDeTransferencia(locales, { depositoLocalId: deposito.localId })
    .map((l) => {
      // La misma puerta que usa la lista de trabajo, para que las dos pantallas
      // no puedan decir días distintos del mismo local.
      const { diaDeCorte, sinConfigurar } = acuerdoDeLocal(acuerdos, l.id);
      return {
        localId: l.id,
        localNombre: l.nombre,
        depositoNombre: deposito.nombre,
        diaDeCorte,
        sinConfigurar,
        rango: rangoDelPeriodo({ unidad: UNIDADES.SEMANA, diaDeCorte }),
      };
    });

  return { deposito, relaciones };
}

export async function GET(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "transferencias.ver");
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

    const { deposito, relaciones } = await relacionesDelGrupo(vista.grupoId);
    if (!deposito) {
      return NextResponse.json(
        { ok: false, error: "Este grupo no tiene un depósito asignado." },
        { status: 409 }
      );
    }

    return NextResponse.json({ ok: true, relaciones });
  } catch (e) {
    console.error("[transferencias/acuerdos GET]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudieron leer los cortes de semana: ${e.message}` },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const perm = checkPerm(session, "transferencias.crear");
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

    const body = await req.json().catch(() => ({}));
    const localId = Number(body?.localId);
    const diaDeCorte = Number(body?.diaDeCorte);

    if (!Number.isInteger(localId) || localId <= 0) {
      return NextResponse.json(
        { ok: false, error: "Falta el local al que corresponde el corte." },
        { status: 400 }
      );
    }
    // El día se valida con la MISMA función que decide si una fila guardada
    // cuenta como configurada. Si acá se aceptara un 9, la lista de trabajo lo
    // trataría como "sin configurar" y la pantalla de configuración lo mostraría
    // guardado: dos pantallas diciendo cosas distintas de la misma fila.
    if (!esDiaDeCorteValido(diaDeCorte)) {
      return NextResponse.json(
        { ok: false, error: "El día de arranque tiene que ser uno de los siete de la semana." },
        { status: 400 }
      );
    }

    const deposito = await prisma.grupoDeposito.findFirst({
      where: { grupoId: vista.grupoId },
      select: { localId: true },
    });
    if (!deposito) {
      return NextResponse.json(
        { ok: false, error: "Este grupo no tiene un depósito asignado." },
        { status: 409 }
      );
    }

    // El local tiene que ser DE ESTE GRUPO. Sin este control, un id ajeno
    // escrito a mano crearía un acuerdo entre el depósito de un grupo y el local
    // de otro, y la unicidad del par no lo impediría porque el par sería nuevo.
    const vinculo = await prisma.grupoLocal.findFirst({
      where: { grupoId: vista.grupoId, localId },
      select: { id: true },
    });
    if (!vinculo) {
      return NextResponse.json(
        { ok: false, error: "Ese local no pertenece a este grupo." },
        { status: 403 }
      );
    }
    if (localId === deposito.localId) {
      return NextResponse.json(
        { ok: false, error: "El depósito no acuerda un corte consigo mismo." },
        { status: 400 }
      );
    }

    await prisma.acuerdoDepositoLocal.upsert({
      where: {
        acuerdo_deposito_local_unique: { depositoLocalId: deposito.localId, localId },
      },
      create: {
        grupoId: vista.grupoId,
        depositoLocalId: deposito.localId,
        localId,
        diaDeCorte,
      },
      update: { diaDeCorte },
    });

    const { relaciones } = await relacionesDelGrupo(vista.grupoId);
    return NextResponse.json({ ok: true, relaciones });
  } catch (e) {
    console.error("[transferencias/acuerdos PUT]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo guardar el corte de semana: ${e.message}` },
      { status: 500 }
    );
  }
}
