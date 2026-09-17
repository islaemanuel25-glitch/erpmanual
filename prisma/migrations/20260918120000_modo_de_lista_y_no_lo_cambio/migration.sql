-- MODO DE LA LISTA Y LA MEMORIA DE "NO LO CAMBIO".
--
-- ADITIVA: una columna nullable y una tabla nueva. No borra, no reescribe y no
-- cambia el tipo de nada que ya exista. Las 4.748 filas de importación que hay
-- quedan como están.
--
-- ── 1. `modo` en la cabecera de la importación ───────────────────────────────
--
-- Para qué se subió la lista: ACTUALIZAR o CONTROLAR. Nullable a propósito: las
-- importaciones anteriores no lo tienen y son todas de actualizar, así que
-- `modoDeImportacion` cae a ACTUALIZAR y no hace falta escribir el histórico.
ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "modo" TEXT;

-- ── 2. Los productos que no se tocan con las listas de un proveedor ──────────
--
-- "No lo cambio" valía para UNA lista —vive en `ImportacionListaFila.
-- excluidaManual`— así que la lista siguiente volvía a preguntar por el mismo
-- producto. Esta tabla lo recuerda por producto y proveedor.
CREATE TABLE "ProductoQueNoSeCambia" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "decididoPorUsuarioId" INTEGER,
    "decididoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoQueNoSeCambia_pkey" PRIMARY KEY ("id")
);

-- UNA decisión por producto y proveedor: o está marcado o no. El índice se crea
-- sobre una tabla que esta misma migración acaba de crear, así que nace vacía y
-- no puede chocar con duplicados que ya existan.
CREATE UNIQUE INDEX "no_se_cambia_unico_por_producto_y_proveedor" ON "ProductoQueNoSeCambia"("grupoId", "proveedorId", "productoBaseId");
CREATE INDEX "ProductoQueNoSeCambia_grupoId_proveedorId_idx" ON "ProductoQueNoSeCambia"("grupoId", "proveedorId");
CREATE INDEX "ProductoQueNoSeCambia_productoBaseId_idx" ON "ProductoQueNoSeCambia"("productoBaseId");

ALTER TABLE "ProductoQueNoSeCambia" ADD CONSTRAINT "ProductoQueNoSeCambia_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductoQueNoSeCambia" ADD CONSTRAINT "ProductoQueNoSeCambia_proveedorId_fkey" FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductoQueNoSeCambia" ADD CONSTRAINT "ProductoQueNoSeCambia_productoBaseId_fkey" FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
