-- LA TABLA DONDE QUEDA CADA CORRECCIÓN HISTÓRICA DE CAJA.
--
-- Estrictamente aditiva: una tabla nueva, vacía, con su único por código. No
-- toca ninguna tabla existente, no hace UPDATE ni backfill y no corrige ningún
-- dato: las correcciones se aplican después, una por una, desde la app, con
-- permiso propio y un plan autorizado. Ver lib/caja/correcciones/.

-- CreateTable
CREATE TABLE "CorreccionCaja" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "manifiestoHash" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "evidencia" TEXT NOT NULL,
    "autorizadoPorUsuarioId" INTEGER NOT NULL,
    "ejecutadoPorUsuarioId" INTEGER NOT NULL,
    "ejecutadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cambios" JSONB NOT NULL,
    "snapshotAntes" JSONB NOT NULL,
    "snapshotDespues" JSONB NOT NULL,

    CONSTRAINT "CorreccionCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CorreccionCaja_codigo_key" ON "CorreccionCaja"("codigo");

-- CreateIndex
CREATE INDEX "CorreccionCaja_ejecutadoEn_idx" ON "CorreccionCaja"("ejecutadoEn");
