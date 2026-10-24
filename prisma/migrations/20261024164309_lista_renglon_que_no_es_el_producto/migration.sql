-- "NO, ESE RENGLÓN NO ES ESTE PRODUCTO".
--
-- La búsqueda opcional "Buscar en el resto de mis productos" de la revisión de
-- una lista propone productos del catálogo que no figuran como del proveedor y
-- se parecen a un renglón sin vincular. Cuando la persona contesta «No», esa
-- pareja —producto y código del renglón— se recuerda acá para no volver a
-- proponerla en las próximas listas del mismo proveedor.
--
-- ADITIVA: una tabla nueva, vacía, sin tocar ninguna fila ni ninguna columna.

-- CreateTable
CREATE TABLE "RenglonQueNoEsElProducto" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "descripcionProveedor" TEXT,
    "decididoPorUsuarioId" INTEGER,
    "decididoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenglonQueNoEsElProducto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RenglonQueNoEsElProducto_grupoId_proveedorId_idx" ON "RenglonQueNoEsElProducto"("grupoId", "proveedorId");

-- CreateIndex
CREATE INDEX "RenglonQueNoEsElProducto_productoBaseId_idx" ON "RenglonQueNoEsElProducto"("productoBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "renglon_no_es_unico" ON "RenglonQueNoEsElProducto"("grupoId", "proveedorId", "productoBaseId", "codigoInterno");

-- AddForeignKey
ALTER TABLE "RenglonQueNoEsElProducto" ADD CONSTRAINT "RenglonQueNoEsElProducto_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenglonQueNoEsElProducto" ADD CONSTRAINT "RenglonQueNoEsElProducto_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenglonQueNoEsElProducto" ADD CONSTRAINT "RenglonQueNoEsElProducto_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
