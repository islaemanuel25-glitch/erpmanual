-- CreateTable
CREATE TABLE "PropuestaIaRenglon" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "comprobanteLineaId" INTEGER NOT NULL,
    "productoBaseId" INTEGER,
    "unidadesPorPack" INTEGER,
    "motivo" TEXT,
    "valida" BOOLEAN NOT NULL DEFAULT false,
    "variacionPct" DECIMAL(9,2),
    "modelo" TEXT,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" TEXT,
    "resueltaEn" TIMESTAMP(3),
    "productoElegidoId" INTEGER,

    CONSTRAINT "PropuestaIaRenglon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropuestaIaRenglon_comprobanteLineaId_key" ON "PropuestaIaRenglon"("comprobanteLineaId");

-- CreateIndex
CREATE INDEX "PropuestaIaRenglon_grupoId_idx" ON "PropuestaIaRenglon"("grupoId");

-- AddForeignKey
ALTER TABLE "PropuestaIaRenglon" ADD CONSTRAINT "PropuestaIaRenglon_comprobanteLineaId_fkey" FOREIGN KEY ("comprobanteLineaId") REFERENCES "ComprobanteLinea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
