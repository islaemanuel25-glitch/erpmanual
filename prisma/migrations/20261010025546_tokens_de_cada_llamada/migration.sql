-- CUÁNTO ESCRIBIÓ Y CUÁNTO RAZONÓ CADA LLAMADA AL LECTOR.
--
-- El comprobante 22 de Das se cortó tres veces por la espera sin que Google
-- devolviera nada (medido en producción el 2026-10-10). Lo más probable es que
-- Flash razone sin techo; desde esta tanda lleva uno, y estas columnas dicen
-- con datos si alcanza: los tokens de `usageMetadata` de cada llamada.
--
-- Tres columnas nullable, sin datos que mover: ninguna fila se reescribe.

-- AlterTable
ALTER TABLE "LlamadaLector" ADD COLUMN     "tokensRazonamiento" INTEGER,
ADD COLUMN     "tokensSalida" INTEGER,
ADD COLUMN     "tokensTotal" INTEGER;
