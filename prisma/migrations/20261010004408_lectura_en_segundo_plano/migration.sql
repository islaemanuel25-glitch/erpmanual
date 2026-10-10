-- LA LECTURA EN CURSO PASA A LA BASE, Y CADA LLAMADA AL LECTOR GUARDA CUÁNTO TARDÓ.
--
-- `lecturaEnCursoDesde` y `ultimaLectura`: hasta acá la lectura en curso vivía
-- solo en la memoria del proceso. Un reinicio la perdía, dos «Leer» seguidos
-- lanzaban dos lecturas pagas, y volver a la pantalla no sabía que se estaba
-- leyendo. Ahora se toma con un UPDATE que solo pasa si nadie la tiene, y el
-- resultado queda guardado para la pantalla que pregunte.
--
-- `LlamadaLector.duracionMs`: para elegir las esperas de Flash y del modelo
-- grande con datos de producción y no suponiéndolas.
--
-- Tres columnas nullable, sin datos que mover: ninguna fila se reescribe.

-- AlterTable
ALTER TABLE "ComprobanteProveedor" ADD COLUMN     "lecturaEnCursoDesde" TIMESTAMP(3),
ADD COLUMN     "ultimaLectura" JSONB;

-- AlterTable
ALTER TABLE "LlamadaLector" ADD COLUMN     "duracionMs" INTEGER;
