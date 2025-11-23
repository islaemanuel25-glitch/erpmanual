-- AlterTable
ALTER TABLE "Transferencia" ADD COLUMN     "tieneDiferencias" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "TransferenciaDetalle" ADD COLUMN     "confirmadoPorId" INTEGER,
ADD COLUMN     "fechaRecepcion" TIMESTAMP(3),
ADD COLUMN     "motivoDiferencia" TEXT;

-- CreateTable
CREATE TABLE "PosTransferencia" (
    "id" SERIAL NOT NULL,
    "origenId" INTEGER NOT NULL,
    "destinoId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Borrador',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTransferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosTransferenciaDetalle" (
    "id" SERIAL NOT NULL,
    "posTransferenciaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "sugerido" DECIMAL(12,2),
    "preparado" DECIMAL(12,2),
    "tipo" TEXT NOT NULL DEFAULT 'sugerido',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosTransferenciaDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosTransferencia_origenId_idx" ON "PosTransferencia"("origenId");

-- CreateIndex
CREATE INDEX "PosTransferencia_destinoId_idx" ON "PosTransferencia"("destinoId");

-- CreateIndex
CREATE INDEX "PosTransferencia_usuarioId_idx" ON "PosTransferencia"("usuarioId");

-- CreateIndex
CREATE INDEX "PosTransferencia_estado_idx" ON "PosTransferencia"("estado");

-- CreateIndex
CREATE INDEX "PosTransferenciaDetalle_posTransferenciaId_idx" ON "PosTransferenciaDetalle"("posTransferenciaId");

-- CreateIndex
CREATE INDEX "PosTransferenciaDetalle_productoId_idx" ON "PosTransferenciaDetalle"("productoId");

-- CreateIndex
CREATE INDEX "PosTransferenciaDetalle_tipo_idx" ON "PosTransferenciaDetalle"("tipo");

-- AddForeignKey
ALTER TABLE "TransferenciaDetalle" ADD CONSTRAINT "TransferenciaDetalle_confirmadoPorId_fkey" FOREIGN KEY ("confirmadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferencia" ADD CONSTRAINT "PosTransferencia_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferencia" ADD CONSTRAINT "PosTransferencia_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferencia" ADD CONSTRAINT "PosTransferencia_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferenciaDetalle" ADD CONSTRAINT "PosTransferenciaDetalle_posTransferenciaId_fkey" FOREIGN KEY ("posTransferenciaId") REFERENCES "PosTransferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosTransferenciaDetalle" ADD CONSTRAINT "PosTransferenciaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ProductoLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
