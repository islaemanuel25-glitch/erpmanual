// CARRERAS FORZADAS CONTRA EL CANDADO REAL DEL LOCAL.
//
// Lo usan las pruebas de base que necesitan que una carrera OCURRA, no que
// ocurra a veces: scripts/pruebas-db/cobroIdempotente.mjs y
// scripts/pruebas-db/cobrosOffline.mjs.
//
// La prueba toma, desde otra sesión, el MISMO candado que toman
// `/api/pos-ventas/crear` y el registro de cobros offline —por la misma función,
// tomarCandadoDelLocal—, lanza los pedidos y espera, mirando `pg_locks` y no con
// un tiempo fijo, a que estén bloqueados ahí. Recién entonces lo suelta.
//
// Todo vuelve a soltarse en un `finally`: una prueba que falla a mitad no deja
// una sesión reteniendo el candado.

import { tomarCandadoDelLocal } from "../../lib/pos-ventas/candadoDelLocal.js";

/**
 * Retiene el candado del local en una transacción propia hasta `soltar()`.
 * @returns {Promise<{ soltar: () => Promise<void> }>}
 */
export async function retenerCandadoDelLocal(prisma, localId) {
  let liberar;
  const liberado = new Promise((r) => { liberar = r; });
  let avisarTomado;
  const tomado = new Promise((r) => { avisarTomado = r; });
  const retencion = prisma.$transaction(async (tx) => {
    await tomarCandadoDelLocal(tx, localId);
    avisarTomado();
    await liberado;
  }, { maxWait: 10_000, timeout: 60_000 });
  await Promise.race([tomado, retencion]);
  return {
    soltar: async () => {
      liberar();
      await retencion;
    },
  };
}

/**
 * Retiene con FOR UPDATE la fila de stock de un producto en un local, hasta
 * `soltar()`. `crear` la actualiza DESPUÉS de crear la venta y antes de
 * confirmar: retenerla deja a `crear` detenido con la venta escrita pero sin
 * confirmar, y con el candado del local tomado.
 */
export async function retenerFilaDeStock(prisma, { localId, productoLocalId }) {
  let liberar;
  const liberado = new Promise((r) => { liberar = r; });
  let avisarTomado;
  const tomado = new Promise((r) => { avisarTomado = r; });
  const retencion = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "StockLocal" WHERE "localId" = ${localId} AND "productoId" = ${productoLocalId} FOR UPDATE`;
    avisarTomado();
    await liberado;
  }, { maxWait: 10_000, timeout: 60_000 });
  await Promise.race([tomado, retencion]);
  return {
    soltar: async () => {
      liberar();
      await retencion;
    },
  };
}

async function esperar(contar, cantidad, tope) {
  const limite = Date.now() + tope;
  let n = await contar();
  while (n < cantidad && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 25));
    n = await contar();
  }
  return n;
}

/** Cuántas sesiones esperan el candado del local. Espera hasta `cantidad` o el tope. */
export function esperarEnCandadoDelLocal(prisma, localId, cantidad, tope = 30_000) {
  const contar = async () => Number((await prisma.$queryRaw`
    SELECT count(*)::int AS n
      FROM pg_locks
     WHERE locktype = 'advisory'
       AND NOT granted
       AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
       AND classid = 0
       AND objid::bigint = ${Number(localId)}
       AND objsubid = 1`)[0].n);
  return esperar(contar, cantidad, tope);
}

/** Cuántas sesiones esperan un candado de fila. Espera hasta `cantidad` o el tope. */
export function esperarEnFila(prisma, cantidad, tope = 30_000) {
  const contar = async () => Number((await prisma.$queryRaw`
    SELECT count(*)::int AS n
      FROM pg_locks
     WHERE locktype IN ('transactionid', 'tuple')
       AND NOT granted
       AND database IS DISTINCT FROM 0`)[0].n);
  return esperar(contar, cantidad, tope);
}
