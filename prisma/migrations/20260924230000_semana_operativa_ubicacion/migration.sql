-- LA SEMANA OPERATIVA DE CADA UBICACIÓN, con su historia de vigencias.
--
-- ADITIVA. Una tabla nueva, un enum nuevo, sus índices, un CHECK y un backfill.
-- No borra ni modifica ninguna fila existente: `AcuerdoDepositoLocal` queda como
-- estaba, congelado. Desde esta migración nadie la lee ni la escribe en runtime.
--
-- ── LO QUE LA BASE GARANTIZA ────────────────────────────────────────────
--
--   · el día de corte está entre 0 (domingo) y 6 (sábado): un CHECK, porque un
--     camino que se saltee `programarSemanaOperativa` no puede dejar un corte que
--     ninguna función sabe interpretar;
--   · una ubicación no tiene dos vigencias que empiecen el mismo día: el único
--     (localId, vigenteDesde) que genera Prisma;
--   · y a lo sumo UNA "desde siempre" (vigenteDesde NULL) por ubicación. El
--     único de arriba no lo impide, porque en PostgreSQL dos NULL no son iguales;
--     por eso va además un índice único parcial, escrito a mano. Prisma no lo ve
--     y el control de deriva tampoco: vive solo acá.
--
-- ── EL BACKFILL, SIN INVENTAR NADA ──────────────────────────────────────
--
-- Sale de `AcuerdoDepositoLocal.diaDeCorte`, y lee exactamente lo que el runtime
-- leía hasta hoy: los acuerdos del local EN SU GRUPO ACTUAL (el tablero los
-- filtraba por grupo). Un acuerdo de un grupo al que el local ya no pertenece es
-- historia vieja y no decide nada; lo informa el diagnóstico.
--
--   · todos los acuerdos del local dicen el mismo día → ese día, desde siempre;
--   · dicen días distintos → NO se elige uno: el local queda SIN CONFIGURAR y el
--     diagnóstico lo nombra. La migración no falla por eso;
--   · el local no tiene acuerdo → SIN CONFIGURAR;
--   · el depósito → SIN CONFIGURAR siempre. Su semana no se deduce de la de sus
--     locales.
--
-- `origen = MIGRACION` y `creadoPorId` NULL dicen, fila por fila, que la escribió
-- esta migración y no una persona.
--
-- El bloque entre las marcas BACKFILL:INICIO y BACKFILL:FIN lo ejecuta tal cual
-- `scripts/pruebas-db/semanaOperativa.mjs` sobre los cinco casos. Si se cambia
-- acá, el candado prueba el cambio.

-- CreateEnum
CREATE TYPE "OrigenSemanaOperativa" AS ENUM ('MIGRACION', 'MANUAL');

-- CreateTable
CREATE TABLE "SemanaOperativaVigencia" (
    "id" SERIAL NOT NULL,
    "localId" INTEGER NOT NULL,
    "diaDeCorte" INTEGER NOT NULL,
    "vigenteDesde" DATE,
    "origen" "OrigenSemanaOperativa" NOT NULL,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemanaOperativaVigencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SemanaOperativaVigencia_localId_vigenteDesde_key" ON "SemanaOperativaVigencia"("localId", "vigenteDesde");

-- AddForeignKey
ALTER TABLE "SemanaOperativaVigencia" ADD CONSTRAINT "SemanaOperativaVigencia_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Escritos a mano: Prisma no sabe expresarlos.
ALTER TABLE "SemanaOperativaVigencia" ADD CONSTRAINT "SemanaOperativaVigencia_dia_valido" CHECK ("diaDeCorte" BETWEEN 0 AND 6);

CREATE UNIQUE INDEX "SemanaOperativaVigencia_desde_siempre_key" ON "SemanaOperativaVigencia" ("localId") WHERE "vigenteDesde" IS NULL;

-- BACKFILL:INICIO
INSERT INTO "SemanaOperativaVigencia" ("localId", "diaDeCorte", "vigenteDesde", "origen", "creadoPorId")
SELECT a."localId", MIN(a."diaDeCorte"), NULL, 'MIGRACION'::"OrigenSemanaOperativa", NULL
FROM "AcuerdoDepositoLocal" a
JOIN "GrupoLocal" gl ON gl."localId" = a."localId" AND gl."grupoId" = a."grupoId"
JOIN "Local" l ON l."id" = a."localId"
WHERE l."es_deposito" = false
  AND NOT EXISTS (SELECT 1 FROM "GrupoDeposito" gd WHERE gd."localId" = a."localId")
  AND NOT EXISTS (SELECT 1 FROM "SemanaOperativaVigencia" v WHERE v."localId" = a."localId")
GROUP BY a."localId"
HAVING COUNT(DISTINCT a."diaDeCorte") = 1 AND MIN(a."diaDeCorte") BETWEEN 0 AND 6;
-- BACKFILL:FIN
