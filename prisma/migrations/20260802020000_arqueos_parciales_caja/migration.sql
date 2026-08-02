-- AlterTable
ALTER TABLE "ConfiguracionLocal" ADD COLUMN     "arqueoCajaActivo" BOOLEAN,
ADD COLUMN     "intervaloArqueoMinutos" INTEGER,
ADD COLUMN     "postergacionCajeroMinutos" INTEGER,
ADD COLUMN     "requiereAutorizacionPostergacion" BOOLEAN,
ADD COLUMN     "toleranciaPostergacionMinutos" INTEGER;

-- CreateTable
CREATE TABLE "ArqueoCaja" (
    "id" SERIAL NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "operadorId" INTEGER,
    "realizadoPorId" INTEGER NOT NULL,
    "fechaHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodoDesde" TIMESTAMP(3) NOT NULL,
    "periodoHasta" TIMESTAMP(3) NOT NULL,
    "efectivoEsperado" DECIMAL(12,2) NOT NULL,
    "efectivoContado" DECIMAL(12,2) NOT NULL,
    "diferencia" DECIMAL(12,2) NOT NULL,
    "observacion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'PARCIAL',
    "alertaProgramadaPara" TIMESTAMP(3),
    "minutosDemora" INTEGER,
    "fuePostergado" BOOLEAN NOT NULL DEFAULT false,
    "postergadoPorId" INTEGER,
    "motivoPostergacion" TEXT,
    "cantidadPostergaciones" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArqueoCaja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArqueoPostergacion" (
    "id" SERIAL NOT NULL,
    "turnoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "alertaProgramadaPara" TIMESTAMP(3) NOT NULL,
    "venceEn" TIMESTAMP(3) NOT NULL,
    "minutosDemora" INTEGER NOT NULL DEFAULT 0,
    "postergadoPorId" INTEGER NOT NULL,
    "motivo" TEXT,
    "autorizadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArqueoPostergacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArqueoCaja_turnoId_idx" ON "ArqueoCaja"("turnoId");

-- CreateIndex
CREATE INDEX "ArqueoCaja_localId_idx" ON "ArqueoCaja"("localId");

-- CreateIndex
CREATE INDEX "ArqueoCaja_fechaHora_idx" ON "ArqueoCaja"("fechaHora");

-- CreateIndex
CREATE INDEX "ArqueoCaja_tipo_idx" ON "ArqueoCaja"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "ArqueoCaja_turnoId_idempotencyKey_key" ON "ArqueoCaja"("turnoId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ArqueoPostergacion_turnoId_idx" ON "ArqueoPostergacion"("turnoId");

-- CreateIndex
CREATE INDEX "ArqueoPostergacion_localId_idx" ON "ArqueoPostergacion"("localId");

-- CreateIndex
CREATE INDEX "ArqueoPostergacion_venceEn_idx" ON "ArqueoPostergacion"("venceEn");

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_realizadoPorId_fkey" FOREIGN KEY ("realizadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoCaja" ADD CONSTRAINT "ArqueoCaja_postergadoPorId_fkey" FOREIGN KEY ("postergadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoPostergacion" ADD CONSTRAINT "ArqueoPostergacion_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES "Turno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoPostergacion" ADD CONSTRAINT "ArqueoPostergacion_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoPostergacion" ADD CONSTRAINT "ArqueoPostergacion_postergadoPorId_fkey" FOREIGN KEY ("postergadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArqueoPostergacion" ADD CONSTRAINT "ArqueoPostergacion_autorizadoPorId_fkey" FOREIGN KEY ("autorizadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
