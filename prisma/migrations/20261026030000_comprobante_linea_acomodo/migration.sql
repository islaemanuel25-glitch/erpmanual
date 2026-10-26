-- ADITIVA: una columna nula. No toca ninguna fila.
--
-- Mauro #298 (2026-10-26): el papel se leyó corrido una fila y el sistema lo
-- acomoda con el pedido. Esta columna guarda, en cada fila acomodada, qué
-- tenía antes: el texto y los números que había leído el lector. Las filas de
-- antes quedan en null, que es "nadie la acomodó".

-- AlterTable
ALTER TABLE "ComprobanteLinea" ADD COLUMN     "acomodo" JSONB;
