-- 1) Agregar columna localId (nullable temporal)
ALTER TABLE "Cliente" ADD COLUMN "localId" INTEGER;

-- 2) Backfill por grupo usando un local del grupo
UPDATE "Cliente" c
SET "localId" = gl."localId"
FROM (
  SELECT "grupoId", MIN("localId") AS "localId"
  FROM "GrupoLocal"
  GROUP BY "grupoId"
) gl
WHERE c."grupoId" = gl."grupoId"
  AND c."localId" IS NULL;

-- 3) Fallback: si no hubo local en GrupoLocal, usar depósito del grupo
UPDATE "Cliente" c
SET "localId" = gd."localId"
FROM (
  SELECT "grupoId", MIN("localId") AS "localId"
  FROM "GrupoDeposito"
  GROUP BY "grupoId"
) gd
WHERE c."grupoId" = gd."grupoId"
  AND c."localId" IS NULL;

-- 4) Si queda null y solo existe un local en todo el sistema, usarlo como default
UPDATE "Cliente"
SET "localId" = (
  SELECT id
  FROM "Local"
  ORDER BY id
  LIMIT 1
)
WHERE "localId" IS NULL
  AND (SELECT COUNT(*) FROM "Local") = 1;

-- 5) FK + índices (localId se mantiene nullable temporalmente)
ALTER TABLE "Cliente"
ADD CONSTRAINT "Cliente_localId_fkey"
FOREIGN KEY ("localId") REFERENCES "Local"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "Cliente_localId_idx" ON "Cliente"("localId");
CREATE INDEX "Cliente_grupoId_localId_idx" ON "Cliente"("grupoId", "localId");
