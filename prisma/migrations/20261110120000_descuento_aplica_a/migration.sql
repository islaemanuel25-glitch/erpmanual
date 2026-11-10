-- A qué productos del mismo papel aplica un renglón de descuento (SL22-5181,
-- 2026-11-10). Una columna nula, sin relleno: los renglones ya guardados quedan
-- en null, que es "se reparte entre todos".
ALTER TABLE "ComprobanteLinea" ADD COLUMN IF NOT EXISTS "descuentoAplicaA" JSONB;
