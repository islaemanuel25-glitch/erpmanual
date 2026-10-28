-- QUÉ DEPÓSITO RESOLVIÓ CADA RENGLÓN DE UN PEDIDO.
--
-- Regla de Emanuel (2026-10-28): dos depósitos de la misma empresa —uno de frío
-- y otro de mercadería— arman EL MISMO pedido de un local, cada uno su parte, y
-- el pedido sale una sola vez. Cada renglón descuenta del stock del depósito
-- que lo resolvió, en su propia transferencia; para eso el renglón tiene que
-- decir quién fue.
--
-- ADITIVA: una columna nula y su clave foránea. No rellena nada: las líneas de
-- antes quedan en null y salen del origen del pedido, como siempre. La versión
-- que está atendiendo no la conoce y sigue escribiendo igual.
ALTER TABLE "PosTransferenciaDetalle" ADD COLUMN "resueltoPorDepositoId" INTEGER;

ALTER TABLE "PosTransferenciaDetalle" ADD CONSTRAINT "PosTransferenciaDetalle_resueltoPorDepositoId_fkey" FOREIGN KEY ("resueltoPorDepositoId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;
