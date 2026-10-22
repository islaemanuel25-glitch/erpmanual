-- CONTROL DE STOCK: el stock del sistema al aceptar cada conteo.
--
-- Solo ADITIVA: una columna nula en `ConteoControlStock`. No borra, no renombra
-- y no reescribe ninguna fila. Las filas ya escritas quedan en null: las
-- reconstruye desde el Libro `reconstruirConteos`
-- (`lib/stock/control/reconstruccionDeConteos.js`), que la escribe al
-- corregirlas. El porqué está en `prisma/schema.prisma`, junto a la columna.

ALTER TABLE "ConteoControlStock" ADD COLUMN "sistemaAlContar" DECIMAL(12,3);
