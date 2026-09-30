-- LA CAUSA ESTRUCTURADA DE UN MOVIMIENTO AUDITADO DE STOCK.
--
-- ADITIVA. Una columna nullable en "AuditoriaStock" y un CHECK sobre ella. No
-- toca ninguna fila existente: las anteriores quedan con la causa en NULL aunque
-- su `motivo` tenga texto, porque deducir una causa leyendo castellano sería
-- inventarla.
--
-- Los valores son los que ya guardan "TransferenciaDetalle"."motivoPrincipal" y
-- "PedidoProveedorDetalle"."motivoPrincipal". Viven en
-- `lib/stock/motivosDeDiferencia.js`, y `lib/stock/libro/origenDeStock.test.mjs`
-- exige que la lista de este CHECK sea exactamente esa.

-- AlterTable
ALTER TABLE "AuditoriaStock" ADD COLUMN "motivoPrincipal" TEXT;

-- La base no deja guardar una causa que ninguna pantalla ofrece.
ALTER TABLE "AuditoriaStock"
  ADD CONSTRAINT "AuditoriaStock_motivoPrincipal_check"
  CHECK ("motivoPrincipal" IS NULL OR "motivoPrincipal" IN ('Faltante', 'Producto dañado', 'Sobrante', 'Otro'));
