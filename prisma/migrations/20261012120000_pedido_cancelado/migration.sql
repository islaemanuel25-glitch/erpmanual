-- Tanda 9A: cancelar un pedido Solicitado lo MARCA en vez de borrarlo.
-- Solo agrega columnas nulas: no toca ninguna fila existente.

-- AlterTable
ALTER TABLE "PosTransferencia" ADD COLUMN     "canceladoAt" TIMESTAMP(3),
ADD COLUMN     "canceladoPorUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "PosTransferencia" ADD CONSTRAINT "PosTransferencia_canceladoPorUserId_fkey" FOREIGN KEY ("canceladoPorUserId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
