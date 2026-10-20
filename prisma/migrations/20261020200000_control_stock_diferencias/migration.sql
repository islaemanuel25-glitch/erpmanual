-- CONTROL DE STOCK: el informe de diferencias.
--
-- Solo ADITIVA: una columna nula en `ConteoControlStock`, una columna nula en
-- `ControlStock` y una tabla nueva, vacía. No borra, no renombra y no reescribe
-- ninguna fila. El porqué de cada una está en `prisma/schema.prisma`, junto a
-- `DiferenciaControlStock`.
--
--   · `ConteoControlStock.sistemaAntes`: lo que decía el sistema antes del
--     primer conteo del producto. Las filas viejas quedan en null y se leen de
--     su `AuditoriaStock`; no se rellenan.
--   · `ControlStock.diferenciasCongeladasEn`: cuándo se congeló el informe al
--     terminar. Los ya terminados quedan en null.
--   · `DiferenciaControlStock`: el informe congelado de cada control terminado.

-- AlterTable
ALTER TABLE "ConteoControlStock" ADD COLUMN     "sistemaAntes" DECIMAL(12,3);

-- AlterTable
ALTER TABLE "ControlStock" ADD COLUMN     "diferenciasCongeladasEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DiferenciaControlStock" (
    "id" SERIAL NOT NULL,
    "controlId" INTEGER NOT NULL,
    "productoLocalId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidadFisica" TEXT NOT NULL,
    "sistema" DECIMAL(12,3) NOT NULL,
    "contado" DECIMAL(12,3) NOT NULL,
    "diferencia" DECIMAL(12,3) NOT NULL,
    "costoUnitario" DECIMAL(14,4),
    "importe" DECIMAL(14,2),
    "puestoEnCero" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiferenciaControlStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiferenciaControlStock_controlId_idx" ON "DiferenciaControlStock"("controlId");

-- AddForeignKey
ALTER TABLE "DiferenciaControlStock" ADD CONSTRAINT "DiferenciaControlStock_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
