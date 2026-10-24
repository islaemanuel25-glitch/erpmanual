-- "NO VIENE EN ESTA LISTA": la decisión de una persona sobre un producto suyo
-- que esta lista no trae.
--
-- La revisión de una lista pasó a arrancar de los productos del usuario
-- (2026-10-23). Los que la lista no trajo se ven "Sin vincular" con el botón de
-- buscarlos en la lista, y la hoja ofrece "No viene en esta lista". Hasta hoy
-- ese botón no escribía nada (`entradaDeElegirFila`, puerta PRODUCTO): con una
-- sola pantalla el producto volvía a aparecer sin vincular, como si nadie lo
-- hubiera mirado.
--
-- ADITIVA: una tabla nueva, sin tocar ninguna fila existente ni ninguna columna.
-- Por lista y no por proveedor —eso es `ProductoQueNoSeCambia`—: el mes que
-- viene el proveedor puede traerlo.

-- CreateTable
CREATE TABLE "ProductoQueNoVieneEnLaLista" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "importacionId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "decididoPorUsuarioId" INTEGER,
    "decididoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductoQueNoVieneEnLaLista_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductoQueNoVieneEnLaLista_grupoId_idx" ON "ProductoQueNoVieneEnLaLista"("grupoId");

-- CreateIndex
CREATE INDEX "ProductoQueNoVieneEnLaLista_productoBaseId_idx" ON "ProductoQueNoVieneEnLaLista"("productoBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "no_viene_unico_por_lista_y_producto" ON "ProductoQueNoVieneEnLaLista"("importacionId", "productoBaseId");

-- AddForeignKey
ALTER TABLE "ProductoQueNoVieneEnLaLista" ADD CONSTRAINT "ProductoQueNoVieneEnLaLista_importacionId_fkey" FOREIGN KEY ("importacionId") REFERENCES "ImportacionListaProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductoQueNoVieneEnLaLista" ADD CONSTRAINT "ProductoQueNoVieneEnLaLista_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
