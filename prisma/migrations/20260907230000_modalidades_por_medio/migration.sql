-- ═══════════════════════════════════════════════════════════════════════════
-- MODALIDADES POR MEDIO DE COBRO
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un solo botón de Mercado Pago en el POS, con modalidades adentro:
--
--     MEDIO VISIBLE   Mercado Pago      ← `MedioCobroLocal`
--     MODALIDAD       Crédito           ← `MedioCobroModalidadLocal`
--     TIPO CONTABLE   CREDITO           ← el enum `MedioPago`
--
-- ── NO SIEMBRA NI UNA MODALIDAD, POR EL MISMO MOTIVO QUE LA MIGRACIÓN DE
--    MEDIOS NO SEMBRÓ NI UN MEDIO ─────────────────────────────────────────
--
-- Después de aplicar esto, sin que nadie configure nada, el POS y la caja tienen
-- que quedar EXACTAMENTE como hoy. Un medio SIN modalidades se comporta como
-- siempre: su tipo contable sale de `MedioCobroLocal`, su recargo de
-- `RecargoPagoLocal` y su comisión de la resolución existente.
--
-- Crear modalidades para los medios actuales sería reinterpretar una
-- configuración que nadie eligió, y además una fila sembrada es indistinguible
-- de una decisión.
--
-- CERO backfill. CERO filas nuevas. CERO ventas históricas tocadas.
--
-- ── LO ÚNICO QUE NO ES ADITIVO, DICHO SIN MAQUILLAJE ──────────────────────
--
-- El paso 4 hace `DROP CONSTRAINT` sobre `VentaPago_ventaId_medio_key` y lo
-- reemplaza por DOS índices únicos parciales. El clasificador va a marcar esta
-- migración como NO ADITIVA por esa palabra, y está bien que lo haga.
--
-- Lo que hay que saber para decidir: **no borra ningún dato** y **no afloja el
-- contrato legacy**. El primer índice parcial replica exactamente lo que la
-- constraint hacía para las filas sin modalidad. Lo que se agrega es la
-- posibilidad de un segundo tender cuando la modalidad es distinta.
--
-- Y NO se usa `UNIQUE (ventaId, medio, modalidadId)`, que sería lo obvio y sería
-- un error: en PostgreSQL dos `NULL` nunca son iguales dentro de un índice
-- único, así que dos tenders legacy del mismo medio —ambos con `modalidadId` en
-- null— dejarían de chocar. Eso aflojaría en silencio la protección que hoy
-- funciona, que es exactamente lo contrario de lo que buscamos.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. La tabla de modalidades
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "MedioCobroModalidadLocal" (
  "id"                SERIAL PRIMARY KEY,
  "medioCobroLocalId" INTEGER NOT NULL,
  "nombre"            TEXT NOT NULL,
  "activo"            BOOLEAN NOT NULL DEFAULT true,
  "orden"             INTEGER NOT NULL DEFAULT 0,
  "tipoContable"      "MedioPago" NOT NULL,
  -- 0 = sin recargo. Igual que la ausencia de fila en `RecargoPagoLocal`.
  "recargoPct"        DECIMAL(5,2) NOT NULL DEFAULT 0,
  -- NULL = SIN CONFIGURAR, y no es 0. De esa diferencia depende
  -- `Venta.comisionPendiente`.
  "comisionPct"       DECIMAL(5,2),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MedioCobroModalidadLocal_medioCobroLocalId_fkey'
  ) THEN
    ALTER TABLE "MedioCobroModalidadLocal"
      ADD CONSTRAINT "MedioCobroModalidadLocal_medioCobroLocalId_fkey"
      FOREIGN KEY ("medioCobroLocalId") REFERENCES "MedioCobroLocal"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "MedioCobroModalidadLocal_medioCobroLocalId_idx"
  ON "MedioCobroModalidadLocal"("medioCobroLocalId");
