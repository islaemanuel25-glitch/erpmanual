-- CANCELAR UNA IMPORTACIÓN — parte 1: el estado y las columnas.
--
-- El valor del enum se agrega SOLO en esta migración y no se usa acá. Postgres
-- no permite usar un valor de enum recién creado dentro de la misma transacción,
-- y `migrate deploy` corre cada migración en una: el índice parcial que filtra
-- por 'CANCELADA' vive en la migración siguiente, que ya lo ve confirmado.
--
-- Aditiva: no borra ni transforma ninguna fila.

ALTER TYPE "EstadoImportacionLista" ADD VALUE IF NOT EXISTS 'CANCELADA';

ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "canceladaEn" TIMESTAMP(3);
ALTER TABLE "ImportacionListaProveedor" ADD COLUMN "canceladaPorUsuarioId" INTEGER;
