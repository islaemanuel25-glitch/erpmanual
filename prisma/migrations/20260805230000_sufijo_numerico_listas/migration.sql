-- FALLBACK POR SUFIJO NUMÉRICO en el macheo de listas de proveedor.
--
-- Aditiva: agrega cinco valores al enum y una columna nullable. No borra, no
-- transforma y no reescribe ninguna fila. Las importaciones ya conciliadas
-- quedan con `sufijoDigitos` en NULL, que es exactamente "no se macheó por
-- sufijo" — cierto para todas ellas, porque el fallback no existía.

-- Los valores nuevos van al final del enum. `ADD VALUE` no reordena ni toca los
-- existentes, así que las filas que ya usan CODIGO_INTERNO siguen igual.
ALTER TYPE "TipoCoincidenciaLista" ADD VALUE IF NOT EXISTS 'SUFIJO_8';
ALTER TYPE "TipoCoincidenciaLista" ADD VALUE IF NOT EXISTS 'SUFIJO_7';
ALTER TYPE "TipoCoincidenciaLista" ADD VALUE IF NOT EXISTS 'SUFIJO_6';
ALTER TYPE "TipoCoincidenciaLista" ADD VALUE IF NOT EXISTS 'SUFIJO_5';
ALTER TYPE "TipoCoincidenciaLista" ADD VALUE IF NOT EXISTS 'SUFIJO_4';

ALTER TABLE "ImportacionListaFila" ADD COLUMN "sufijoDigitos" INTEGER;
