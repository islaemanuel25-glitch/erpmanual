/*
  Warnings:

  - A unique constraint covering the columns `[localId,productoId]` on the table `StockLocal` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "StockLocal" ADD COLUMN     "stockMax" DECIMAL(12,2),
ADD COLUMN     "stockMin" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "Transferencia" (
    "id" SERIAL NOT NULL,
    "origenId" INTEGER NOT NULL,
    "destinoId" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Pendiente',
    "fechaEnvio" TIMESTAMP(3),
    "fechaRecepcion" TIMESTAMP(3),
    "creadaPor" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transferencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferenciaDetalle" (
    "id" SERIAL NOT NULL,
    "transferenciaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "recibido" DECIMAL(12,2),
    "precioCosto" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferenciaDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockLocal_localId_productoId_key" ON "StockLocal"("localId", "productoId");

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_origenId_fkey" FOREIGN KEY ("origenId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transferencia" ADD CONSTRAINT "Transferencia_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaDetalle" ADD CONSTRAINT "TransferenciaDetalle_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "Transferencia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferenciaDetalle" ADD CONSTRAINT "TransferenciaDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "ProductoLocal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
