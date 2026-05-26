-- AlterTable
ALTER TABLE "ProductoBase"
ADD COLUMN "codigo_barra_secundario" TEXT;

-- CreateIndex
CREATE INDEX "ProductoBase_grupoId_codigo_barra_secundario_idx"
ON "ProductoBase"("grupoId", "codigo_barra_secundario");
