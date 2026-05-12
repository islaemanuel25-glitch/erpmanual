-- Listas de Precios Comerciales por Cliente (Etapa 1)
-- Idempotente salvo el chequeo de huérfanos: si hay listas sin grupoId resoluble, la migración ABORTA
-- y no fuerza NOT NULL (rollback de la transacción de migración, según cómo ejecute el runner).

-- =============================================================================
-- SQL exacto de backfill de ListaPrecio.grupoId (solo vía localId → Grupo)
-- =============================================================================
--  UPDATE "ListaPrecio" lp
--  SET "grupoId" = gl."grupoId"
--  FROM "GrupoLocal" gl
--  WHERE lp."localId" = gl."localId" AND lp."grupoId" IS NULL;
--
--  UPDATE "ListaPrecio" lp
--  SET "grupoId" = gd."grupoId"
--  FROM "GrupoDeposito" gd
--  WHERE lp."localId" = gd."localId" AND lp."grupoId" IS NULL;
-- =============================================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE "ListaPrecioTipoBase" AS ENUM ('PRECIO_VENTA','COSTO','MANUAL_AUTORIZADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoPrecioAplicado" AS ENUM ('PRECIO_VENTA','COSTO_MAS_MARGEN','COSTO_PURO','MANUAL_AUTORIZADO','OVERRIDE_PRODUCTO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) ListaPrecio: columnas nuevas (grupoId queda nullable hasta validar backfill)
ALTER TABLE "ListaPrecio" ADD COLUMN IF NOT EXISTS "grupoId" INTEGER;
ALTER TABLE "ListaPrecio" ADD COLUMN IF NOT EXISTS "tipoBase" "ListaPrecioTipoBase" NOT NULL DEFAULT 'PRECIO_VENTA';
ALTER TABLE "ListaPrecio" ADD COLUMN IF NOT EXISTS "margenPorcentaje" DECIMAL(6,2);
ALTER TABLE "ListaPrecio" ADD COLUMN IF NOT EXISTS "esDefault" BOOLEAN NOT NULL DEFAULT false;

-- 3) Backfill grupoId (única fuente permitida: localId → GrupoLocal / GrupoDeposito)
UPDATE "ListaPrecio" lp
SET "grupoId" = gl."grupoId"
FROM "GrupoLocal" gl
WHERE lp."localId" = gl."localId" AND lp."grupoId" IS NULL;

UPDATE "ListaPrecio" lp
SET "grupoId" = gd."grupoId"
FROM "GrupoDeposito" gd
WHERE lp."localId" = gd."localId" AND lp."grupoId" IS NULL;

-- 4) Reporte + fallo claro si quedan filas sin grupo resoluble (no inventar grupoId)
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO orphan_count FROM "ListaPrecio" WHERE "grupoId" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'listas_precios_comerciales: tras el backfill quedan % fila(s) en "ListaPrecio" con grupoId NULL (localId sin match en GrupoLocal/GrupoDeposito, o localId NULL). Corregir datos y volver a ejecutar la migración. No se asigna grupo por defecto.',
      orphan_count
      USING HINT = 'Revisar cada fila: localId debe existir en GrupoLocal o GrupoDeposito, o eliminar/ajustar listas huérfanas.';
  END IF;
END $$;

-- 5) localId nullable (deprecated; no se elimina la columna)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ListaPrecio'
      AND column_name = 'localId' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "ListaPrecio" ALTER COLUMN "localId" DROP NOT NULL;
  END IF;
END $$;

-- 6) Solo si no hay huérfanos: grupoId NOT NULL
ALTER TABLE "ListaPrecio" ALTER COLUMN "grupoId" SET NOT NULL;

-- 7) FK ListaPrecio.grupoId -> Grupo
DO $$ BEGIN
  ALTER TABLE "ListaPrecio" ADD CONSTRAINT "ListaPrecio_grupoId_fkey"
    FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8) Unique (grupoId, nombre)
DO $$ BEGIN
  ALTER TABLE "ListaPrecio" ADD CONSTRAINT "ListaPrecio_grupoId_nombre_key" UNIQUE ("grupoId","nombre");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ListaPrecio_grupoId_idx" ON "ListaPrecio"("grupoId");

-- 9) Indice parcial: una sola default activa por grupo
CREATE UNIQUE INDEX IF NOT EXISTS "ListaPrecio_default_unico_por_grupo"
  ON "ListaPrecio"("grupoId")
  WHERE "esDefault" = true AND "activo" = true;

-- 10) Cliente.listaPrecioId
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "listaPrecioId" INTEGER;
DO $$ BEGIN
  ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_listaPrecioId_fkey"
    FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Cliente_listaPrecioId_idx" ON "Cliente"("listaPrecioId");

-- 11) Venta.listaPrecioId
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "listaPrecioId" INTEGER;
DO $$ BEGIN
  ALTER TABLE "Venta" ADD CONSTRAINT "Venta_listaPrecioId_fkey"
    FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Venta_listaPrecioId_idx" ON "Venta"("listaPrecioId");

-- 12) VentaDetalle: solo listaPrecioId, tipoPrecioAplicado, margenAplicado
--     (precio final = precio; costo unitario = precioCosto — ya existían, no se duplican)
ALTER TABLE "VentaDetalle" ADD COLUMN IF NOT EXISTS "listaPrecioId" INTEGER;
ALTER TABLE "VentaDetalle" ADD COLUMN IF NOT EXISTS "tipoPrecioAplicado" "TipoPrecioAplicado" NOT NULL DEFAULT 'PRECIO_VENTA';
ALTER TABLE "VentaDetalle" ADD COLUMN IF NOT EXISTS "margenAplicado" DECIMAL(6,2);
DO $$ BEGIN
  ALTER TABLE "VentaDetalle" ADD CONSTRAINT "VentaDetalle_listaPrecioId_fkey"
    FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "VentaDetalle_listaPrecioId_idx" ON "VentaDetalle"("listaPrecioId");
