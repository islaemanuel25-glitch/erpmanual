-- Vínculos para el futuro flujo de ventas internas (depósito → local del grupo).
-- ADITIVA y compatible: dos columnas nullable, sin backfill y sin tocar datos
-- existentes. No activa ningún comportamiento: por ahora nadie escribe estas
-- columnas, así que todas las filas quedan en NULL.
--
-- Cada vínculo aporta exactamente tres cosas: la columna nullable, UN índice
-- UNIQUE (que en PostgreSQL ya sirve también para las búsquedas, así que no se
-- agrega un índice normal redundante sobre la misma columna) y la foreign key.

-- 1) Cliente.localVinculadoId — local INTERNO que el cliente representa.
--    Distinto de Cliente.localId, que sigue siendo el local PROPIETARIO de la
--    ficha (ámbito de la agenda) y no se modifica.
ALTER TABLE "Cliente" ADD COLUMN "localVinculadoId" INTEGER;

-- Uno a uno: un local no puede estar representado por dos clientes. En PostgreSQL
-- los NULL son distintos entre sí en un índice único, así que todos los clientes
-- externos (NULL) conviven sin colisionar.
CREATE UNIQUE INDEX "Cliente_localVinculadoId_key"
  ON "Cliente"("localVinculadoId");

-- SET NULL: si algún día se elimina el local, el cliente sobrevive y simplemente
-- deja de representarlo (no se borra la ficha ni su historial comercial).
ALTER TABLE "Cliente"
  ADD CONSTRAINT "Cliente_localVinculadoId_fkey"
  FOREIGN KEY ("localVinculadoId") REFERENCES "Local"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Transferencia.ventaId — venta que originó el envío.
--    NULL = transferencia manual (todas las existentes, originadas en
--    PosTransferencia). Convive con posTransferenciaId; todavía sin constraint de
--    exclusión entre ambos.
ALTER TABLE "Transferencia" ADD COLUMN "ventaId" INTEGER;

-- Uno a uno: una venta no puede generar dos remitos. Aporta idempotencia
-- estructural al futuro alta desde POS. Los NULL de las manuales conviven.
CREATE UNIQUE INDEX "Transferencia_ventaId_key"
  ON "Transferencia"("ventaId");

-- SET NULL: la transferencia y su historial de stock sobreviven aunque la venta
-- desaparezca (hoy las ventas no se eliminan; queda coherente para el futuro).
ALTER TABLE "Transferencia"
  ADD CONSTRAINT "Transferencia_ventaId_fkey"
  FOREIGN KEY ("ventaId") REFERENCES "Venta"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
