-- CreateEnum
CREATE TYPE "PrecioUpdateMetodo" AS ENUM ('MANUAL', 'AUMENTO', 'REGLAS', 'PEGADO', 'XLSX', 'SCAN');

-- CreateEnum
CREATE TYPE "PrecioUpdatePricingMode" AS ENUM ('KEEP_VENTA', 'RECALC_BY_MARGIN', 'SET_VENTA');

-- CreateTable
CREATE TABLE "PrecioUpdate" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER,
    "usuarioId" INTEGER,
    "metodo" "PrecioUpdateMetodo" NOT NULL,
    "pricingMode" "PrecioUpdatePricingMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecioUpdateItem" (
    "id" SERIAL NOT NULL,
    "precioUpdateId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "costoAnterior" DECIMAL(12,2) NOT NULL,
    "costoNuevo" DECIMAL(12,2) NOT NULL,
    "ventaAnterior" DECIMAL(12,2) NOT NULL,
    "ventaNueva" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecioUpdateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrecioUpdate_grupoId_idx" ON "PrecioUpdate"("grupoId");

-- CreateIndex
CREATE INDEX "PrecioUpdate_proveedorId_idx" ON "PrecioUpdate"("proveedorId");

-- CreateIndex
CREATE INDEX "PrecioUpdateItem_productoBaseId_idx" ON "PrecioUpdateItem"("productoBaseId");

-- AddForeignKey
ALTER TABLE "PrecioUpdateItem" ADD CONSTRAINT "PrecioUpdateItem_precioUpdateId_fkey" FOREIGN KEY ("precioUpdateId") REFERENCES "PrecioUpdate"("id") ON DELETE CASCADE ON UPDATE CASCADE;


