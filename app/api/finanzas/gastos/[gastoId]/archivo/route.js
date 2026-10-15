// app/api/finanzas/gastos/[gastoId]/archivo/route.js
//
// LA FOTO O EL ARCHIVO DEL TICKET DE UN GASTO (lib/finanzas/archivoDeGastoServer.js).
//
//   GET  ?orden=N    → el archivo, servido.
//   POST FormData { archivo } → lo agrega al gasto.
//
// Lo usan Finanzas → Gastos (con su alcance) y "Gasto" de Pagar en el POS
// (con `pos.usar`, solo sobre el gasto que registró ese cajero en su ubicación).

import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getUsuarioSession } from "@/lib/auth";
import { checkPerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { gastoEnAlcance } from "@/lib/finanzas/gastos";
import { ERROR_GASTO_NO_ENCONTRADO, alcanceDeGastos } from "@/lib/finanzas/gastosServer";
import { PERMISO_VER_FINANZAS } from "@/lib/finanzas/pagosProveedores";
import {
  ERROR_GASTO_AJENO,
  ErrorArchivoDeGasto,
  esGastoDelCajero,
  guardarArchivoDeGasto,
  leerArchivoDeGasto,
} from "@/lib/finanzas/archivoDeGastoServer";

const rechazo = (error, status, extra = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });

/** El gasto, si quien pregunta puede verlo (o, con `escribir`, agregarle un archivo). */
async function autorizar(req, params, { escribir }) {
  const session = getUsuarioSession(req);
  if (!session) return { respuesta: rechazo("No autenticado", 401) };

  const { gastoId: crudo } = await params;
  const gastoId = Number(crudo);
  const gasto = Number.isInteger(gastoId) && gastoId > 0
    ? await prisma.gasto.findUnique({
        where: { id: gastoId },
        select: { id: true, grupoId: true, localId: true, creadoPorId: true },
      })
    : null;
  if (!gasto) return { respuesta: rechazo(ERROR_GASTO_NO_ENCONTRADO, 404) };

  // Finanzas, con su alcance.
  if (checkPerm(session, PERMISO_VER_FINANZAS).ok) {
    const alcance = await alcanceDeGastos(req, session);
    if (!alcance.error && gastoEnAlcance(gasto, alcance) && (!escribir || alcance.puedeEscribir)) {
      return { gasto };
    }
  }

  // El cajero, sobre el gasto que registró él en su ubicación.
  const scope = await resolveLocalAndGrupo(req);
  if (!scope.error && scope.grupoId === gasto.grupoId && esGastoDelCajero(gasto, { session, localId: scope.localId })) {
    return { gasto };
  }
  return { respuesta: rechazo(ERROR_GASTO_AJENO, 403) };
}

function respuestaDeError(e, operacion) {
  if (e instanceof ErrorArchivoDeGasto) return rechazo(e.message, e.status, e.extra || {});
  console.error(`[finanzas/gastos/archivo ${operacion}]`, e);
  return rechazo(
    operacion === "POST"
      ? `No se pudo guardar el archivo. El gasto quedó registrado igual: ${e.message}`
      : `No se pudo traer el archivo del gasto: ${e.message}`,
    500
  );
}

export async function GET(req, { params }) {
  try {
    const a = await autorizar(req, params, { escribir: false });
    if (a.respuesta) return a.respuesta;
    const orden = Number(new URL(req.url).searchParams.get("orden") || 1);
    const { bytes, mime, nombre } = await leerArchivoDeGasto(prisma, { gastoId: a.gasto.id, orden });
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${encodeURIComponent(nombre)}"`,
      },
    });
  } catch (e) {
    return respuestaDeError(e, "GET");
  }
}

export async function POST(req, { params }) {
  try {
    const a = await autorizar(req, params, { escribir: true });
    if (a.respuesta) return a.respuesta;
    const form = await req.formData();
    const archivo = await guardarArchivoDeGasto(prisma, { gasto: a.gasto, archivo: form.get("archivo") });
    return NextResponse.json({ ok: true, archivo });
  } catch (e) {
    return respuestaDeError(e, "POST");
  }
}
