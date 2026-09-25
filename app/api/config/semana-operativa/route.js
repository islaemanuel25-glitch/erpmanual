// app/api/config/semana-operativa/route.js
//
// LA SEMANA OPERATIVA DE LA UBICACIÓN EN CONTEXTO: un local o el depósito.
//
// GET    → la ubicación, sus vigencias, la semana que contiene hoy y el cambio
//          programado con su transición. Trae `hoy`, así la pantalla calcula la
//          vista previa con el mismo día que va a usar el servidor.
// PUT    → la configura por primera vez (rige desde siempre) o programa un cambio.
// DELETE → cancela el cambio programado que todavía no empezó.
//
// Es la puerta de la ubicación, y la de la pantalla
// `/modulos/configuracion/semana-operativa`. Es la única por la que se configura
// la semana del DEPÓSITO. Escribe con `programarSemanaOperativa` y
// `cancelarSemanaPendiente`, así que las reglas —futura, sin partir la semana, un
// solo cambio pendiente, lo que ya empezó no se toca— son siempre las mismas.
//
// El alcance es el de toda la configuración por local (`resolveLocalAndGrupo`):
// un no-admin opera sobre el local de su sesión y nada más; el administrador, sobre
// su contexto activo. La ubicación NUNCA sale del cuerpo del pedido. Un id ajeno en
// la query da 404 al leer y 403 al escribir.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { hoyArgentinaISO } from "@/lib/fechas/rangoArgentina";
import {
  PERMISO_SEMANA_OPERATIVA,
  cambioProgramado,
  normalizarVigencias,
  semanaQueContiene,
} from "@/lib/semanaOperativa/semanaOperativa";
import {
  ErrorSemanaOperativa,
  cancelarSemanaPendiente,
  programarSemanaOperativa,
  vigenciasDeUbicaciones,
} from "@/lib/semanaOperativa/semanaOperativaServer";

async function estadoDeLaUbicacion(localId) {
  const hoy = hoyArgentinaISO();
  const [semanas, ubicacion] = await Promise.all([
    vigenciasDeUbicaciones(prisma, [localId]),
    prisma.local.findUnique({ where: { id: localId }, select: { id: true, nombre: true, es_deposito: true } }),
  ]);
  const vigencias = semanas.get(localId) || [];
  return {
    localId,
    hoy,
    ubicacion: ubicacion
      ? { id: ubicacion.id, nombre: ubicacion.nombre, esDeposito: ubicacion.es_deposito === true }
      : null,
    vigencias: normalizarVigencias(vigencias),
    semana: semanaQueContiene({ vigencias, fecha: hoy }),
    // Con su transición y la semana regular que sigue: lo que la pantalla muestra
    // del cambio sale de acá, calculado con las mismas funciones que lo validan.
    programado: cambioProgramado({ vigencias, hoy }),
  };
}

/** Un error de la regla de la semana, con su estado y su código. */
function respuestaDeError(err) {
  return NextResponse.json(
    { ok: false, error: err.message, codigo: err.codigo, ...err.extra },
    { status: err.status }
  );
}

export async function GET(req) {
  try {
    const auth = requirePerm(req, PERMISO_SEMANA_OPERATIVA);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const scope = await resolveLocalAndGrupo(req, { lecturaAjena: true });
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }

    return NextResponse.json({ ok: true, ...(await estadoDeLaUbicacion(scope.localId)) });
  } catch (e) {
    console.error("[config/semana-operativa GET]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo leer la semana operativa de la ubicación: ${e.message}` },
      { status: 500 }
    );
  }
}

export async function PUT(req) {
  try {
    const auth = requirePerm(req, PERMISO_SEMANA_OPERATIVA);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }

    const body = await req.json().catch(() => ({}));
    const desde = body?.desde == null || body.desde === "" ? null : String(body.desde);

    let resultado;
    try {
      resultado = await prisma.$transaction((tx) =>
        programarSemanaOperativa(tx, {
          localId: scope.localId,
          diaDeCorte: body?.diaDeCorte,
          usuarioId: scope.session?.id ?? null,
          desde,
          // Acá reemplazar un cambio programado se pide EXPLÍCITAMENTE: sin la
          // bandera, un segundo cambio pendiente es un 409 que lo nombra.
          reemplazarPendiente: body?.reemplazarPendiente === true,
        })
      );
    } catch (err) {
      if (err instanceof ErrorSemanaOperativa) return respuestaDeError(err);
      throw err;
    }

    return NextResponse.json({
      ok: true,
      cambio: {
        accion: resultado.accion,
        desde: resultado.desde,
        reemplazo: resultado.reemplazo,
        transicion: resultado.transicion,
      },
      ...(await estadoDeLaUbicacion(scope.localId)),
    });
  } catch (e) {
    console.error("[config/semana-operativa PUT]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo guardar la semana operativa de la ubicación: ${e.message}` },
      { status: 500 }
    );
  }
}

// ── CANCELAR EL CAMBIO PROGRAMADO ─────────────────────────────────────────
//
// Sin cuerpo: la ubicación es la del alcance —nunca un `localId` del pedido— y lo
// que se cancela es lo único que se puede cancelar, el cambio que todavía no
// empezó. Una vigencia que ya rige no se toca. Sin cambio pendiente: 409
// SIN_PENDIENTE, igual que MISMO_CORTE cuando no hay nada que cambiar.
export async function DELETE(req) {
  try {
    const auth = requirePerm(req, PERMISO_SEMANA_OPERATIVA);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto },
        { status: scope.status }
      );
    }

    let resultado;
    try {
      resultado = await prisma.$transaction((tx) => cancelarSemanaPendiente(tx, { localId: scope.localId }));
    } catch (err) {
      if (err instanceof ErrorSemanaOperativa) return respuestaDeError(err);
      throw err;
    }

    return NextResponse.json({
      ok: true,
      cancelado: resultado.cancelado,
      ...(await estadoDeLaUbicacion(scope.localId)),
    });
  } catch (e) {
    console.error("[config/semana-operativa DELETE]", e);
    return NextResponse.json(
      { ok: false, error: `No se pudo cancelar el cambio de semana programado: ${e.message}` },
      { status: 500 }
    );
  }
}
