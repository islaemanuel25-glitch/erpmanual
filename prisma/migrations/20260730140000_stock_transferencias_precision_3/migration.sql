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
-- Es una AMPLIACIÓN de escala. No hay pérdida (8.08 → 8.080) ni backfill:
-- PostgreSQL reescribe la columna conservando el valor.
--
-- DOS DESTINOS DISTINTOS, A PROPÓSITO:
--
--   · Las CUATRO columnas operativas van a DECIMAL(12,3) —máximo
--     999.999.999,999—, que es el rango real de trabajo del inventario.
--   · Las DOS columnas de AuditoriaStock van a DECIMAL(14,3) —máximo
--     99.999.999.999,999—. La auditoría es historia y no se reescribe:
--     producción tiene una fila de 9.999.999.999,00 (AJUSTE_SUMAR erróneo del
--     2026-06-16, AuditoriaStock id=3621) que NO entra en (12,3) y haría fallar
--     este ALTER. Ampliar solo la precisión conserva el registro tal cual.
--
-- El valor absurdo equivalente en StockLocal (productoLocalId 6294) se corrige por
-- el flujo normal de ajuste ANTES de aplicar esta migración; no se lo acomoda
-- ampliando el rango operativo.
--
-- VERIFICAR ANTES DE APLICAR EN PRODUCCIÓN — los límites son distintos por grupo:
--
--   -- (12,3): deben dar 0
--   SELECT count(*) FROM "StockLocal"
--    WHERE abs(cantidad) >= 1000000000 OR abs("enTransito") >= 1000000000;
--   SELECT count(*) FROM "TransferenciaDetalle"
--    WHERE abs(cantidad) >= 1000000000 OR abs(coalesce(recibido,0)) >= 1000000000;
--
--   -- (14,3): debe dar 0
--   SELECT count(*) FROM "AuditoriaStock"
--    WHERE abs("cantidadAnterior") >= 100000000000
--       OR abs("cantidadNueva")    >= 100000000000;
--
-- Cambiar la escala de numeric obliga a PostgreSQL a REESCRIBIR la tabla con un
-- lock ACCESS EXCLUSIVE. El tiempo es proporcional al tamaño de cada tabla.
--
-- NO se tocan campos monetarios (precio, precioCosto, subtotal, total…) ni los
-- umbrales stockMin/stockMax, que no son cantidades movidas sino configuración de
-- alertas, ni las columnas stockMin*/stockMax* de AuditoriaStock que los copian.

-- Columnas OPERATIVAS: rango de inventario, 12 dígitos.
ALTER TABLE "StockLocal" ALTER COLUMN "cantidad" TYPE DECIMAL(12,3);
ALTER TABLE "StockLocal" ALTER COLUMN "enTransito" TYPE DECIMAL(12,3);

ALTER TABLE "TransferenciaDetalle" ALTER COLUMN "cantidad" TYPE DECIMAL(12,3);
ALTER TABLE "TransferenciaDetalle" ALTER COLUMN "recibido" TYPE DECIMAL(12,3);

-- Columnas HISTÓRICAS: snapshots directos de StockLocal.cantidad. Misma escala (3
-- decimales) pero mayor precisión (14), para no perder ni truncar lo ya registrado.
ALTER TABLE "AuditoriaStock" ALTER COLUMN "cantidadAnterior" TYPE DECIMAL(14,3);
ALTER TABLE "AuditoriaStock" ALTER COLUMN "cantidadNueva" TYPE DECIMAL(14,3);
