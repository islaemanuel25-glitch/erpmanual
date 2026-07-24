-- Regla B (visibilidad de proveedores): marca opcional del local que dio de
-- alta el proveedor. Solo se usa como fallback cuando el proveedor aún no tiene
-- productos; con productos la visibilidad se deriva de ellos. Nullable, sin
-- backfill (los proveedores existentes ya están referenciados por productos).

-- AlterTable
ALTER TABLE "Proveedor" ADD COLUMN "creadoEnLocalId" INTEGER;

-- CreateIndex
CREATE INDEX "Proveedor_creadoEnLocalId_idx" ON "Proveedor"("creadoEnLocalId");

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_creadoEnLocalId_fkey" FOREIGN KEY ("creadoEnLocalId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;
