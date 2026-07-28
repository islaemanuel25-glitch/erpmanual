-- Código de barras PROPIO por ubicación en ProductoLocal.
-- Aditivo y compatible: columna nullable, sin backfill. Los productos existentes
-- quedan con codigo_barra_propio = NULL; los dos códigos globales de ProductoBase
-- (codigo_barra, codigo_barra_secundario) NO se tocan.
ALTER TABLE "ProductoLocal" ADD COLUMN "codigo_barra_propio" TEXT;

-- Unicidad del código propio POR LOCAL. En PostgreSQL los NULL son distintos entre
-- sí en un índice único, por lo que múltiples productos SIN código propio conviven
-- sin colisionar. El mismo código propio puede repetirse en locales distintos.
CREATE UNIQUE INDEX "ProductoLocal_localId_codigo_barra_propio_key"
  ON "ProductoLocal"("localId", "codigo_barra_propio");
