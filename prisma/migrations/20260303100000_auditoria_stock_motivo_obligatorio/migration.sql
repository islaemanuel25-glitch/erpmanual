-- AlterTable
ALTER TABLE "ConfiguracionGrupo" ADD COLUMN     "requireMotivoAjusteStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requireMotivoLimitesStock" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AuditoriaStock" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "productoLocalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "cantidadAnterior" DECIMAL(12,2),
    "cantidadNueva" DECIMAL(12,2),
    "stockMinAnterior" DECIMAL(12,2),
    "stockMinNuevo" DECIMAL(12,2),
    "stockMaxAnterior" DECIMAL(12,2),
    "stockMaxNuevo" DECIMAL(12,2),
    "motivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditoriaStock_grupoId_localId_idx" ON "AuditoriaStock"("grupoId", "localId");

-- CreateIndex
CREATE INDEX "AuditoriaStock_productoLocalId_idx" ON "AuditoriaStock"("productoLocalId");

-- CreateIndex
CREATE INDEX "AuditoriaStock_createdAt_idx" ON "AuditoriaStock"("createdAt");

-- AddForeignKey
ALTER TABLE "AuditoriaStock" ADD CONSTRAINT "AuditoriaStock_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditoriaStock" ADD CONSTRAINT "AuditoriaStock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
