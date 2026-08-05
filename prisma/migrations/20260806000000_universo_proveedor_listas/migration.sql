-- UNIVERSO POR PROVEEDOR y coincidencia por código de barras.
--
-- Aditiva: un solo valor nuevo en el enum. No borra, no transforma y no
-- reescribe ninguna fila. El cambio de universo es de CÓDIGO, no de datos: no
-- hay backfill posible ni deseable, porque reinterpretar una conciliación vieja
-- es justamente lo que hace el reconciliador, a pedido y con confirmación.

ALTER TYPE "TipoCoincidenciaLista" ADD VALUE IF NOT EXISTS 'CODIGO_BARRA';
