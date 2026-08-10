-- FIXTURE — migración ADITIVA. No se aplica nunca: existe para que
-- scripts/clasificar-migraciones.mjs tenga contra qué salir con 0.
--
-- Copia la forma de las migraciones reales del repo: columnas nullable, un
-- valor de enum agregado con IF NOT EXISTS y un índice nuevo. La versión vieja
-- sigue funcionando con esto aplicado, que es lo que la ventana entre migrar y
-- recrear exige.
--
-- OJO, este comentario es parte de la prueba: menciona DROP COLUMN y TRUNCATE a
-- propósito. Si el clasificador dejara de sacar los comentarios antes de
-- buscar, esta fixture pasaría a dar 1 y el candado se pondría rojo.

ALTER TABLE "ImportacionLista" ADD COLUMN "terminadaEn" TIMESTAMP(3);
ALTER TABLE "ImportacionLista" ADD COLUMN "terminadaPorUsuarioId" INTEGER;

ALTER TYPE "EstadoImportacionLista" ADD VALUE IF NOT EXISTS 'TERMINADA';

CREATE TABLE "FixtureNota" (
    "id" SERIAL NOT NULL,
    "texto" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FixtureNota_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FixtureNota_creadoEn_idx" ON "FixtureNota"("creadoEn");

-- Una columna NOT NULL CON default sí es aditiva: la versión vieja inserta sin
-- mandarla y Postgres la completa.
ALTER TABLE "FixtureNota" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;
