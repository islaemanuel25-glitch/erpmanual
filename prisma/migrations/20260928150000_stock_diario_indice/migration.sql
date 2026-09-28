-- EL ÍNDICE DEL STOCK DIARIO. Estrictamente aditiva: un índice y nada más.
--
-- No toca ninguna fila, ninguna columna, ninguna función ni ningún trigger del
-- libro. `20260927120000_libro_stock` no se modifica: su hash está fijado por un
-- candado.
--
-- Por qué hace falta: la apertura y el cierre de un día son "el último
-- movimiento de la cadena con dia < D" y "con dia <= D", ordenando por
-- (dia, id). Con los índices de antes, un local entero recorría la historia de
-- cada cadena; con éste es un descenso por cadena. Las mediciones están en la
-- PR que lo agrega y la prueba de base las repite con EXPLAIN
-- (`scripts/pruebas-db/stockDiario.mjs`).
--
-- Sin CONCURRENTLY a propósito: Prisma aplica cada migración dentro de una
-- transacción, donde CONCURRENTLY no se admite. El libro tiene hoy del orden de
-- doce mil filas, así que el candado dura lo que tarda en ordenarlas.

-- CreateIndex
CREATE INDEX "MovimientoStock_localId_productoLocalId_dia_id_idx" ON "MovimientoStock"("localId", "productoLocalId", "dia", "id");
