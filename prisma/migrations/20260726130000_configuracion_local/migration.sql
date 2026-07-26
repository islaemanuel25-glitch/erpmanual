-- E5: Configuración POR LOCAL (fase 1, aditiva y compatible).
-- Crea ConfiguracionLocal y hace BACKFILL del valor EFECTIVO actual del grupo
-- para cada local, de modo que el comportamiento post-migración sea IDÉNTICO.
-- Los campos de ConfiguracionGrupo NO se eliminan en fase 1 (rollback seguro).

CREATE TABLE "ConfiguracionLocal" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "allowNegativeStock" BOOLEAN,
    "exigirClienteVenta" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConfiguracionLocal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfiguracionLocal_localId_key" ON "ConfiguracionLocal"("localId");
CREATE INDEX "ConfiguracionLocal_localId_idx" ON "ConfiguracionLocal"("localId");

ALTER TABLE "ConfiguracionLocal"
  ADD CONSTRAINT "ConfiguracionLocal_localId_fkey"
  FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: una fila por local, copiando el valor efectivo del grupo al que
-- pertenece (por GrupoLocal si es local, o GrupoDeposito si es depósito).
-- exigirClienteVenta mapea al flag correcto del grupo según es_deposito.
INSERT INTO "ConfiguracionLocal" ("localId", "allowNegativeStock", "exigirClienteVenta", "createdAt", "updatedAt")
SELECT l."id",
       cg."allowNegativeStock",
       CASE WHEN l."es_deposito" THEN cg."exigirClienteVentasDeposito"
            ELSE cg."exigirClienteVentasLocal" END,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Local" l
JOIN LATERAL (
  SELECT COALESCE(
    (SELECT gl."grupoId" FROM "GrupoLocal" gl WHERE gl."localId" = l."id" LIMIT 1),
    (SELECT gd."grupoId" FROM "GrupoDeposito" gd WHERE gd."localId" = l."id" LIMIT 1)
  ) AS "grupoId"
) g ON TRUE
JOIN "ConfiguracionGrupo" cg ON cg."grupoId" = g."grupoId"
ON CONFLICT ("localId") DO NOTHING;
