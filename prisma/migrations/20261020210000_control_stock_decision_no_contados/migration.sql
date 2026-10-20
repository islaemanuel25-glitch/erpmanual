-- CONTROL DE STOCK: qué se eligió al terminar con lo que nadie contó.
--
-- Solo ADITIVA: dos columnas nulas en `ControlStock`. No borra, no renombra y
-- no reescribe ninguna fila. Los controles ya terminados quedan en null, que se
-- lee como "se pusieron en 0", que es lo único que se podía hacer entonces. El
-- porqué está en `prisma/schema.prisma`, junto a las columnas.

ALTER TABLE "ControlStock" ADD COLUMN "noContadosDecision" TEXT;
ALTER TABLE "ControlStock" ADD COLUMN "noContadosComoEstaban" INTEGER;
