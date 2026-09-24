// app/api/transferencias/acuerdos/route.js
//
// EL CORTE DE SEMANA QUE VE LA PANTALLA "CORTE DE SEMANA" DE TRANSFERENCIAS.
//
// GET  → los locales del grupo que operan por transferencia, con el día en que
//        arranca SU semana, su rango en curso y el cambio programado si hay uno.
//        Los que no tienen semana configurada vienen marcados, nunca en silencio.
// PUT  → configura o programa la semana de UN local.
//
// ── LA SEMANA ES DEL LOCAL, NO DE ESTE ACUERDO ────────────────────────────
//
// Desde la tanda de la semana operativa canónica esta ruta NO lee ni escribe
// `AcuerdoDepositoLocal`: la fuente es `SemanaOperativaVigencia`, y la única
// puerta que la escribe es `programarSemanaOperativa`. La tabla vieja quedó
// congelada con lo que tenía; la migración la volcó a la nueva y un candado
// (`lib/semanaOperativa/unaSolaFuente.test.mjs`) impide que se vuelva a leer.
//
// El PUT conserva su forma para que la pantalla actual siga funcionando, pero su
// efecto es el de la regla nueva:
//
//   · un local SIN semana configurada la recibe "desde siempre", que es lo que
//     esta pantalla ya hacía con un local sin acuerdo;
//   · un local CON semana no cambia de golpe: el cambio se programa desde el
//     primer día de la semana siguiente —nunca parte la semana abierta ni toca
//     las anteriores— y, si ya había uno programado, lo reemplaza, porque esta
//     pantalla solo sabe decir "este es el día".
//
// Y exige `config_local.semana_operativa`. `transferencias.crear` solo ya no
// alcanza: cambiar la semana ya no es un acuerdo de despacho, es la semana de
// toda la ubicación.
//
// ── POR QUÉ DEVUELVE TAMBIÉN LAS QUE NO TIENEN FILA ───────────────────────
//
// Porque la pantalla de configuración tiene que mostrar lo que FALTA
// configurar, y lo que falta no está en la tabla — por definición. Si esta ruta
// devolviera las filas de `AcuerdoDepositoLocal`, un local sin acuerdo no
// aparecería en la lista y no habría forma de configurarlo desde ahí. La lista
// sale de los LOCALES del grupo, y la semana se le pega al lado cuando existe.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveVistaOperativa } from "@/lib/grupos";
import { relacionesDelDeposito } from "@/lib/transferencias/relacionesDelDeposito";
import { destinosDeTransferencia } from "@/lib/transferencias/destinosDeTransferencia";
import { esDiaDeCorteValido } from "@/lib/transferencias/periodoDePago";
import {
  PERMISO_SEMANA_OPERATIVA,
  semanaQueContiene,
  vigenciaPendiente,
} from "@/lib/semanaOperativa/semanaOperativa";
import {
  ErrorSemanaOperativa,
  programarSemanaOperativa,
  vigenciasDeUbicaciones,
} from "@/lib/semanaOperativa/semanaOperativaServer";

/** Los locales del grupo, con su semana o con la marca de que falta. */
async function relacionesDelGrupo(grupoId) {
  // La lista de locales sale de la MISMA puerta que usa la lista de trabajo. Si
  // cada pantalla armara la suya, un local podría aparecer en una y no en la
  // otra sin que nada lo explique.
  const { deposito, locales } = await relacionesDelDeposito(grupoId);
  if (!deposito) return { deposito: null, relaciones: [] };

  const semanas = await vigenciasDeUbicaciones(
    prisma,
    (locales || []).map((l) => l.id)
  );

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
      const vigencias = semanas.get(l.id) || [];
      const semana = semanaQueContiene({ vigencias });
      const programado = vigenciaPendiente(vigencias);
      return {
        localId: l.id,
        localNombre: l.nombre,
        depositoNombre: deposito.nombre,
        diaDeCorte: semana.diaDeCorte,
        sinConfigurar: semana.sinConfigurar,
        rango: { desde: semana.desde, hasta: semana.hasta },
        // El cambio que ya se programó y todavía no empezó. La pantalla de hoy no
        // lo dibuja; viaja para que la de configuración de la semana lo muestre.
        programado: programado ? { diaDeCorte: programado.diaDeCorte, desde: programado.desde } : null,
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

    // Cualquiera de los dos alcanza: el que mira Transferencias, o el que
    // configura la semana, que no tiene por qué tener permisos de Transferencias.
    // Lo que esta ruta devuelve —locales, día, rango y cambio programado— no trae
    // importes ni transferencias. Es la misma lista que
    // `PERMISOS_PARA_VER_EL_CORTE` (`components/transferencias/corteDeSemana.js`),
    // y un candado compara las dos.
    const perm = checkPerm(session, ["transferencias.ver", PERMISO_SEMANA_OPERATIVA]);
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

    // Cambiar la semana es cambiar la semana de TODA la ubicación, así que el
    // permiso es el suyo y no el de despachar. La pantalla usa la misma constante
    // (`components/transferencias/corteDeSemana.js`) para no ofrecer el botón a
    // quien el servidor va a rechazar.
    const perm = checkPerm(session, PERMISO_SEMANA_OPERATIVA);
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

    // El depósito TIENE semana propia, pero no se configura desde esta pantalla,
    // que es la de sus locales: se configura como ubicación, en
    // `/api/config/semana-operativa`.
    //
    // Va ANTES del control de grupo, y no es un detalle: el depósito no está en
    // `GrupoLocal`, así que ese control lo rechazaba primero con un 403 que decía
    // "no pertenece a este grupo" y esta rama no corría nunca. Lo encontró el
    // candado de base.
    if (localId === deposito.localId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La semana del depósito se configura como la de cualquier ubicación, no desde el corte de sus locales.",
        },
        { status: 400 }
      );
    }

    // El local tiene que ser DE ESTE GRUPO. Sin este control, un id ajeno escrito
    // a mano le cambiaría la semana a una ubicación de otro grupo.
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

    // La ÚNICA escritura: la fuente canónica. `AcuerdoDepositoLocal` no se toca.
    let resultado;
    try {
      resultado = await prisma.$transaction((tx) =>
        programarSemanaOperativa(tx, {
          localId,
          diaDeCorte,
          usuarioId: session.id ?? null,
          // Esta pantalla solo sabe decir "este es el día": el último pedido manda
          // sobre un cambio que se había programado y todavía no empezó.
          reemplazarPendiente: true,
        })
      );
    } catch (err) {
      if (err instanceof ErrorSemanaOperativa) {
        return NextResponse.json(
          { ok: false, error: err.message, codigo: err.codigo, ...err.extra },
          { status: err.status }
        );
      }
      throw err;
    }

    const { relaciones } = await relacionesDelGrupo(vista.grupoId);
    return NextResponse.json({
      ok: true,
      relaciones,
      // "PRIMERA" = rige desde siempre. "PROGRAMAR" = rige desde `desde`, y hasta
      // ese día la semana sigue siendo la de antes.
      cambio: {
        accion: resultado.accion,
        desde: resultado.desde,
        transicion: resultado.transicion,
      },
    });
  } catch (e) {
    console.error("[transferencias/acuerdos PUT]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo guardar el corte de semana: ${e.message}` },
      { status: 500 }
    );
  }
}
