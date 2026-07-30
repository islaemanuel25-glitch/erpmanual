-- Precisión física a 3 decimales (Etapa 3B de ventas internas).
--
-- Motivo: la cadena física del ERP estaba partida. VentaDetalle.cantidadStock,
-- VentaDetalleComponente.cantidad, ComboComponente.cantidad y kgRecibidos ya eran
-- DECIMAL(12,3), y piezasToKg() redondea a 3 decimales, pero StockLocal y
-- TransferenciaDetalle guardaban 2. PostgreSQL redondea numeric en silencio
-- (half-up, sin error), así que una venta de 1.925 kg producía:
--
--   · StockLocal.cantidad   10.00 - 1.925 = 8.075 → 8.08  (descontó 1.92)
--   · StockLocal.enTransito  0.00 + 1.925 = 1.925 → 1.93  (acreditó 1.93)
--
-- El mismo movimiento entraba y salía con cantidades distintas, y vender+corregir
-- dejaba 10.00 → 10.01, inventando stock.
--
-- Es una AMPLIACIÓN de escala: (12,2) → (12,3). No hay pérdida (8.08 → 8.080) ni
-- backfill: PostgreSQL reescribe la columna conservando el valor.
--
-- OJO con el único límite real: la precisión TOTAL sigue siendo 12, así que los
-- dígitos ENTEROS máximos bajan de 10 a 9. Un valor >= 1.000.000.000 haría fallar
-- el ALTER con "numeric field overflow". Verificar antes de aplicar en producción:
--
--   SELECT count(*) FROM "StockLocal" WHERE abs(cantidad) >= 1000000000
--                                        OR abs("enTransito") >= 1000000000;
--   SELECT count(*) FROM "TransferenciaDetalle" WHERE abs(cantidad) >= 1000000000
--                                        OR abs(recibido) >= 1000000000;
--   SELECT count(*) FROM "AuditoriaStock" WHERE abs("cantidadAnterior") >= 1000000000
--                                        OR abs("cantidadNueva") >= 1000000000;
--
-- Cambiar la escala de numeric obliga a PostgreSQL a REESCRIBIR la tabla con un
-- lock ACCESS EXCLUSIVE. El tiempo es proporcional al tamaño de cada tabla.
--
-- NO se tocan campos monetarios (precio, precioCosto, subtotal, total…) ni los
-- umbrales stockMin/stockMax, que no son cantidades movidas sino configuración de
-- alertas.

ALTER TABLE "StockLocal" ALTER COLUMN "cantidad" TYPE DECIMAL(12,3);
ALTER TABLE "StockLocal" ALTER COLUMN "enTransito" TYPE DECIMAL(12,3);

ALTER TABLE "TransferenciaDetalle" ALTER COLUMN "cantidad" TYPE DECIMAL(12,3);
ALTER TABLE "TransferenciaDetalle" ALTER COLUMN "recibido" TYPE DECIMAL(12,3);

-- Snapshots directos de StockLocal.cantidad: si no acompañan, la auditoría
-- registraría un valor distinto del que quedó en el stock.
ALTER TABLE "AuditoriaStock" ALTER COLUMN "cantidadAnterior" TYPE DECIMAL(12,3);
ALTER TABLE "AuditoriaStock" ALTER COLUMN "cantidadNueva" TYPE DECIMAL(12,3);
