// lib/pedidos/alcanceDelHistorial.js
//
// QUÉ PEDIDOS PUEDE VER UN LOCAL EN SU HISTORIAL.
//
// Salió de `app/api/pedidos/historial/route.js` tal cual el 2026-10-22, cuando
// el detalle de un pedido (`app/api/pedidos/historial/[id]/route.js`) necesitó
// "los mismos permisos y el mismo alcance por local que el historial". Una
// sola copia: si el alcance cambia en una ruta y no en la otra, el detalle
// abriría lo que la lista no muestra, o al revés.
//
//   · sesión con local (o admin con contexto activo), y `pedidos.ver`;
//   · un local, no el depósito;
//   · los pedidos que ESE local le hizo a mano al depósito de su grupo, en los
//     estados de `ESTADOS_DEL_HISTORIAL`.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { resolveLocalAndGrupo } from "@/lib/grupos";

/**
 * Los estados del pedido que entran al historial. Los cancelados entran desde
 * el 2026-10-22: el historial del celular tiene el filtro "Cancelados", y un
 * pedido cancelado es historial del local. Por eso estas lecturas no pasan por
 * `sinCancelados` (están en las excepciones de
 * `lib/pedidos/sinCancelados.test.mjs`, con este motivo).
 */
export const ESTADOS_DEL_HISTORIAL = Object.freeze(["Solicitado", "Preparando", "Enviado", "Cancelado"]);

/**
 * @returns {Promise<{ respuesta: NextResponse } | { localId: number, depositoId: number }>}
 *   `respuesta` es el error que la ruta devuelve tal cual.
 */
export async function alcanceDelHistorial(req) {
  // Auth + localId + grupoId (soporta admin con contexto activo)
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) {
    return {
      respuesta: NextResponse.json(
        { ok: false, error: scope.error, needsContexto: scope.needsContexto || false },
        { status: scope.status }
      ),
    };
  }

  const { localId, grupoId, session } = scope;

  // Permisos
  const permisos = Array.isArray(session.permisos) ? session.permisos : [];
  if (!permisos.includes("*") && !permisos.includes("pedidos.ver")) {
    return {
      respuesta: NextResponse.json(
        { ok: false, error: "Sin permiso para ver pedidos" },
        { status: 403 }
      ),
    };
  }

  const localUser = await prisma.local.findUnique({
    where: { id: localId },
    select: { es_deposito: true },
  });

  if (localUser?.es_deposito) {
    return {
      respuesta: NextResponse.json(
        { ok: false, error: "Solo locales pueden ver historial de pedidos" },
        { status: 403 }
      ),
    };
  }

  // Resolver depósito del grupo
  const grupoDeposito = await prisma.grupoDeposito.findFirst({
    where: { grupoId },
    select: { localId: true },
  });

  if (!grupoDeposito) {
    return {
      respuesta: NextResponse.json(
        { ok: false, error: "No se encontró un depósito para el grupo" },
        { status: 400 }
      ),
    };
  }

  return { localId, depositoId: grupoDeposito.localId };
}

/** El `where` de los pedidos del historial de ese local. */
export function pedidosDelHistorial({ localId, depositoId }) {
  return {
    destinoId: localId,
    origenId: depositoId,
    origenManual: true,
  };
}
