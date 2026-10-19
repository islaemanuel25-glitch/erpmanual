-- `Gasto.modalidadSueldo`: qué fue un sueldo —sueldo, adelanto, aguinaldo o
-- vacaciones—.
--
-- ── POR QUÉ ───────────────────────────────────────────────────────────────
--
-- Sueldos pasa a ser una sección propia de Finanzas (regla de Emanuel,
-- 2026-10-19): cada pago se hace eligiendo un empleado del local y diciendo qué
-- fue. Hasta hoy "Pagar" del POS dejaba la modalidad escrita solo en el texto
-- del concepto ("Sueldo · Ana" / "Adelanto · Ana"), que no se puede filtrar ni
-- sumar. Desde ahora es una columna, y `crearGasto` la exige en todo sueldo
-- nuevo, venga del POS o de Finanzas.
--
-- ── QUÉ HACE ──────────────────────────────────────────────────────────────
--
-- 1. Crea el enum y la columna, nula: aditiva, la versión vieja no la lee.
-- 2. RELLENA los sueldos que escribió el POS, por el prefijo exacto que les
--    puso `pagarDesdeElPos` (`${"Sueldo"|"Adelanto"} · ${nombre}`). Solo los de
--    la categoría Sueldos: un gasto de otra categoría no es un sueldo aunque
--    su concepto empiece igual. Los sueldos cargados a mano en Finanzas →
--    Gastos tienen un concepto libre y quedan en null: aparecen como "Sin
--    empleado asignado" y se completan desde la pantalla.
--
-- No toca montos, pagos ni movimientos de caja. Correrla dos veces no cambia
-- nada: solo escribe donde la columna está vacía.

CREATE TYPE "ModalidadSueldo" AS ENUM ('SUELDO', 'ADELANTO', 'AGUINALDO', 'VACACIONES');

ALTER TABLE "Gasto" ADD COLUMN "modalidadSueldo" "ModalidadSueldo";

UPDATE "Gasto" g
SET "modalidadSueldo" = CASE
    WHEN g."concepto" LIKE 'Sueldo · %' THEN 'SUELDO'::"ModalidadSueldo"
    ELSE 'ADELANTO'::"ModalidadSueldo"
  END
FROM "CategoriaGasto" c
WHERE c."id" = g."categoriaId"
  AND c."nombre" = 'Sueldos'
  AND g."modalidadSueldo" IS NULL
  AND (g."concepto" LIKE 'Sueldo · %' OR g."concepto" LIKE 'Adelanto · %');
