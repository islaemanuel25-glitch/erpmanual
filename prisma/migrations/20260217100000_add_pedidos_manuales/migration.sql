-- AlterTable
ALTER TABLE "PosTransferencia" ADD COLUMN "origenManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PosTransferencia" ADD COLUMN "solicitadoAt" TIMESTAMP(3);
ALTER TABLE "PosTransferencia" ADD COLUMN "solicitadoPorUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "PosTransferencia"
ADD CONSTRAINT "PosTransferencia_solicitadoPorUserId_fkey"
FOREIGN KEY ("solicitadoPorUserId") REFERENCES "Usuario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PosTransferencia_estado_origenId_destinoId_idx"
ON "PosTransferencia"("estado", "origenId", "destinoId");
