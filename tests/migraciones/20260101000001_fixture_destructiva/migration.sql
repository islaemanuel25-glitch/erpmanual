-- FIXTURE — migración NO ADITIVA. No se aplica nunca: existe para que
-- scripts/clasificar-migraciones.mjs tenga cómo ponerse rojo si alguien lo
-- rompe más adelante.
--
-- Cada sentencia de acá abajo rompe a la versión que sigue atendiendo tráfico
-- durante la ventana entre migrar y recrear. Están tomadas de migraciones
-- reales del repo: el DROP COLUMN sobre Proveedor y el de AuditoriaBitacora
-- existieron y se desplegaron por el flujo normal.

ALTER TABLE "Proveedor" DROP COLUMN "diaPedidos";

ALTER TABLE "AuditoriaBitacora" DROP COLUMN "metodo";

DROP INDEX IF EXISTS "importacion_archivo_unica";

ALTER TABLE "FixtureNota" ALTER COLUMN "texto" SET NOT NULL;

ALTER TABLE "FixtureNota" ALTER COLUMN "texto" TYPE VARCHAR(50);

ALTER TABLE "FixtureNota" RENAME COLUMN "texto" TO "detalle";

-- Un ADD COLUMN NOT NULL sin DEFAULT: la versión vieja inserta sin ese campo y
-- el INSERT pasa a fallar. Partido en dos líneas a propósito, para ejercer que
-- el patrón se prueba contra el archivo entero y no línea por línea.
ALTER TABLE "FixtureNota"
    ADD COLUMN "obligatorio" TEXT NOT NULL;

UPDATE "FixtureNota" SET "activo" = false WHERE "detalle" IS NULL;

DELETE FROM "FixtureNota" WHERE "id" < 0;
