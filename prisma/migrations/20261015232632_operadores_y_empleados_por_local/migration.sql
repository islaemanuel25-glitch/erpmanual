-- OPERADORES Y EMPLEADOS SON DE UN LOCAL. MIGRACIÓN DE DATOS: autorizarla a
-- sabiendas.
--
-- Regla de Emanuel (2026-10-15): un operador y un empleado son de UN local, el
-- que los contrata. Si alguien trabaja en dos, son dos registros.
--
-- Estructura: OperadorLocal.localId y Empleado.localId, nullable, con FK a
-- Local. La unicidad del nombre pasa de global (solo existía en OperadorLocal)
-- a (localId, nombre) en los dos, y ese índice es el índice por local. No se
-- borra ninguna columna ni tabla: OperadorEnLocal y EmpleadoEnLocal quedan,
-- sin que el código nuevo las lea.
--
-- El freno va PRIMERO, antes de tocar el esquema: si alguno tiene MÁS DE UNA
-- fila en OperadorEnLocal / EmpleadoEnLocal, no se elige; la migración se
-- frena con error, nombrándolos, y no llega a aplicar nada.
--
-- Relleno (entre RELLENO:INICIO y RELLENO:FIN, idempotente: solo escribe donde
-- localId es NULL): el local de cada uno sale de su ÚNICA fila. La condición
-- de "una sola" está también en cada UPDATE: corrido sin el freno, tampoco
-- elige. Uno sin ninguna fila queda con localId NULL y no aparece en ningún
-- local.
--
-- Compatible con el código anterior durante la ventana: ese código no lee las
-- columnas nuevas, y sus búsquedas por nombre no necesitaban el índice global.
-- Un operador o empleado que ese código cree DURANTE la ventana nace sin
-- localId: la PARTE 0 de la reposición —el mismo relleno, con el mismo
-- freno— corrida después del despliegue lo asigna.
--
-- LA REPOSICIÓN, escrita antes de commitear:
-- scripts/deploy/reposicion-operadores-por-local.sql

-- EL FRENO: nadie con más de un local. No se elige uno.
DO $$
DECLARE
  operadores TEXT;
  empleados TEXT;
BEGIN
  SELECT string_agg(o."nombre" || ' (#' || o."id" || ')', ', ' ORDER BY o."id") INTO operadores
  FROM "OperadorLocal" o
  WHERE (SELECT count(*) FROM "OperadorEnLocal" ol WHERE ol."operadorId" = o."id") > 1;

  SELECT string_agg(e."nombre" || ' (#' || e."id" || ')', ', ' ORDER BY e."id") INTO empleados
  FROM "Empleado" e
  WHERE (SELECT count(*) FROM "EmpleadoEnLocal" el WHERE el."empleadoId" = e."id") > 1;

  IF operadores IS NOT NULL OR empleados IS NOT NULL THEN
    RAISE EXCEPTION 'OPERADORES_Y_EMPLEADOS_POR_LOCAL: hay registros con más de un local; no se elige. Operadores: %. Empleados: %.',
      coalesce(operadores, 'ninguno'), coalesce(empleados, 'ninguno');
  END IF;
END $$;

-- AlterTable
ALTER TABLE "OperadorLocal" ADD COLUMN     "localId" INTEGER;

-- AlterTable
ALTER TABLE "Empleado" ADD COLUMN     "localId" INTEGER;

-- AddForeignKey
ALTER TABLE "OperadorLocal" ADD CONSTRAINT "OperadorLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RELLENO:INICIO

-- 1. El local de cada operador, su única fila.
UPDATE "OperadorLocal" o
SET "localId" = ol."localId"
FROM "OperadorEnLocal" ol
WHERE ol."operadorId" = o."id" AND o."localId" IS NULL
  AND (SELECT count(*) FROM "OperadorEnLocal" x WHERE x."operadorId" = o."id") = 1;

-- 2. El de cada empleado, su única fila.
UPDATE "Empleado" e
SET "localId" = el."localId"
FROM "EmpleadoEnLocal" el
WHERE el."empleadoId" = e."id" AND e."localId" IS NULL
  AND (SELECT count(*) FROM "EmpleadoEnLocal" x WHERE x."empleadoId" = e."id") = 1;

-- RELLENO:FIN

-- DropIndex
DROP INDEX "OperadorLocal_nombre_key";

-- CreateIndex
CREATE UNIQUE INDEX "OperadorLocal_localId_nombre_key" ON "OperadorLocal"("localId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_localId_nombre_key" ON "Empleado"("localId", "nombre");
