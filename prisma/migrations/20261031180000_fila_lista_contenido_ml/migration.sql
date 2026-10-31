-- EL TAMAÑO DE LA PRESENTACIÓN DE CADA RENGLÓN DE UNA LISTA, EN ML.
--
-- La lista de vinos de Carozo trae dos "CANCILLER BLEND TINTO" que solo se
-- distinguen por la presentación (6X750 y 6X1125). La fila guardaba la cantidad
-- (6) y tiraba el contenido (750), así que "Pueden ser de…" no tenía con qué
-- distinguirlos. Se guarda para comparar nombres y nada más: no entra en ningún
-- costo.
--
-- ADITIVA: una columna nulable que el código viejo no conoce ni lee. Las filas
-- que ya existen quedan en null —el archivo no se guarda, no hay de dónde
-- rellenarla— y se comparan como antes, por el nombre solo.

ALTER TABLE "ImportacionListaFila" ADD COLUMN "contenidoMl" INTEGER;
