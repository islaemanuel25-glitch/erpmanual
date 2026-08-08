-- ASIENTA EL RANGO DE AUMENTO ESPERADO en las importaciones que nacieron sin él.
--
-- ── QUÉ ES ESTO Y POR QUÉ NO ES INVENTAR UN DATO ────────────────────────────
--
-- Hasta ahora `importar` no escribía el rango: las importaciones nacían con las
-- dos columnas nulas y `rangoDeLaFila` caía al default del sistema, que son
-- exactamente 10 y 20. O sea que TODAS estas importaciones se evaluaron con
-- 10 a 20 %. Lo que falta no es el criterio: es el registro del criterio.
--
-- Escribir 10 y 20 acá no es suponer nada. Es asentar el número con el que se
-- evaluaron, para que el día que el default del sistema cambie no reescriba en
-- silencio con qué criterio se decidieron estas listas. Es la misma razón por la
-- que el rango se congela en la fila al confirmar.
--
-- ── POR QUÉ TAMBIÉN LAS QUE TIENEN LA MITAD ─────────────────────────────────
--
-- `rangoDeLaFila` exige los dos valores o ninguno: con un mínimo y sin máximo
-- ignora los dos y cae al default. Así que una cabecera a medias también se
-- evaluó con 10 a 20, y escribirle el par completo asienta lo que pasó de verdad
-- en vez de dejar un número suelto que nunca se usó.
--
-- ── POR QUÉ ES UNA MIGRACIÓN Y NO UN SCRIPT ─────────────────────────────────
--
-- Porque corre en producción, donde están las tres importaciones reales. Un paso
-- de datos que tiene que correr en el VPS no es un script: las migraciones ya
-- tienen su lugar en el despliegue, quedan registradas y se aplican una sola vez.
--
-- Idempotente por el WHERE: una segunda corrida no encuentra filas.
-- No toca ninguna fila de `ImportacionListaFila`: el rango congelado de una fila
-- confirmada es una decisión de una persona y no se pisa desde acá.

UPDATE "ImportacionListaProveedor"
SET "aumentoEsperadoMinPct" = 10,
    "aumentoEsperadoMaxPct" = 20
WHERE "aumentoEsperadoMinPct" IS NULL
   OR "aumentoEsperadoMaxPct" IS NULL;
