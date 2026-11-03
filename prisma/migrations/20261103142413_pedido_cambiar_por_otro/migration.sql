-- "CAMBIAR POR OTRO" EN PREPARAR PEDIDO (2026-11-03).
--
-- El local pide un producto (Poett Verde), el depósito no lo tiene pero tiene
-- otro (Poett Rosa) y lo manda en su lugar. La línea del pedido guarda los dos
-- hechos: lo pedido sigue en `productoId` y lo que va, en `reemplazoProductoId`.
-- Al enviar, la línea de la transferencia es del producto que va y recuerda la
-- base de lo pedido en `reemplazaABaseId`, para que el local lea "Pediste …,
-- va …" en la recepción.
--
-- Solo agrega dos columnas nulables con su FK e índice: la versión anterior de
-- la app no las lee ni las escribe y sigue funcionando igual. Las filas que ya
-- existen quedan en null, que es la verdad: ninguna se cambió por otra.

-- AlterTable
ALTER TABLE "PosTransferenciaDetalle" ADD COLUMN     "reemplazoProductoId" INTEGER;

-- AlterTable
ALTER TABLE "TransferenciaDetalle" ADD COLUMN     "reemplazaABaseId" INTEGER;

-- CreateIndex
CREATE INDEX "PosTransferenciaDetalle_reemplazoProductoId_idx" ON "PosTransferenciaDetalle"("reemplazoProductoId");

-- AddForeignKey
ALTER TABLE "TransferenciaDetalle" ADD CONSTRAINT "TransferenciaDetalle_reemplazaABaseId_fkey" FOREIGN KEY ("reemplazaABaseId") REFERENCES "ProductoBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferenciaDetalle" ADD CONSTRAINT "PosTransferenciaDetalle_reemplazoProductoId_fkey" FOREIGN KEY ("reemplazoProductoId") REFERENCES "ProductoLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
