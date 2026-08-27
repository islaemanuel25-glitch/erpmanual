-- RECETAS DE LECTURA POR PROVEEDOR Y POR FORMATO.
--
-- Tabla NUEVA y vacía. No toca `RecetaProveedor` ni ninguna otra: la receta de
-- impuestos sigue siendo una por proveedor, y ésta guarda cómo se lee cada
-- formato —Consumidor Final, Responsable Inscripto—, que son varios.
--
-- Es aditiva pura: `CREATE TABLE` de algo que no existía. No bloquea escrituras
-- sobre ninguna tabla en uso, no hay backfill y no hay dato que se pierda si se
-- revierte.

CREATE TABLE "RecetaLecturaProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "receta" JSONB NOT NULL,
    "explicacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "confirmadaPorUsuarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecetaLecturaProveedor_pkey" PRIMARY KEY ("id")
);

-- Varias por proveedor, una por nombre de variante. Es lo que permite que el
-- mismo proveedor tenga su formato de Consumidor Final y el de Responsable
-- Inscripto sin que uno pise al otro.
CREATE UNIQUE INDEX "RecetaLecturaProveedor_grupoId_proveedorId_nombre_key"
    ON "RecetaLecturaProveedor"("grupoId", "proveedorId", "nombre");

CREATE INDEX "RecetaLecturaProveedor_proveedorId_idx"
    ON "RecetaLecturaProveedor"("proveedorId");

ALTER TABLE "RecetaLecturaProveedor"
    ADD CONSTRAINT "RecetaLecturaProveedor_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
