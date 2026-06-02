-- Códigos internos por proveedor (Etapa 0)
-- Crea SOLO la tabla "ProductoCodigoProveedor" + FK + unique + índices.
-- NO altera "ProductoBase", "Proveedor" ni "Grupo" (solo agrega FKs que las referencian).
-- Idempotente: seguro de re-ejecutar.

-- 1) Tabla
CREATE TABLE IF NOT EXISTS "ProductoCodigoProveedor" (
    "id" SERIAL NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "productoBaseId" INTEGER NOT NULL,
    "proveedorId" INTEGER NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "descripcionProveedor" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductoCodigoProveedor_pkey" PRIMARY KEY ("id")
);

-- 2) Índices
-- Unique de negocio: un código interno único por (grupo, proveedor).
CREATE UNIQUE INDEX IF NOT EXISTS "codigo_interno_unico_por_proveedor"
    ON "ProductoCodigoProveedor"("grupoId", "proveedorId", "codigoInterno");

CREATE INDEX IF NOT EXISTS "ProductoCodigoProveedor_grupoId_proveedorId_codigoInterno_idx"
    ON "ProductoCodigoProveedor"("grupoId", "proveedorId", "codigoInterno");

CREATE INDEX IF NOT EXISTS "ProductoCodigoProveedor_productoBaseId_idx"
    ON "ProductoCodigoProveedor"("productoBaseId");

CREATE INDEX IF NOT EXISTS "ProductoCodigoProveedor_proveedorId_idx"
    ON "ProductoCodigoProveedor"("proveedorId");

-- 3) Foreign keys
DO $$ BEGIN
  ALTER TABLE "ProductoCodigoProveedor" ADD CONSTRAINT "ProductoCodigoProveedor_grupoId_fkey"
    FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductoCodigoProveedor" ADD CONSTRAINT "ProductoCodigoProveedor_productoBaseId_fkey"
    FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- proveedor: ON DELETE RESTRICT (default Prisma para relación requerida).
-- Coherente con soft-delete de Proveedor (campo activo); evita borrar proveedor con vínculos.
DO $$ BEGIN
  ALTER TABLE "ProductoCodigoProveedor" ADD CONSTRAINT "ProductoCodigoProveedor_proveedorId_fkey"
    FOREIGN KEY ("proveedorId") REFERENCES "Proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
