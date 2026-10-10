-- AlterTable
ALTER TABLE "LlamadaLector" ADD COLUMN     "respuestaCruda" TEXT;

-- AlterTable
ALTER TABLE "PedidoProveedor" ADD COLUMN     "motivoSinCerrar" TEXT,
ADD COLUMN     "recibidoSinCerrar" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CorreccionManualRenglon" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "comprobanteId" INTEGER NOT NULL,
    "comprobanteLineaId" INTEGER,
    "orden" INTEGER NOT NULL,
    "textoCrudo" TEXT,
    "leido" JSONB NOT NULL,
    "puesto" JSONB NOT NULL,
    "cerroDespues" BOOLEAN NOT NULL DEFAULT false,
    "usuarioId" INTEGER,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorreccionManualRenglon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorreccionManualRenglon_comprobanteId_idx" ON "CorreccionManualRenglon"("comprobanteId");
