-- 1) Venta: clientTxnId + índices
ALTER TABLE "Venta"
  ADD COLUMN IF NOT EXISTS "clientTxnId" TEXT;

-- Unique clientTxnId (permite NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'Venta_clientTxnId_key'
  ) THEN
    CREATE UNIQUE INDEX "Venta_clientTxnId_key" ON "Venta"("clientTxnId");
  END IF;
END $$;

-- Unique (localId, numero)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'Venta_localId_numero_key'
  ) THEN
    CREATE UNIQUE INDEX "Venta_localId_numero_key" ON "Venta"("localId", "numero");
  END IF;
END $$;

-- Index para búsquedas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'Venta_clientTxnId_idx'
  ) THEN
    CREATE INDEX "Venta_clientTxnId_idx" ON "Venta"("clientTxnId");
  END IF;
END $$;

-- 2) Tabla PosVentaCounter
CREATE TABLE IF NOT EXISTS "PosVentaCounter" (
  "id" SERIAL PRIMARY KEY,
  "grupoId" INTEGER NOT NULL,
  "localId" INTEGER NOT NULL UNIQUE,
  "ultimoNumero" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- FKs (crear solo si no existen)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PosVentaCounter_localId_fkey'
  ) THEN
    ALTER TABLE "PosVentaCounter"
      ADD CONSTRAINT "PosVentaCounter_localId_fkey"
      FOREIGN KEY ("localId") REFERENCES "Local"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'PosVentaCounter_grupoId_fkey'
  ) THEN
    ALTER TABLE "PosVentaCounter"
      ADD CONSTRAINT "PosVentaCounter_grupoId_fkey"
      FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- índices útiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'PosVentaCounter_localId_idx'
  ) THEN
    CREATE INDEX "PosVentaCounter_localId_idx" ON "PosVentaCounter"("localId");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'PosVentaCounter_grupoId_idx'
  ) THEN
    CREATE INDEX "PosVentaCounter_grupoId_idx" ON "PosVentaCounter"("grupoId");
  END IF;
END $$;
