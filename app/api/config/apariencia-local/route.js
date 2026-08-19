import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth, checkPerm } from "@/lib/authorize";
import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { datosAActualizar } from "@/lib/config/aparienciaLocal";

// Apariencia INSTITUCIONAL del local (tema + opciones de negocio). Aplica a todos
// los dispositivos del local. Lectura: cualquier sesión con local (para poder
// aplicar el tema). Escritura: admin o config_local.apariencia, sobre el local
// propio (scope estricto; localId ajeno → 403).

export async function GET(req) {
  try {
    const auth = requireAuth(req);
    if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

    // Lectura de config: recurso ajeno → 404 (no revelar la config de otra ubicación).
    const scope = await resolveLocalAndGrupo(req, { lecturaAjena: true });
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }

    const row = await prisma.configuracionLocal.findUnique({
      where: { localId: scope.localId },
      select: {
        aparienciaJson: true,
        tarjetaPrecioUnitario: true,
        tarjetaOcultarEquivalencia: true,
      },
    });

    // Las dos preferencias de la tarjeta viajan como `null` cuando no están, y
    // NO se convierten a `false` acá: quien las lea decide qué hace con la
    // ausencia. Convertirlas antes borraría la diferencia entre "nunca lo
    // tocaron" y "lo apagaron", que es la que deja saber después cuántos locales
    // decidieron de verdad.
    return NextResponse.json({
      ok: true,
      apariencia: row?.aparienciaJson ?? null,
      tarjetaPrecioUnitario: row?.tarjetaPrecioUnitario ?? null,
      tarjetaOcultarEquivalencia: row?.tarjetaOcultarEquivalencia ?? null,
    });
  } catch (error) {
    console.error("Error obteniendo apariencia local:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(req) {
  try {
    const session = getUsuarioSession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    if (!session.esAdmin && !checkPerm(session, "config_local.apariencia").ok) {
      return NextResponse.json({ ok: false, error: "Sin permiso: config_local.apariencia" }, { status: 403 });
    }

    // Scope estricto: no-admin atado a session.localId; localId ajeno → 403.
    const scope = await resolveLocalAndGrupo(req);
    if (scope.error) {
      return NextResponse.json({ ok: false, error: scope.error }, { status: scope.status });
    }
    const { localId } = scope;

    const body = await req.json();

    // ── EL UPDATE ES PARCIAL, Y ESO ES LO QUE IMPIDE QUE SE PISEN ─────────
    //
    // Antes escribía `aparienciaJson` con lo que viniera, así que un pedido que
    // solo traía el tema borraba cualquier otra cosa guardada. Ahora la decisión
    // de qué tocar vive en `datosAActualizar`, que es pura y tiene sus candados:
    // lo que el pedido NO trae, no se escribe.
    const resultado = datosAActualizar(body);
    if (resultado.error) {
      return NextResponse.json({ ok: false, error: resultado.error }, { status: 400 });
    }
    const { datos } = resultado;

    const row = await prisma.configuracionLocal.upsert({
      where: { localId },
      update: datos,
      create: { localId, ...datos },
    });

    return NextResponse.json({
      ok: true,
      apariencia: row.aparienciaJson ?? null,
      tarjetaPrecioUnitario: row.tarjetaPrecioUnitario ?? null,
      tarjetaOcultarEquivalencia: row.tarjetaOcultarEquivalencia ?? null,
    });
  } catch (error) {
    console.error("Error guardando apariencia local:", error);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
