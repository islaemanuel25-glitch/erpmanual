/*
  Warnings:

  - Se agregan campos faltantes al modelo Venta según schema.prisma
  - Esta migración es segura: solo agrega columnas, no elimina ni modifica existentes

*/
-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "clienteId" INTEGER,
ADD COLUMN     "turnoId" INTEGER,
ADD COLUMN     "subtotal" DECIMAL(12,2),
ADD COLUMN     "descuento" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "total" DECIMAL(12,2),
ADD COLUMN     "comisionBancaria" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "netoRecibido" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "costoTotal" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "gananciaBruta" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "gananciaNeta" DECIMAL(12,2) DEFAULT 0,
ADD COLUMN     "formaPago" TEXT;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venta" ADD CONSTRAINT "Venta_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Venta_clienteId_idx" ON "Venta"("clienteId");

-- CreateIndex
CREATE INDEX "Venta_turnoId_idx" ON "Venta"("turnoId");

