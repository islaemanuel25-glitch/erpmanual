-- ANULACIÓN DE VENTAS: se marca, no se borra.
--
-- Una venta anulada conserva su fila y su número de ticket. El contador de
-- comprobantes es monótono: borrar la fila dejaría un hueco en la numeración que
-- no se puede explicar frente a una inspección, y se llevaría el rastro de que
-- la venta existió.
--
-- ADITIVA Y NULLABLE. Las tres columnas nacen en null, que es exactamente el
-- estado de las 8.000 ventas que ya existen: ninguna está anulada. Por eso no
-- lleva backfill — escribir algo en todas las filas convertiría una ausencia en
-- una decisión que nadie tomó.
--
-- COMPATIBLE HACIA ATRÁS durante la ventana entre migrar y recrear: el código
-- que hoy está atendiendo no mira estas columnas, así que sigue funcionando
-- igual mientras existan y estén vacías.
--
-- POR QUÉ NO HAY UN BOOLEANO `anulada`. El estado se deriva de `anuladaEn`,
-- igual que `Turno` deriva abierto/cerrado de `cierre`. Un flag más una fecha
-- son dos fuentes de verdad que pueden discrepar, y el día que discrepan no hay
-- forma de saber cuál manda.
--
-- POR QUÉ `anuladaPorId` NO ES UNA FOREIGN KEY. Sigue el precedente de
-- `VentaCorreccion.usuarioId`, que también guarda el autor como entero suelto.
-- Una FK obligaría a declarar la relación inversa en `Usuario`, y ese modelo no
-- se toca por un dato de autoría.

ALTER TABLE "Venta" ADD COLUMN "anuladaEn" TIMESTAMP(3);
ALTER TABLE "Venta" ADD COLUMN "anuladaPorId" INTEGER;
ALTER TABLE "Venta" ADD COLUMN "motivoAnulacion" TEXT;

-- El filtro de venta comercial pregunta `anuladaEn IS NULL` en toda consulta de
-- arqueo, reportes y estadísticas — son 17 lugares. Sin índice, cada una agrega
-- un scan por una columna que en casi todas las filas vale null.
CREATE INDEX "Venta_anuladaEn_idx" ON "Venta"("anuladaEn");
