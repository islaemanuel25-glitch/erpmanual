-- EMPLEADOS. Estructura aditiva y un RELLENO DE DATOS en la misma migración.
--
-- Estructura: las tablas Empleado y EmpleadoEnLocal, la columna empleadoId
-- (nullable) en ConsumoPersonal y en Gasto, y ConsumoPersonal.operadorId pasa
-- a admitir null. No se borra ni se renombra nada.
--
-- Relleno (entre RELLENO:INICIO y RELLENO:FIN, idempotente: correrlo dos veces
-- no duplica ni cambia nada):
--   1. un Empleado por cada OperadorLocal que no tenga uno, con su nombre, su
--      estado y asociado a él;
--   2. los locales de cada uno, los mismos de su operador;
--   3. empleadoId de cada ConsumoPersonal, por su operador;
--   4. empleadoId del gasto de cada consumo, por el consumo;
--   5. empleadoId de los gastos de Sueldos, por el beneficiario: es el nombre
--      del operador que escribió "Pagar → Sueldo", y el operador trabaja en el
--      local del gasto.
--
-- Compatible con el código anterior durante la ventana del despliegue: ese
-- código no lee las tablas nuevas, sigue escribiendo operadorId, y ninguna
-- fila existente pierde su operadorId.
--
-- LA REPOSICIÓN, escrita antes de commitear: scripts/deploy/reposicion-empleados.sql

-- AlterTable
ALTER TABLE "ConsumoPersonal" ADD COLUMN     "empleadoId" INTEGER,
ALTER COLUMN "operadorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Gasto" ADD COLUMN     "empleadoId" INTEGER;

-- CreateTable
CREATE TABLE "Empleado" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "operadorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpleadoEnLocal" (
    "empleadoId" INTEGER NOT NULL,
    "localId" INTEGER NOT NULL,

    CONSTRAINT "EmpleadoEnLocal_pkey" PRIMARY KEY ("empleadoId","localId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empleado_operadorId_key" ON "Empleado"("operadorId");

-- CreateIndex
CREATE INDEX "EmpleadoEnLocal_localId_idx" ON "EmpleadoEnLocal"("localId");

-- CreateIndex
CREATE INDEX "ConsumoPersonal_empleadoId_idx" ON "ConsumoPersonal"("empleadoId");

-- CreateIndex
CREATE INDEX "Gasto_empleadoId_idx" ON "Gasto"("empleadoId");

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empleado" ADD CONSTRAINT "Empleado_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "OperadorLocal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpleadoEnLocal" ADD CONSTRAINT "EmpleadoEnLocal_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpleadoEnLocal" ADD CONSTRAINT "EmpleadoEnLocal_localId_fkey" FOREIGN KEY ("localId") REFERENCES "Local"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoPersonal" ADD CONSTRAINT "ConsumoPersonal_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES "Empleado"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RELLENO:INICIO

-- 1. Un empleado por operador, solo para los que todavía no tienen.
INSERT INTO "Empleado" ("nombre", "activo", "operadorId", "createdAt", "updatedAt")
SELECT o."nombre", o."activo", o."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "OperadorLocal" o
WHERE NOT EXISTS (SELECT 1 FROM "Empleado" e WHERE e."operadorId" = o."id");

-- 2. Sus locales, los de su operador.
INSERT INTO "EmpleadoEnLocal" ("empleadoId", "localId")
SELECT e."id", ol."localId"
FROM "Empleado" e
JOIN "OperadorEnLocal" ol ON ol."operadorId" = e."operadorId"
ON CONFLICT ("empleadoId", "localId") DO NOTHING;

-- 3. El empleado de cada consumo, por su operador.
UPDATE "ConsumoPersonal" c
SET "empleadoId" = e."id"
FROM "Empleado" e
WHERE e."operadorId" = c."operadorId" AND c."empleadoId" IS NULL;

-- 4. El del gasto de cada consumo, por el consumo.
UPDATE "Gasto" g
SET "empleadoId" = c."empleadoId"
FROM "ConsumoPersonal" c
WHERE c."gastoId" = g."id" AND c."empleadoId" IS NOT NULL AND g."empleadoId" IS NULL;

-- 5. El de cada sueldo, por el beneficiario y el local.
UPDATE "Gasto" g
SET "empleadoId" = e."id"
FROM "Empleado" e
JOIN "OperadorLocal" o ON o."id" = e."operadorId"
JOIN "CategoriaGasto" cg ON cg."nombre" = 'Sueldos'
WHERE g."categoriaId" = cg."id"
  AND g."empleadoId" IS NULL
  AND g."beneficiario" = o."nombre"
  AND EXISTS (SELECT 1 FROM "OperadorEnLocal" ol WHERE ol."operadorId" = o."id" AND ol."localId" = g."localId");

-- RELLENO:FIN
