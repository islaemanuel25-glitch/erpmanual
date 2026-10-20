// lib/stock/filaDeStock.js
//
// LA FILA DE `StockLocal` DE UN PRODUCTO, BLOQUEADA, DENTRO DE UNA TRANSACCIÓN.
//
// Vivía adentro de `app/api/stock_locales/ajustar/route.js` y se sacó tal cual
// cuando el Control de stock necesitó lo mismo: leer la cantidad REAL con el
// mismo bloqueo que toma la venta, y crear la fila en cero si falta. Una copia
// al lado habría sido la misma regla escrita dos veces.
//
// No declara origen: el que llama declara el suyo ANTES de llamar a
// `crearFilaEnCero`, porque crear la fila ya deja un ALTA en el Libro. Lo
// exige el censo de `lib/stock/libro/origenDeStock.test.mjs`.

/** La fila bloqueada hasta el fin de la transacción, o null si no existe. */
export async function bloquearFila(tx, localId, productoLocalId) {
  const filas = await tx.$queryRaw`
    SELECT "id", "cantidad", "stockMin", "stockMax"
    FROM "StockLocal"
    WHERE "localId" = ${localId} AND "productoId" = ${productoLocalId}
    FOR UPDATE`;
  return filas[0] ?? null;
}

/**
 * Crea la fila en cero si falta, con el origen ya declarado, y la devuelve
 * bloqueada. `skipDuplicates` es el `ON CONFLICT DO NOTHING`: si otro pedido la
 * creó en el medio, no se duplica ni explota, y la lectura que sigue la ve.
 */
export async function crearFilaEnCero(tx, localId, productoLocalId) {
  await tx.stockLocal.createMany({
    data: [
      {
        localId,
        productoId: productoLocalId,
        cantidad: 0,
        // NULL, no 0: crear la fila para poder ajustar cantidad no configura
        // límites. Los sella el modo "limites" del ajuste.
        stockMin: null,
        stockMax: null,
      },
    ],
    skipDuplicates: true,
  });
  return bloquearFila(tx, localId, productoLocalId);
}