CREATE INDEX IF NOT EXISTS "MedioCobroModalidadLocal_medioCobroLocalId_activo_orden_idx"
  ON "MedioCobroModalidadLocal"("medioCobroLocalId", "activo", "orden");

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Snapshot en VentaPago — con qué se cobró ESTE tender
-- ───────────────────────────────────────────────────────────────────────────
--
-- Todo nullable. Una venta legacy los deja en null y significa lo que siempre
-- significó. Las FK son SET NULL: borrar configuración no puede borrar un pago
-- ni dejarlo mudo, porque el TEXTO congelado sigue estando.
ALTER TABLE "VentaPago" ADD COLUMN IF NOT EXISTS "medioCobroLocalId" INTEGER;
ALTER TABLE "VentaPago" ADD COLUMN IF NOT EXISTS "medioNombre"       TEXT;
ALTER TABLE "VentaPago" ADD COLUMN IF NOT EXISTS "procesador"        "ProcesadorCobro";
ALTER TABLE "VentaPago" ADD COLUMN IF NOT EXISTS "modalidadId"       INTEGER;
ALTER TABLE "VentaPago" ADD COLUMN IF NOT EXISTS "modalidadNombre"   TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VentaPago_medioCobroLocalId_fkey') THEN
    ALTER TABLE "VentaPago"
      ADD CONSTRAINT "VentaPago_medioCobroLocalId_fkey"
      FOREIGN KEY ("medioCobroLocalId") REFERENCES "MedioCobroLocal"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VentaPago_modalidadId_fkey') THEN
    ALTER TABLE "VentaPago"
      ADD CONSTRAINT "VentaPago_modalidadId_fkey"
      FOREIGN KEY ("modalidadId") REFERENCES "MedioCobroModalidadLocal"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "VentaPago_medioCobroLocalId_idx" ON "VentaPago"("medioCobroLocalId");
CREATE INDEX IF NOT EXISTS "VentaPago_modalidadId_idx"       ON "VentaPago"("modalidadId");

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Snapshot en Venta — quién impuso el recargo
-- ───────────────────────────────────────────────────────────────────────────
--
-- No se duplica el porcentaje: `recargoPagoPct` ya lo congela. Acá va solo la
-- identidad, en pares referencia + texto.
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "recargoPagoMedioCobroLocalId" INTEGER;
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "recargoPagoMedioNombre"       TEXT;
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "recargoPagoModalidadId"       INTEGER;
ALTER TABLE "Venta" ADD COLUMN IF NOT EXISTS "recargoPagoModalidadNombre"   TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Venta_recargoPagoModalidadId_fkey') THEN
    ALTER TABLE "Venta"
      ADD CONSTRAINT "Venta_recargoPagoModalidadId_fkey"
      FOREIGN KEY ("recargoPagoModalidadId") REFERENCES "MedioCobroModalidadLocal"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. La restricción de tenders: una unique por dos índices parciales
-- ───────────────────────────────────────────────────────────────────────────
--
-- ESTE es el paso que el clasificador va a marcar. Ver el encabezado.
--
-- Contrato exigido, los tres casos:
--
--   legacy   · misma venta + mismo medio + modalidad NULL      → RECHAZADO
--   modalidad· misma venta + misma modalidad                   → RECHAZADO
--   dos mods · misma venta + MP/Débito + MP/Crédito            → PERMITIDO
ALTER TABLE "VentaPago" DROP CONSTRAINT IF EXISTS "VentaPago_ventaId_medio_key";

-- Legacy: replica EXACTAMENTE lo que hacía la constraint, acotado a las filas
-- sin modalidad. Nada que antes se rechazara pasa a aceptarse.
CREATE UNIQUE INDEX IF NOT EXISTS "VentaPago_ventaId_medio_sin_modalidad_key"
  ON "VentaPago"("ventaId", "medio")
  WHERE "modalidadId" IS NULL;

-- Con modalidad: una vez cada modalidad por venta. Dos modalidades distintas del
-- mismo medio padre conviven, que es el punto de toda la tanda.
CREATE UNIQUE INDEX IF NOT EXISTS "VentaPago_ventaId_modalidad_key"
  ON "VentaPago"("ventaId", "modalidadId")
  WHERE "modalidadId" IS NOT NULL;
