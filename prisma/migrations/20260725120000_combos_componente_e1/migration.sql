-- ============================================================================
-- E1 — Combos exclusivos por local
-- ----------------------------------------------------------------------------
-- Aditiva y compatible: crea ComboComponente y VentaDetalleComponente, y el
-- índice único ProductoLocal(id, localId) que es destino de las FK compuestas.
-- Idempotente (IF NOT EXISTS / DO duplicate_object), igual estilo que la
-- migración grupodeposito_lista_default. NO modifica datos ni tablas existentes
-- salvo agregar el índice único a ProductoLocal.
--
-- Integridad clave:
--   * Dos FK COMPUESTAS de ComboComponente → ProductoLocal(id, localId).
--   * CHECK ("comboLocalId" = "componenteLocalId"): imposible que combo y
--     componente pertenezcan a locales distintos. (El CHECK NO lo gestiona
--     Prisma; se mantiene en la base y Prisma no lo elimina.)
--
-- Rollback documentado al pie.
-- ============================================================================

-- 1) Índice único destino de las FK compuestas (id ya es PK; el compuesto es inocuo)
CREATE UNIQUE INDEX IF NOT EXISTS "ProductoLocal_id_localId_key"
  ON "ProductoLocal" ("id", "localId");

-- 2) Tabla ComboComponente ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "ComboComponente" (
  "id"                        SERIAL        NOT NULL,
  "comboProductoLocalId"      INTEGER       NOT NULL,
  "comboLocalId"              INTEGER       NOT NULL,
  "componenteProductoLocalId" INTEGER       NOT NULL,
  "componenteLocalId"         INTEGER       NOT NULL,
  "cantidad"                  DECIMAL(12,3) NOT NULL,
  "createdAt"                 TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComboComponente_pkey" PRIMARY KEY ("id")
);

-- Sin componentes duplicados dentro de un mismo combo
CREATE UNIQUE INDEX IF NOT EXISTS "ComboComponente_combo_componente_key"
  ON "ComboComponente" ("comboProductoLocalId", "componenteProductoLocalId");
CREATE INDEX IF NOT EXISTS "ComboComponente_componentePL_idx"
  ON "ComboComponente" ("componenteProductoLocalId", "componenteLocalId");
CREATE INDEX IF NOT EXISTS "ComboComponente_comboLocalId_idx"
  ON "ComboComponente" ("comboLocalId");

-- CHECK: combo y componente en la MISMA ubicación (garantía a nivel base de datos)
DO $$ BEGIN
  ALTER TABLE "ComboComponente"
    ADD CONSTRAINT "ComboComponente_mismo_local_check"
    CHECK ("comboLocalId" = "componenteLocalId");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK COMPUESTA combo → ProductoLocal(id, localId) · CASCADE
DO $$ BEGIN
  ALTER TABLE "ComboComponente"
    ADD CONSTRAINT "ComboComponente_comboPL_fkey"
    FOREIGN KEY ("comboProductoLocalId", "comboLocalId")
    REFERENCES "ProductoLocal" ("id", "localId")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK COMPUESTA componente → ProductoLocal(id, localId) · RESTRICT
DO $$ BEGIN
  ALTER TABLE "ComboComponente"
    ADD CONSTRAINT "ComboComponente_componentePL_fkey"
    FOREIGN KEY ("componenteProductoLocalId", "componenteLocalId")
    REFERENCES "ProductoLocal" ("id", "localId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Tabla VentaDetalleComponente -------------------------------------------
CREATE TABLE IF NOT EXISTS "VentaDetalleComponente" (
  "id"              SERIAL        NOT NULL,
  "ventaDetalleId"  INTEGER       NOT NULL,
  "productoBaseId"  INTEGER       NOT NULL,
  "productoLocalId" INTEGER,
  "cantidad"        DECIMAL(12,3) NOT NULL,
  "precioCosto"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VentaDetalleComponente_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VentaDetalleComponente_ventaDetalleId_idx"
  ON "VentaDetalleComponente" ("ventaDetalleId");
CREATE INDEX IF NOT EXISTS "VentaDetalleComponente_productoBaseId_idx"
  ON "VentaDetalleComponente" ("productoBaseId");
CREATE INDEX IF NOT EXISTS "VentaDetalleComponente_productoLocalId_idx"
  ON "VentaDetalleComponente" ("productoLocalId");

-- FK a la línea de venta · CASCADE (borrar la línea borra sus componentes)
DO $$ BEGIN
  ALTER TABLE "VentaDetalleComponente"
    ADD CONSTRAINT "VentaDetalleComponente_ventaDetalleId_fkey"
    FOREIGN KEY ("ventaDetalleId") REFERENCES "VentaDetalle" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK a la identidad comercial · RESTRICT: si el ProductoBase participó como
-- componente vendido, este historial BLOQUEA su borrado físico (intencional,
-- preserva identidad/trazabilidad). El producto igual puede desactivarse.
DO $$ BEGIN
  ALTER TABLE "VentaDetalleComponente"
    ADD CONSTRAINT "VentaDetalleComponente_productoBaseId_fkey"
    FOREIGN KEY ("productoBaseId") REFERENCES "ProductoBase" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- FK a la fila de stock exacta · SET NULL (no bloquea ni borra el historial)
DO $$ BEGIN
  ALTER TABLE "VentaDetalleComponente"
    ADD CONSTRAINT "VentaDetalleComponente_productoLocalId_fkey"
    FOREIGN KEY ("productoLocalId") REFERENCES "ProductoLocal" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- ROLLBACK (manual, si hiciera falta):
--   DROP TABLE IF EXISTS "VentaDetalleComponente";
--   DROP TABLE IF EXISTS "ComboComponente";
--   DROP INDEX IF EXISTS "ProductoLocal_id_localId_key";
-- ============================================================================
