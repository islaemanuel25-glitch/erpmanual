-- E8: apariencia INSTITUCIONAL por local. Aditiva y nullable (sin backfill:
-- ausencia = sin apariencia institucional, cada dispositivo usa su preferencia).

ALTER TABLE "ConfiguracionLocal" ADD COLUMN "aparienciaJson" JSONB;
