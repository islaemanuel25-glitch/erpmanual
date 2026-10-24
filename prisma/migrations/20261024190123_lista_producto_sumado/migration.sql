-- ADITIVA: una tabla nueva, vacía. No toca ninguna fila existente.
--
-- Los productos del resto del catálogo aceptados en una lista con «✓ Sí» u
-- «Otro» en "Pueden ser de…", y qué lugar de proveedor llenó cada uno, para
-- poder deshacerlo sin tocar el proveedor que tenía antes (2026-10-24).

-- CreateTable
CREATE TABLE "ProductoSumadoALaLista" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "importacionId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "lugarDelProveedor" TEXT,
    "sumadoPorUsuarioId" INTEGER,
    "sumadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductoSumadoALaLista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductoSumadoALaLista_grupoId_idx" ON "ProductoSumadoALaLista"("grupoId");

-- CreateIndex
CREATE INDEX "ProductoSumadoALaLista_productoBaseId_idx" ON "ProductoSumadoALaLista"("productoBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "sumado_unico_por_lista_y_producto" ON "ProductoSumadoALaLista"("importacionId", "productoBaseId");

-- AddForeignKey
ALTER TABLE "ProductoSumadoALaLista" ADD CONSTRAINT "ProductoSumadoALaLista_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionListaProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoSumadoALaLista" ADD CONSTRAINT "ProductoSumadoALaLista_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
