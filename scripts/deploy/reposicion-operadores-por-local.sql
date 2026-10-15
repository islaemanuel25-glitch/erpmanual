-- REPOSICIÓN DE `20261015232632_operadores_y_empleados_por_local`. Escrita
-- ANTES de commitear la migración. NO se corre sola: la corre una persona,
-- sabiendo cuál de las partes necesita, y dentro de una transacción.
--
-- La migración agrega OperadorLocal.localId y Empleado.localId (nullable, con
-- FK), los RELLENA desde la única fila de OperadorEnLocal / EmpleadoEnLocal
-- (frena si alguno tiene más de una), y cambia la unicidad del nombre: deja de
-- ser global en OperadorLocal y pasa a ser (localId, nombre) en los dos. No
-- borra nada: OperadorEnLocal y EmpleadoEnLocal quedan como estaban.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 0 — DESPUÉS DEL DESPLIEGUE: LO QUE EL CÓDIGO VIEJO CREÓ EN LA VENTANA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Un operador o empleado creado por el código anterior entre la migración y
-- el arranque del nuevo nace sin localId y no aparece en ningún local. Es el
-- mismo relleno de la migración, con el mismo freno. Idempotente.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "OperadorEnLocal" GROUP BY "operadorId" HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM "EmpleadoEnLocal" GROUP BY "empleadoId" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Hay registros con más de un local: no se elige. Decidirlo con Emanuel.';
  END IF;
END $$;

UPDATE "OperadorLocal" o SET "localId" = ol."localId"
FROM "OperadorEnLocal" ol WHERE ol."operadorId" = o."id" AND o."localId" IS NULL;

UPDATE "Empleado" e SET "localId" = el."localId"
FROM "EmpleadoEnLocal" el WHERE el."empleadoId" = e."id" AND e."localId" IS NULL;

SELECT 'operador' AS tipo, "id", "nombre" FROM "OperadorLocal" WHERE "localId" IS NULL
UNION ALL
SELECT 'empleado', "id", "nombre" FROM "Empleado" WHERE "localId" IS NULL;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE A — VOLVER AL CÓDIGO ANTERIOR SIN TOCAR EL ESQUEMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El código anterior decide el local por OperadorEnLocal / EmpleadoEnLocal, y
-- el nuevo ya no las escribe: lo dado de alta después del despliegue no
-- tendría local para el código viejo. Esto le crea su fila desde localId. No
-- borra ni cambia nada existente.
--
-- Lo que NO arregla: dos operadores con el mismo nombre en dos locales (que el
-- código nuevo permite) siguen siendo dos registros, y el código viejo busca
-- por nombre al dar de alta. Se listan para mirarlos antes de volver atrás.

BEGIN;

INSERT INTO "OperadorEnLocal" ("operadorId", "localId")
SELECT o."id", o."localId" FROM "OperadorLocal" o
WHERE o."localId" IS NOT NULL
ON CONFLICT ("operadorId", "localId") DO NOTHING;

INSERT INTO "EmpleadoEnLocal" ("empleadoId", "localId")
SELECT e."id", e."localId" FROM "Empleado" e
WHERE e."localId" IS NOT NULL
ON CONFLICT ("empleadoId", "localId") DO NOTHING;

SELECT "nombre", count(*) AS cuantos, string_agg("localId"::text, ', ') AS locales
FROM "OperadorLocal" GROUP BY "nombre" HAVING count(*) > 1;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE B — DESHACER LA MIGRACIÓN ENTERA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Solo después de la PARTE A, y solo si su último SELECT dio cero filas:
-- volver a crear el UNIQUE global del nombre con nombres repetidos aborta, y
-- esa es la guardia. Se pierde a qué local pertenece cada uno (queda en
-- OperadorEnLocal / EmpleadoEnLocal por la PARTE A).
--
-- BEGIN;
-- DROP INDEX "OperadorLocal_localId_nombre_key";
-- DROP INDEX "Empleado_localId_nombre_key";
-- ALTER TABLE "OperadorLocal" DROP CONSTRAINT "OperadorLocal_localId_fkey";
-- ALTER TABLE "Empleado" DROP CONSTRAINT "Empleado_localId_fkey";
-- ALTER TABLE "OperadorLocal" DROP COLUMN "localId";
-- ALTER TABLE "Empleado" DROP COLUMN "localId";
-- CREATE UNIQUE INDEX "OperadorLocal_nombre_key" ON "OperadorLocal"("nombre");
-- DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261015232632_operadores_y_empleados_por_local';
-- COMMIT;
--
-- La última sentencia FALSEA el registro de migraciones a propósito: es lo que
-- hace que la versión anterior vuelva a ver la base como la dejó. Por eso está
-- comentada y por eso es una conversación con Emanuel, no un paso del deploy.
