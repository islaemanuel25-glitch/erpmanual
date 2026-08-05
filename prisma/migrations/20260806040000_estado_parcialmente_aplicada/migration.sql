-- APLICACIÓN POR TANDAS — parte 1: el estado.
--
-- Aplicar una selección cerraba la importación entera aunque quedaran cientos de
-- filas por revisar. El estado nuevo deja la importación ABIERTA mientras haya
-- pendientes: lo que impide re-aplicar una fila es la marca de la propia fila
-- (`aplicada`), no el estado de la cabecera.
--
-- El valor se agrega SOLO acá y no se usa en esta migración: Postgres no permite
-- usar un valor de enum recién creado dentro de la misma transacción, y
-- `migrate deploy` corre cada migración en una.

ALTER TYPE "EstadoImportacionLista" ADD VALUE IF NOT EXISTS 'PARCIALMENTE_APLICADA';
