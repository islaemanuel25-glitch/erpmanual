// EL TURNO OPERATIVO QUE UNA PRUEBA NECESITA PARA ABRIR CAJA.
//
// Desde la migración 20261004200000_turno_operativo, las tres rutas de apertura
// exigen elegir un turno del catálogo ACTIVO del local. Las pruebas que abren
// cajas por las rutas reales le piden acá un turno a su local, una sola vez, y
// lo mandan en el pedido como lo manda la pantalla.
//
// Uno solo por armado, a propósito: está acá para que no haya treinta copias
// de "crear un turno" que se rompan distinto el día que el catálogo cambie.
// Las pruebas de turno operativo —las del ciclo, las ventanas, un inactivo—
// arman los suyos a mano, porque eso es lo que prueban.
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

// EL CICLO DE PRUEBA. Desde que la apertura valida el ciclo del local, un
// turno suelto no alcanza: sin ventana el ciclo no se puede ubicar, y uno solo
// fuera de su ventana es ambiguo. Se arman DOS turnos con la MISMA ventana de
// casi todo el día: los dos empiezan a las 00:00, así que los dos son siempre
// la ocurrencia actual, con la fecha de hoy, a cualquier hora en que corra la
// prueba. Las que prueban el ciclo arman el suyo a mano.
const CICLO_DE_PRUEBA = [
  { nombre: "Mañana", orden: 0 },
  { nombre: "Tarde", orden: 1 },
].map((t) => ({ ...t, horaInicioReconocimiento: "00:00", horaFinReconocimiento: "23:59" }));

/**
 * El id de un turno operativo activo del local, con el ciclo de prueba armado
 * si el local no tiene turnos.
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
  let id = existente?.id;
  if (id == null) {
    for (const t of CICLO_DE_PRUEBA) {
      const fila = await prisma.turnoOperativo.upsert({
        where: { localId_nombre: { localId, nombre: t.nombre } },
        update: { activo: true, horaInicioReconocimiento: t.horaInicioReconocimiento, horaFinReconocimiento: t.horaFinReconocimiento },
        create: { localId, ...t },
        select: { id: true },
      });
      id ??= fila.id;
    }
  }
  cache.set(localId, id);
  return id;
}
