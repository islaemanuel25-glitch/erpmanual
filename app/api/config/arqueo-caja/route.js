// Configuración de arqueos de caja, POR LOCAL (config_local.alertas).
//
// Pertenece al local y no se hereda del grupo ni del depósito: cada sucursal
// tiene su propio ritmo de caja. Mismo patrón que /api/config/pos-ventas-cliente.
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePerm, checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { configArqueoDeLocal, fondoObjetivoDeLocal } from "@/lib/caja/arqueoServer";
import { CONFIG_ARQUEO_DEFAULT } from "@/lib/caja/arqueo";

/** Permiso de escritura. Reutiliza el existente para alertas del local. */
export const PERMISO_CONFIG_ARQUEO = "config_local.alertas";

/** Límites de cordura. Un intervalo de 0 o de un año no es una configuración útil. */
const LIMITES = {
  intervaloArqueoMinutos: { min: 5, max: 24 * 60 },
  toleranciaPostergacionMinutos: { min: 0, max: 240 },
  postergacionCajeroMinutos: { min: 1, max: 240 },
};

function enteroEnRango(valor, limites) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const e = Math.floor(n);
  if (e < limites.min || e > limites.max) return null;
  return e;
}

export async function GET(req) {
  try {
    // EL CHEQUEO VA ACÁ Y NO REAPROVECHA EL DEL POST. El permiso estaba escrito
    // en este archivo —`PERMISO_CONFIG_ARQUEO`, unas líneas más arriba— y el GET
    // no lo llamaba: pedía sesión y nada más, así que un CAJERO leía la
    // configuración de caja del local. Una defensa escrita en otro handler es una
    // defensa que no corre en el camino que importa.
    //
    // El único consumidor es la pantalla de configuración, que ya se cierra con
    // este mismo permiso.
    const auth = requirePerm(req, PERMISO_CONFIG_ARQUEO);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    const scope = await resolveLocalAndGrupo(req, { lecturaAjena: true });
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const config = await configArqueoDeLocal(scope.localId);
    // El fondo objetivo va SUELTO, fuera de `config`: no es una alerta y no pasa
    // por `normalizarConfig`, que aplica defaults propios del ritmo de arqueos.
    // `null` acá significa "no configurado" y el retiro cae al montoInicial del
    // turno; convertirlo en 0 sugeriría retirar todo y dejar la caja sin cambio.
    const fondoObjetivoCaja = await fondoObjetivoDeLocal(scope.localId);
    return NextResponse.json({
      ok: true,
      localId: scope.localId,
      config,
      fondoObjetivoCaja: fondoObjetivoCaja != null ? Number(fondoObjetivoCaja) : null,
      limites: LIMITES,
    });
  } catch (error) {
    console.error("Error obteniendo config de arqueo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    // Scope estricto: el local sale de la sesión, nunca del body. Un localId
    // ajeno da 403 antes de tocar nada.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId } = scope;

    if (!session.esAdmin && !checkPerm(session, PERMISO_CONFIG_ARQUEO).ok) {
      return NextResponse.json(
        { ok: false, error: `Sin permiso: ${PERMISO_CONFIG_ARQUEO}` },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const data = {};

    if (body.arqueoCajaActivo !== undefined) {
      data.arqueoCajaActivo = !!body.arqueoCajaActivo;
    }
    if (body.requiereAutorizacionPostergacion !== undefined) {
      data.requiereAutorizacionPostergacion = !!body.requiereAutorizacionPostergacion;
    }

    for (const campo of Object.keys(LIMITES)) {
      if (body[campo] === undefined) continue;
      const valor = enteroEnRango(body[campo], LIMITES[campo]);
      if (valor === null) {
        return NextResponse.json(
          {
            ok: false,
            error: `${campo} debe estar entre ${LIMITES[campo].min} y ${LIMITES[campo].max} minutos`,
          },
          { status: 400 }
        );
      }
      data[campo] = valor;
    }

    // Fondo objetivo del cajón. `null` explícito es un valor válido: significa
    // "volver a no configurado", y ahí el retiro cae al montoInicial del turno.
    if (body.fondoObjetivoCaja !== undefined) {
      if (body.fondoObjetivoCaja === null || body.fondoObjetivoCaja === "") {
        data.fondoObjetivoCaja = null;
      } else {
        const n = Number(body.fondoObjetivoCaja);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json(
            { ok: false, error: "El fondo objetivo debe ser un importe de cero o más" },
            { status: 400 }
          );
        }
        data.fondoObjetivoCaja = Number(n.toFixed(2));
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, error: "Nada para actualizar" }, { status: 400 });
    }

    await prisma.configuracionLocal.upsert({
      where: { localId },
      update: data,
      // Al crear la fila se siembran los defaults para que la config quede
      // completa y explícita, no a medias.
      create: { localId, ...CONFIG_ARQUEO_DEFAULT, ...data },
    });

    const config = await configArqueoDeLocal(localId);
    const fondoObjetivoCaja = await fondoObjetivoDeLocal(localId);
    return NextResponse.json({
      ok: true,
      localId,
      config,
      fondoObjetivoCaja: fondoObjetivoCaja != null ? Number(fondoObjetivoCaja) : null,
    });
  } catch (error) {
    console.error("Error actualizando config de arqueo:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
