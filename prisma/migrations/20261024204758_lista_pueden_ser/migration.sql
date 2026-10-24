-- ADITIVA: una columna nula y una tabla nueva, vacía. No toca ninguna fila.
--
-- "Pueden ser de…" deja de calcularse al tocar un botón: se calcula al leer la
-- lista, al volver a conciliar y al deshacer, y se guarda (2026-10-24). Las
-- listas de antes quedan con `puedenSerCalculadoEn` en null y la primera
-- lectura lo calcula.

-- AlterTable
ALTER TABLE "ImportacionListaProveedor" ADD COLUMN     "puedenSerCalculadoEn" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductoQuePuedeSerDeLaLista" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "importacionId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "filaId" INTEGER NOT NULL,
    "puntaje" DOUBLE PRECISION NOT NULL,
    "calculadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductoQuePuedeSerDeLaLista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductoQuePuedeSerDeLaLista_grupoId_idx" ON "ProductoQuePuedeSerDeLaLista"("grupoId");

-- CreateIndex
CREATE INDEX "ProductoQuePuedeSerDeLaLista_productoBaseId_idx" ON "ProductoQuePuedeSerDeLaLista"("productoBaseId");

-- CreateIndex
CREATE INDEX "ProductoQuePuedeSerDeLaLista_filaId_idx" ON "ProductoQuePuedeSerDeLaLista"("filaId");

-- CreateIndex
CREATE UNIQUE INDEX "puede_ser_unico_por_lista_y_producto" ON "ProductoQuePuedeSerDeLaLista"("importacionId", "productoBaseId");

-- AddForeignKey
ALTER TABLE "ProductoQuePuedeSerDeLaLista" ADD CONSTRAINT "ProductoQuePuedeSerDeLaLista_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionListaProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoQuePuedeSerDeLaLista" ADD CONSTRAINT "ProductoQuePuedeSerDeLaLista_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoQuePuedeSerDeLaLista" ADD CONSTRAINT "ProductoQuePuedeSerDeLaLista_filaId_fkey" FOREIGN KEY ("filaId") REFERENCES "ImportacionListaFila"("id") ON DELETE CASCADE ON UPDATE CASCADE;
