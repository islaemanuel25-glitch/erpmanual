// app/api/config/semana-operativa/route.js
//
// LA SEMANA OPERATIVA DE LA UBICACIÓN EN CONTEXTO: un local o el depósito.
//
// GET → sus vigencias, la semana que contiene hoy y el cambio programado.
// PUT → la configura por primera vez (rige desde siempre) o programa un cambio.
//
// Es la puerta de la ubicación, y por eso es la única por la que se configura la
// semana del DEPÓSITO: la pantalla "Corte de semana" de Transferencias es la de
// sus locales y la rechaza. Las dos escriben con `programarSemanaOperativa`, así
// que las reglas —futura, sin partir la semana, un solo cambio pendiente, lo que
// ya empezó no se toca— son las mismas por cualquiera de las dos.
//
// El alcance es el de toda la configuración por local (`resolveLocalAndGrupo`):
// un no-admin opera sobre el local de su sesión y nada más; un id ajeno en la
// query da 404 al leer y 403 al escribir.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import {
  PERMISO_SEMANA_OPERATIVA,
  normalizarVigencias,
  semanaQueContiene,
  vigenciaPendiente,
} from "@/lib/semanaOperativa/semanaOperativa";
import {
  ErrorSemanaOperativa,
  programarSemanaOperativa,
  vigenciasDeUbicaciones,
} from "@/lib/semanaOperativa/semanaOperativaServer";

async function estadoDeLaUbicacion(localId) {
  const semanas = await vigenciasDeUbicaciones(prisma, [localId]);
  const vigencias = semanas.get(localId) || [];
  const semana = semanaQueContiene({ vigencias });
  const programado = vigenciaPendiente(vigencias);
  return {
    localId,
    vigencias: normalizarVigencias(vigencias),
    semana,
    programado,
  };
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
      if (err instanceof ErrorSemanaOperativa) {
        return NextResponse.json(
          { ok: false, error: err.message, codigo: err.codigo, ...err.extra },
          { status: err.status }
        );
      }
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
