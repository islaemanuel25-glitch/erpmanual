-- LA LECTURA INTERPRETADA (2026-10-10).
--
-- El modelo interpreta el papel y da el costo final de cada renglón; el código
-- controla la suma contra el total impreso. Aditiva: tres columnas en
-- "ComprobanteLinea" y una en "ComprobanteProveedor", todas nullable. Las
-- lecturas anteriores quedan con NULL y se siguen costeando como antes.

-- AlterTable
ALTER TABLE "ComprobanteLinea" ADD COLUMN     "costoFinalRenglon" DECIMAL(14,2),
ADD COLUMN     "enQueViene" TEXT,
ADD COLUMN     "tipoRenglon" TEXT;

-- AlterTable
ALTER TABLE "ComprobanteProveedor" ADD COLUMN     "explicacionLeida" TEXT;

-- ── LA RECETA ES LA EXPLICACIÓN ─────────────────────────────────────────
--
-- Desde esta migración Flash lee guiado por la EXPLICACIÓN del proveedor, no por
-- los campos estructurados. Lo que esos campos sabían —dónde va el IVA, el
-- impuesto interno, las percepciones del pie, si cobra por bulto— se traduce acá
-- a castellano y se AGREGA a la explicación que haya: lo que escribió una
-- persona no se pisa. La versión NO cambia: es la misma receta, dicha de otra
-- forma. Idempotente: no se vuelve a agregar si ya está.
--
-- Una fila que TIENE explicación y cuyos campos son los de fábrica (IVA 21 al
-- pie, sin interno, sin percepciones, por unidad) no se toca: esos campos los
-- puso el default al guardar la explicación, no una persona, y traducirlos
-- agregaría "el IVA va al pie" a un proveedor que explicó otra cosa.
UPDATE "RecetaProveedor"
SET
  "explicacion" = CASE
      WHEN "explicacion" IS NULL OR btrim("explicacion") = '' THEN ''
      ELSE btrim("explicacion") || E'\n\n'
    END
    || 'Cómo se costea este papel (traducido de la receta que estaba cargada): '
    || CASE
         WHEN "alicuotaIvaPct" = 0 THEN 'el precio impreso ya trae el IVA, no se le suma nada'
         WHEN "ivaPorLinea" THEN 'cada renglón trae su IVA, el '
           || replace(rtrim(rtrim("alicuotaIvaPct"::text, '0'), '.'), '.', ',')
           || ' % salvo que el renglón imprima otra alícuota'
         ELSE 'los renglones van sin IVA y el IVA del '
           || replace(rtrim(rtrim("alicuotaIvaPct"::text, '0'), '.'), '.', ',')
           || ' % va al pie, repartido entre los renglones según su importe'
       END
    || CASE
         WHEN "tieneImpuestoInterno" THEN
           '; trae impuesto interno por renglón, que se suma al costo de ese renglón'
           || CASE WHEN "ivaIncluyeInternoEnLaBase" THEN ' y lleva IVA' ELSE ' sin IVA encima' END
         ELSE ''
       END
    || COALESCE((
         SELECT '; al pie trae '
           || string_agg(
                (p->>'nombre') || ' (' || replace(p->>'pct', '.', ',') || ' %'
                || CASE WHEN p ? 'alicuotaPct' AND (p->>'alicuotaPct') IS NOT NULL
                     THEN ' sobre el neto del ' || replace(p->>'alicuotaPct', '.', ',') || ' %'
                     ELSE ' sobre el neto' END
                || ')', ', ')
           || ', que se reparten entre los renglones en proporción a su importe'
         FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof("percepciones"::jsonb) = 'array' THEN "percepciones"::jsonb ELSE '[]'::jsonb END
         ) AS p
         WHERE (p->>'pct') IS NOT NULL AND (p->>'nombre') IS NOT NULL
       ), '')
    || CASE WHEN "facturaPor" = 'BULTO' THEN '; la cantidad cuenta bultos' ELSE '' END
    || '. Las bonificaciones de cada renglón ya están en su importe.',
  "explicacionActualizadaEn" = NOW()
WHERE COALESCE("explicacion", '') NOT LIKE '%traducido de la receta que estaba cargada%'
  AND NOT (
    btrim(COALESCE("explicacion", '')) <> ''
    AND "alicuotaIvaPct" = 21
    AND NOT "ivaPorLinea"
    AND NOT "tieneImpuestoInterno"
    AND "facturaPor" = 'UNIDAD'
    AND (
      "percepciones" IS NULL
      OR jsonb_typeof("percepciones"::jsonb) <> 'array'
      OR jsonb_array_length("percepciones"::jsonb) = 0
    )
  );
