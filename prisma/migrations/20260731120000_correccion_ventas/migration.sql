-- DropIndex
DROP INDEX "MovimientoCuenta_ventaId_key";

-- DropIndex
DROP INDEX "ClientePuntoMovimiento_ventaId_tipo_key";

-- AlterTable
ALTER TABLE "MovimientoCuenta" ADD COLUMN     "correccionId" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Venta" ADD COLUMN     "corregida" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "observaciones" TEXT,
ADD COLUMN     "referenciaInterna" TEXT,
ADD COLUMN     "ultimaCorreccionId" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "VentaDetalle" ADD COLUMN     "cantidadStock" DECIMAL(12,3),
ADD COLUMN     "productoLocalId" INTEGER;

-- AlterTable
ALTER TABLE "ClientePuntoMovimiento" ADD COLUMN     "correccionId" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VentaCorreccion" (
    "id" SERIAL NOT NULL,
    "ventaId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "usuarioId" INTEGER,
    "operadorId" INTEGER,
    "localId" INTEGER,
    "grupoId" INTEGER,
    "turnoIdOriginal" INTEGER,
    "turnoIdCorreccion" INTEGER,
    "turnoCerrado" BOOLEAN NOT NULL DEFAULT false,
    "versionAntes" INTEGER NOT NULL,
    "versionDespues" INTEGER NOT NULL,
    "totalAnterior" DECIMAL(12,2) NOT NULL,
    "totalNuevo" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "snapshotAntes" JSONB NOT NULL,
    "snapshotDespues" JSONB NOT NULL,
    "diffProductos" JSONB,
    "diffPagos" JSONB,
    "impactoStock" JSONB,
    "impactoCaja" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VentaCorreccion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VentaCorreccion_ventaId_idx" ON "VentaCorreccion"("ventaId");

-- CreateIndex
CREATE INDEX "VentaCorreccion_usuarioId_idx" ON "VentaCorreccion"("usuarioId");

-- CreateIndex
CREATE INDEX "VentaCorreccion_createdAt_idx" ON "VentaCorreccion"("createdAt");

-- CreateIndex
CREATE INDEX "VentaCorreccion_tipo_idx" ON "VentaCorreccion"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "VentaCorreccion_ventaId_idempotencyKey_key" ON "VentaCorreccion"("ventaId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "MovimientoCuenta_ventaId_tipo_correccionId_key" ON "MovimientoCuenta"("ventaId", "tipo", "correccionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientePuntoMovimiento_ventaId_tipo_correccionId_key" ON "ClientePuntoMovimiento"("ventaId", "tipo", "correccionId");

