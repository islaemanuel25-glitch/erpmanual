-- En qué hoja dice estar el papel («Hoja 1», «1 de 3»), como lo imprime
-- (Mauro #590, 2026-11-11). Una columna nula, sin relleno.
ALTER TABLE "ComprobanteProveedor" ADD COLUMN IF NOT EXISTS "hojaImpresa" TEXT;
