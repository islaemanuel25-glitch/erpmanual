-- DEPÓSITO: cuándo se decidió cada línea de un pedido.
--
-- Solo ADITIVA: una columna nula en `PosTransferenciaDetalle`. No borra, no
-- renombra y no reescribe ninguna fila. Las líneas ya escritas quedan en null,
-- que es "nadie la decidió": se siguen leyendo como hasta hoy (una línea con
-- algo preparado cuenta como preparada). El porqué está en
-- `prisma/schema.prisma`, junto a la columna.

ALTER TABLE "PosTransferenciaDetalle" ADD COLUMN "revisadoEn" TIMESTAMP(3);
