-- CONTROL DE STOCK: el conteo físico de un local.
--
-- Solo ADITIVA: un enum nuevo, dos tablas nuevas y una columna nullable en
-- `AuditoriaStock`. No borra, no renombra y no reescribe ninguna fila. Los dos
-- permisos para los roles que ya existen van APARTE, en
-- `20261020120100_permisos_control_stock_dueno_local`, porque son un UPDATE y el
-- clasificador del despliegue los frena: así esta queda limpia y aquélla se
-- confirma sola.
--
-- El porqué de cada columna está en `prisma/schema.prisma`, junto a
-- `ControlStock`. Las reglas, en `lib/stock/control/controlStock.js`.

-- CreateEnum
CREATE TYPE "EstadoControlStock" AS ENUM ('ABIERTO', 'TERMINADO');

-- AlterTable
ALTER TABLE "AuditoriaStock" ADD COLUMN     "controlStockId" INTEGER;

-- CreateTable
CREATE TABLE "ControlStock" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "estado" "EstadoControlStock" NOT NULL DEFAULT 'ABIERTO',
    "abiertoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abiertoPorUsuarioId" INTEGER NOT NULL,
    "abiertoPorOperadorId" INTEGER,
    "abiertoPorNombre" TEXT NOT NULL,
    "terminadoEn" TIMESTAMP(3),
    "terminadoPorUsuarioId" INTEGER,
    "terminadoPorOperadorId" INTEGER,
    "terminadoPorNombre" TEXT,
    "puestosEnCero" INTEGER,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConteoControlStock" (
    "id" SERIAL NOT NULL,
    "controlId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,
    "productoLocalId" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "usuarioId" INTEGER NOT NULL,
    "operadorId" INTEGER,
    "contadoPor" TEXT NOT NULL,
    "fijo" BOOLEAN NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,
    "borradoEn" TIMESTAMP(3),

    CONSTRAINT "ConteoControlStock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlStock_localId_estado_idx" ON "ControlStock"("localId", "estado");

-- CreateIndex
CREATE INDEX "ConteoControlStock_controlId_productoLocalId_idx" ON "ConteoControlStock"("controlId", "productoLocalId");

-- CreateIndex
CREATE INDEX "ConteoControlStock_controlId_usuarioId_operadorId_idx" ON "ConteoControlStock"("controlId", "usuarioId", "operadorId");

-- CreateIndex
CREATE INDEX "AuditoriaStock_controlStockId_idx" ON "AuditoriaStock"("controlStockId");

-- AddForeignKey
ALTER TABLE "ControlStock" ADD CONSTRAINT "ControlStock_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConteoControlStock" ADD CONSTRAINT "ConteoControlStock_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlStock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── UN SOLO CONTROL ABIERTO POR LOCAL ──────────────────────────────────────
--
-- La ruta de abrir ya pregunta antes de crear, pero dos celulares que tocan
-- "Empezar control" a la vez pasarían los dos la pregunta. Este índice hace que
-- el segundo falle en la base. Prisma no sabe expresar un índice parcial: vive
-- acá, y `migrate diff` no lo ve en ninguno de los dos lados.
CREATE UNIQUE INDEX "ControlStock_un_abierto_por_local"
    ON "ControlStock"("localId")
    WHERE "estado" = 'ABIERTO';
