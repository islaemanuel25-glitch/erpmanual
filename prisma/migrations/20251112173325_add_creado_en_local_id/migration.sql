/*
  Warnings:

  - A unique constraint covering the columns `[localId,baseId]` on the table `ProductoLocal` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ProductoBase" ADD COLUMN     "creadoEnLocalId" INTEGER;

-- CreateIndex
CREATE INDEX "ListaPrecio_localId_idx" ON "ListaPrecio"("localId");

-- CreateIndex
CREATE INDEX "ProductoBase_grupoId_idx" ON "ProductoBase"("grupoId");

-- CreateIndex
CREATE INDEX "ProductoBase_creadoEnLocalId_idx" ON "ProductoBase"("creadoEnLocalId");

-- CreateIndex
CREATE INDEX "ProductoBase_categoria_id_idx" ON "ProductoBase"("categoria_id");

-- CreateIndex
CREATE INDEX "ProductoBase_proveedor_id_idx" ON "ProductoBase"("proveedor_id");

-- CreateIndex
CREATE INDEX "ProductoBase_area_fisica_id_idx" ON "ProductoBase"("area_fisica_id");

-- CreateIndex
CREATE INDEX "ProductoListaPrecio_listaPrecioId_idx" ON "ProductoListaPrecio"("listaPrecioId");

-- CreateIndex
CREATE INDEX "ProductoListaPrecio_baseId_idx" ON "ProductoListaPrecio"("baseId");

-- CreateIndex
CREATE INDEX "ProductoLocal_localId_idx" ON "ProductoLocal"("localId");

-- CreateIndex
CREATE INDEX "ProductoLocal_baseId_idx" ON "ProductoLocal"("baseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductoLocal_localId_baseId_key" ON "ProductoLocal"("localId", "baseId");

-- CreateIndex
CREATE INDEX "StockLocal_localId_idx" ON "StockLocal"("localId");

-- CreateIndex
CREATE INDEX "StockLocal_productoId_idx" ON "StockLocal"("productoId");

-- CreateIndex
CREATE INDEX "Transferencia_origenId_idx" ON "Transferencia"("origenId");

-- CreateIndex
CREATE INDEX "Transferencia_destinoId_idx" ON "Transferencia"("destinoId");

-- CreateIndex
CREATE INDEX "Transferencia_estado_idx" ON "Transferencia"("estado");

-- CreateIndex
CREATE INDEX "Transferencia_createdAt_idx" ON "Transferencia"("createdAt");

-- CreateIndex
CREATE INDEX "TransferenciaDetalle_transferenciaId_idx" ON "TransferenciaDetalle"("transferenciaId");

-- CreateIndex
CREATE INDEX "TransferenciaDetalle_productoId_idx" ON "TransferenciaDetalle"("productoId");

-- AddForeignKey
ALTER TABLE "ProductoBase" ADD CONSTRAINT "ProductoBase_creadoEnLocalId_fkey" FOREIGN KEY ("creadoEnLocalId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;
