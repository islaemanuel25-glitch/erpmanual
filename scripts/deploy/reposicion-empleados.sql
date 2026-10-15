-- REPOSICIÓN DE `20261015154425_empleados`. Escrita ANTES de commitear la
-- migración. NO se corre sola: la corre una persona, sabiendo cuál de las dos
-- partes necesita, y dentro de una transacción.
--
-- La migración crea Empleado y EmpleadoEnLocal, agrega empleadoId a
-- ConsumoPersonal y a Gasto, deja ConsumoPersonal.operadorId nullable y RELLENA:
-- un empleado por operador con sus locales, y el empleadoId de consumos,
-- gastos de consumo y sueldos. Ninguna fila existente pierde un dato: el relleno
-- solo escribe en columnas nuevas o en tablas nuevas.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE A — VOLVER AL CÓDIGO ANTERIOR SIN TOCAR EL ESQUEMA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- El código anterior lee ConsumoPersonal.operador como obligatorio. Los
-- consumos registrados DESPUÉS del despliegue por un empleado que no es
-- operador tienen operadorId en null, y ese código se caería al leer Turnos y
-- cierres. Esta parte dice cuántos son y les devuelve el operador cuando el
-- empleado tiene uno (el código nuevo ya lo escribe; esto cubre lo que falte).
-- Los que no tienen operador no se pueden asignar a nadie sin inventar: se
-- listan para decidir con Emanuel antes de volver atrás.

BEGIN;

UPDATE "ConsumoPersonal" c
SET "operadorId" = e."operadorId"
FROM "Empleado" e
WHERE c."empleadoId" = e."id" AND c."operadorId" IS NULL AND e."operadorId" IS NOT NULL;

SELECT c."id" AS consumo, c."localId", c."turnoId", e."nombre" AS empleado, c."totalCosto"
FROM "ConsumoPersonal" c
LEFT JOIN "Empleado" e ON e."id" = c."empleadoId"
WHERE c."operadorId" IS NULL
ORDER BY c."id";

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE B — DESHACER LA MIGRACIÓN ENTERA
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Solo si la PARTE A dejó cero consumos sin operador: volver a NOT NULL con
-- nulos adentro aborta, y esa es la guardia. Se pierde lo que se cargó en
-- Empleados después del despliegue (altas, locales, el vínculo de cada sueldo
-- y consumo con su empleado); los sueldos y consumos en sí quedan.
--
-- BEGIN;
-- ALTER TABLE "ConsumoPersonal" DROP CONSTRAINT "ConsumoPersonal_empleadoId_fkey";
-- ALTER TABLE "Gasto" DROP CONSTRAINT "Gasto_empleadoId_fkey";
-- DROP INDEX "ConsumoPersonal_empleadoId_idx";
-- DROP INDEX "Gasto_empleadoId_idx";
-- ALTER TABLE "ConsumoPersonal" DROP COLUMN "empleadoId";
-- ALTER TABLE "Gasto" DROP COLUMN "empleadoId";
-- ALTER TABLE "ConsumoPersonal" ALTER COLUMN "operadorId" SET NOT NULL;
-- DROP TABLE "EmpleadoEnLocal";
-- DROP TABLE "Empleado";
-- DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261015154425_empleados';
-- COMMIT;
--
-- La última sentencia FALSEA el registro de migraciones a propósito: es lo que
-- hace que la versión anterior vuelva a ver la base como la dejó. Por eso está
-- comentada y por eso es una conversación con Emanuel, no un paso del deploy.
