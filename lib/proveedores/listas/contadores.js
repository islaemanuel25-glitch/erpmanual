// lib/proveedores/listas/contadores.js
//
// Recalcula los contadores de una importación DESDE LA BASE.
//
// ── POR QUÉ RECALCULAR Y NO SUMAR Y RESTAR ──────────────────────────────────
//
// Sería más barato hacer `noMacheadas--` y `listoParaActualizar++` al vincular
// una fila. Y funcionaría, hasta el primer camino raro: una fila que se vincula
// dos veces, una transacción que se reintenta, un estado que pasa por un tercer
// valor. Cada uno deja los contadores corridos, y el error es INVISIBLE —la
// cabecera dice 400 listas cuando hay 399— hasta que alguien suma a mano.
//
// Un `groupBy` sobre las filas de UNA importación es una sola consulta indexada
// por `(importacionId, estado)`. La verdad sale siempre de las filas, que es
// donde de verdad está.

/** Nombre de la columna contadora de cada estado. Espeja el de persistencia.js. */
const COLUMNA = {
  LISTO_PARA_ACTUALIZAR: "listoParaActualizar",
  SIN_CAMBIOS: "sinCambios",
  NO_MACHEADO: "noMacheadas",
  CODIGO_DUPLICADO: "codigoDuplicado",
  FACTOR_DUDOSO: "factorDudoso",
  EXCLUIDO: "excluidas",
  BLOQUEADO: "bloqueadas",
  ERROR: "errores",
};

/**
 * Cuenta las filas por estado y actualiza la cabecera.
 *
 * @param tx             cliente Prisma o transacción
 * @param importacionId  la importación a recontar
 * @returns los contadores ya persistidos
 */
export async function recalcularContadores(tx, importacionId) {
  const porEstado = await tx.importacionListaFila.groupBy({
    by: ["estado"],
    where: { importacionId },
    _count: { _all: true },
  });

  const contadores = {};
  for (const col of Object.values(COLUMNA)) contadores[col] = 0;
  let total = 0;
  for (const g of porEstado) {
    const col = COLUMNA[g.estado];
    const n = g._count?._all ?? 0;
    if (col) contadores[col] = n;
    total += n;
  }

  // Las dos métricas que no son estados también se recuentan: una fila que pasa
  // de NO_MACHEADO a LISTO puede estrenar variación alta, y su sugerencia deja
  // de estar pendiente.
  const [variacionAlta, sugerencias] = await Promise.all([
    tx.importacionListaFila.count({ where: { importacionId, variacionAlta: true } }),
    tx.importacionListaFila.count({
      where: { importacionId, sugerenciaProductoBaseId: { not: null } },
    }),
  ]);

  const datos = {
    ...contadores,
    totalFilas: total,
    variacionAlta,
    sugerenciasCodigoBarras: sugerencias,
  };

  await tx.importacionListaProveedor.update({
    where: { id: importacionId },
    data: datos,
  });

  return datos;
}

/** ¿La suma de los ocho estados cierra contra el total? Invariante de la cabecera. */
export function contadoresCierran(c) {
  const suma = Object.values(COLUMNA).reduce((acc, col) => acc + (c?.[col] ?? 0), 0);
  return suma === (c?.totalFilas ?? 0);
}

export { COLUMNA as COLUMNA_CONTADOR };
