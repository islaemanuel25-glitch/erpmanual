// EL TURNO OPERATIVO QUE UNA PRUEBA NECESITA PARA ABRIR CAJA.
//
// Desde la migración 20261004200000_turno_operativo, las tres rutas de apertura
// exigen elegir un turno del catálogo ACTIVO del local. Las pruebas que abren
// cajas por las rutas reales le piden acá un turno a su local, una sola vez, y
// lo mandan en el pedido como lo manda la pantalla.
//
// Uno solo por armado, a propósito: está acá para que no haya treinta copias
// de "crear un turno Mañana" que se rompan distinto el día que el catálogo
// cambie. Las pruebas de turno operativo —las que necesitan Mañana Y Tarde,
// o uno inactivo— arman los suyos a mano, porque eso es lo que prueban.
//
// SOLO INFRAESTRUCTURA DE PRUEBA: recibe el cliente, no lo crea, y no entra a
// `prisma/seed.js`. La FK del catálogo a `Local` es ON DELETE CASCADE, así que
// los desmontajes que borran sus locales no necesitan tocar nada más.

import jwt from "jsonwebtoken";

const porCliente = new WeakMap();

/**
 * El turno del local de una SESIÓN —el token que la prueba manda en la cookie,
 * o el objeto `{sesion, operador}` que usan varias—. Así cada llamada abre con
 * un turno del mismo local en el que el servidor la va a ubicar, sin que la
 * prueba tenga que repetir de qué local es.
 */
export function turnoOperativoDeSesion(prisma, quien) {
  const token = typeof quien === "string" ? quien : quien?.sesion;
  const localId = Number(jwt.decode(token)?.localId);
  if (!Number.isInteger(localId) || localId <= 0) throw new Error("turnoOperativoDeSesion: la sesión no trae localId");
  return turnoOperativoDePrueba(prisma, localId);
}

/**
 * El id de un turno operativo activo del local —"Mañana"—, creado si no hay.
 * @returns {Promise<number>}
 */
export async function turnoOperativoDePrueba(prisma, localId) {
  if (!porCliente.has(prisma)) porCliente.set(prisma, new Map());
  const cache = porCliente.get(prisma);
  if (cache.has(localId)) return cache.get(localId);
  const existente = await prisma.turnoOperativo.findFirst({
    where: { localId, activo: true },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const id =
    existente?.id ??
    (await prisma.turnoOperativo.upsert({
      where: { localId_nombre: { localId, nombre: "Mañana" } },
      update: { activo: true },
      create: { localId, nombre: "Mañana", orden: 0 },
      select: { id: true },
    })).id;
  cache.set(localId, id);
  return id;
}
