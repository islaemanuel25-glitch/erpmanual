-- EL ACUERDO DE CORTE DE PERÍODO ENTRE UN DEPÓSITO Y UN LOCAL.
--
-- Cada local le paga al depósito por período —normalmente semanal— y dónde corta
-- la semana es un acuerdo entre esos dos, no una constante del sistema. Hasta acá
-- el corte estaba escrito en el código, con el lunes a mano dentro de
-- `SunmiDateRangePicker`.
--
-- ── ES PURAMENTE ADITIVA ────────────────────────────────────────────────
--
-- Una tabla nueva y nada más. No hay DROP, no hay UPDATE, no hay DELETE, no hay
-- INSERT y no hay backfill. Ninguna columna existente se toca.
--
-- Por eso es compatible hacia atrás durante toda la ventana entre migrar y
-- recrear: el código viejo no nombra esta tabla, así que no puede romperse por
-- ella, y no hay ninguna columna nueva en una tabla que el código viejo escriba.
--
-- ── SIN DEFAULT EN `diaDeCorte`, A PROPÓSITO ────────────────────────────
--
-- Una relación SIN fila acá significa "todavía no se configuró". Eso no es lo
-- mismo que "corta domingo": la pantalla cae al domingo para poder mostrar algo y
-- marca la relación como SIN CONFIGURAR, para que quien entre vea cuáles faltan.
-- Un default en la base borraría esa diferencia sin que nadie se entere.
--
-- ── CERO FILAS AL APLICARSE ─────────────────────────────────────────────
--
-- Ninguna relación queda configurada por esta migración. Se configuran desde la
-- pantalla, una por una y con autor. Medido antes de escribirla: en producción
-- hay 1 grupo, 1 depósito y 4 locales, así que son 4 relaciones a configurar.

CREATE TABLE IF NOT EXISTS "AcuerdoDepositoLocal" (
    "id"              SERIAL       NOT NULL,
    "grupoId"         INTEGER      NOT NULL,
    "depositoLocalId" INTEGER      NOT NULL,
    "localId"         INTEGER      NOT NULL,
    "diaDeCorte"      INTEGER      NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcuerdoDepositoLocal_pkey" PRIMARY KEY ("id")
);

-- Un solo acuerdo por par depósito–local. Es lo que impide dos cortes distintos
-- para la misma relación, que dejaría "esta semana" sin respuesta única.
CREATE UNIQUE INDEX IF NOT EXISTS "acuerdo_deposito_local_unique"
    ON "AcuerdoDepositoLocal" ("depositoLocalId", "localId");

CREATE INDEX IF NOT EXISTS "AcuerdoDepositoLocal_grupoId_idx"
    ON "AcuerdoDepositoLocal" ("grupoId");

-- Las tres claves foráneas. `ADD CONSTRAINT` no acepta `IF NOT EXISTS` en
-- PostgreSQL 16, así que van dentro de un bloque que pregunta por `pg_constraint`
-- —el mismo patrón que ya usan las migraciones de recepción de este repo—.
--
-- `ON DELETE CASCADE` en las tres: un acuerdo sin su grupo, sin su depósito o sin
-- su local no significa nada. No es una autoría que haya que conservar —eso sí
-- lleva SET NULL en esta base—, es una configuración de una relación que dejó de
-- existir.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AcuerdoDepositoLocal_grupoId_fkey'
    ) THEN
        ALTER TABLE "AcuerdoDepositoLocal"
            ADD CONSTRAINT "AcuerdoDepositoLocal_grupoId_fkey"
            FOREIGN KEY ("grupoId") REFERENCES "Grupo"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AcuerdoDepositoLocal_depositoLocalId_fkey'
    ) THEN
        ALTER TABLE "AcuerdoDepositoLocal"
            ADD CONSTRAINT "AcuerdoDepositoLocal_depositoLocalId_fkey"
            FOREIGN KEY ("depositoLocalId") REFERENCES "Local"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AcuerdoDepositoLocal_localId_fkey'
    ) THEN
        ALTER TABLE "AcuerdoDepositoLocal"
            ADD CONSTRAINT "AcuerdoDepositoLocal_localId_fkey"
            FOREIGN KEY ("localId") REFERENCES "Local"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
