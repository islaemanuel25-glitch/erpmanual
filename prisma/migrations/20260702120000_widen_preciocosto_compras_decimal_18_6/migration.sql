-- Amplía la precisión del costo por unidad de pedido a proveedor de DECIMAL(12,2)
-- a DECIMAL(18,6). Cambio SOLO de precisión (no de escala hacia abajo), sin pérdida
-- de datos: los valores existentes (2 decimales) se preservan tal cual.
-- Motivo: conservar el costo unitario derivado de packs con factor no divisor
-- (ej. 1480/18 = 82,222222) para que el subtotal no drifte al alternar Pack/Unidad
-- ni al reabrir/exportar/recibir. Los totales/montos finales siguen en 2 decimales.

-- AlterTable
ALTER TABLE "PedidoProveedorDetalle" ALTER COLUMN "precioCosto" SET DATA TYPE DECIMAL(18,6);
