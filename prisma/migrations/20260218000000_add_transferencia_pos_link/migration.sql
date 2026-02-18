-- AlterTable
ALTER TABLE "Transferencia" ADD COLUMN "posTransferenciaId" INTEGER;

-- CreateIndex
CREATE INDEX "Transferencia_posTransferenciaId_idx" ON "Transferencia"("posTransferenciaId");

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_posTransferenciaId_fkey" FOREIGN KEY ("posTransferenciaId") REFERENCES "PosTransferencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
