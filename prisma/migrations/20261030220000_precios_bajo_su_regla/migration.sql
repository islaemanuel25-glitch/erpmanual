-- PRECIOS POR DEBAJO DE SU PROPIA REGLA O A PÉRDIDA: SE SUBEN A LO QUE DA SU REGLA.
--
-- Corrección pedida por Emanuel el 2026-10-30 sobre la medición del mismo día
-- (/home/emanuel/mediciones/precios-por-ubicacion-20261030.csv). Generada por
-- scripts/correcciones/generarCorreccionPrecios20261030.mjs con la regla de
-- scripts/correcciones/preciosBajoSuRegla.mjs: el precio sale de
-- precioDesdeMargen / precioDesdeRecargoUnidad, con el redondeo de la ficha.
--
--   · Margen > 0 → su margen; monto fijo → costo + su monto; margen ≤ 0 o sin
--     regla → 30 %, y se guarda margen 30. En las demás no se toca el margen.
--   · Nunca baja un precio. No entran: las filas de escala, las de más del
--     doble, las promos y las de margen positivo a pérdida (van en una lista).
--
-- ── SEGURIDAD ─────────────────────────────────────────────────────────────
--
-- Cada UPDATE exige el precio, el costo y el margen que la fila tenía al
-- generarse: si alguien los cambió, esa fila no se toca.
--
-- ── RESPALDO Y VUELTA ATRÁS ───────────────────────────────────────────────
--
-- Antes de cambiar nada se copian todas las filas activas a
-- respaldo.backup_precios_ubicacion_20261030 —en un esquema aparte, para que
-- Prisma no la tome por una tabla suya—. Para volver una fila:
--
--   UPDATE "ProductoLocal" pl SET "precio_venta" = r."precio_venta", "margen" = r."margen"
--     FROM respaldo.backup_precios_ubicacion_20261030 r WHERE r."id" = pl."id" AND pl."id" = <id>;
--
-- y en el depósito, lo mismo sobre "ProductoBase" con base_precio_venta y base_margen.
--
-- Filas que suben: 768.

CREATE SCHEMA IF NOT EXISTS respaldo;

CREATE TABLE respaldo.backup_precios_ubicacion_20261030 AS
SELECT pl."id", pl."localId", pl."baseId", pl."precio_costo", pl."precio_venta", pl."margen",
       pl."reglaPrecio", pl."recargoFijoUnidad",
       b."precio_venta" AS base_precio_venta, b."margen" AS base_margen,
       CURRENT_TIMESTAMP AS respaldado_en
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
 WHERE pl."activo";

-- depo · AMSTEL LAGER 473 · $35.400: $46.100 → $46.200
UPDATE "ProductoLocal" SET "precio_venta" = 46200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13982 AND "precio_venta" IS NOT DISTINCT FROM 46100 AND "precio_costo" IS NOT DISTINCT FROM 35400 AND "margen" IS NOT DISTINCT FROM 30.23;
UPDATE "ProductoBase" SET "precio_venta" = 46200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2609 AND "precio_venta" = 46100 AND "precio_costo" = 35400;

-- depo · Camel 10 · $40.380: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6497 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40380 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · CERVEZA IGUANA 1L · $25.500: $33.200 → $33.300
UPDATE "ProductoLocal" SET "precio_venta" = 33300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 977 AND "precio_venta" IS NOT DISTINCT FROM 33200 AND "precio_costo" IS NOT DISTINCT FROM 25500 AND "margen" IS NOT DISTINCT FROM 30.2;
UPDATE "ProductoBase" SET "precio_venta" = 33300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 977 AND "precio_venta" = 33200 AND "precio_costo" = 25500;

-- depo · Chester 10 · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6078 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · Chester 10 mentolado · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6076 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · EXQUISITA FLAN DDL · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9224 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;
UPDATE "ProductoBase" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2444 AND "precio_venta" = 18800 AND "precio_costo" = 14400;

-- depo · EXQUISITA FLAN VAINILLA · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9221 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;
UPDATE "ProductoBase" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2443 AND "precio_venta" = 18800 AND "precio_costo" = 14400;

-- depo · Hamlet leche y cookies · $16.800: $23.600 → $23.700
UPDATE "ProductoLocal" SET "precio_venta" = 23700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 703 AND "precio_venta" IS NOT DISTINCT FROM 23600 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM 40.48;
UPDATE "ProductoBase" SET "precio_venta" = 23700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 703 AND "precio_venta" = 23600 AND "precio_costo" = 16800;

-- depo · HUEVO KINDER NENA · $26.600: $37.300 → $37.400
UPDATE "ProductoLocal" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1167 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 26600 AND "margen" IS NOT DISTINCT FROM 40.23;
UPDATE "ProductoBase" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1167 AND "precio_venta" = 37300 AND "precio_costo" = 26600;

-- depo · HUEVO KINDER NENE · $26.600: $37.300 → $37.400
UPDATE "ProductoLocal" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1166 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 26600 AND "margen" IS NOT DISTINCT FROM 40.23;
UPDATE "ProductoBase" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1166 AND "precio_venta" = 37300 AND "precio_costo" = 26600;

-- depo · JABON REXONA X3 COTTON FRESH · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 495 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 495 AND "precio_venta" = 2900 AND "precio_costo" = 3261.01;

-- depo · JABON REXONA X3 FUTBOL FANATICS · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1194 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1194 AND "precio_venta" = 2900 AND "precio_costo" = 3261.01;

-- depo · JABON REXONA X3 NUTRITIVE ORCHID · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 999 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 999 AND "precio_venta" = 2900 AND "precio_costo" = 3261.01;

-- depo · LAYS JAMON SERRANO 77g · $2.642,86: $2.500 → $3.500
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 344 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2642.86 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 344 AND "precio_venta" = 2500 AND "precio_costo" = 2642.86;

-- depo · LIMZUL 3L · $6.600: $6.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1958 AND "precio_venta" IS NOT DISTINCT FROM 6500 AND "precio_costo" IS NOT DISTINCT FROM 6600 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 8600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1958 AND "precio_venta" = 6500 AND "precio_costo" = 6600;

-- depo · Lucky 10 · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6164 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · Lucky 10 mentolado · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6163 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · LUX X3 LIRIO AZUL · $3.407,33: $3.000 → $4.500
UPDATE "ProductoLocal" SET "precio_venta" = 4500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 336 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 3407.33 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 336 AND "precio_venta" = 3000 AND "precio_costo" = 3407.33;

-- depo · Marlboro 10 · $40.272: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6355 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40272 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · Marlboro 10 Uva · $39.840: $41.000 → $42.000
UPDATE "ProductoLocal" SET "precio_venta" = 42000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6165 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 39840 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · Marlboro 20 Crafted suave · $40.260: $40.260 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6146 AND "precio_venta" IS NOT DISTINCT FROM 40260 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 0;
UPDATE "ProductoBase" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2065 AND "precio_venta" = 40260 AND "precio_costo" = 40260;

-- depo · Philips 10 · $36.103: $37.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6079 AND "precio_venta" IS NOT DISTINCT FROM 37000 AND "precio_costo" IS NOT DISTINCT FROM 36103 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · Philips 10 mentolado · $36.578: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6081 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36578 AND "margen" IS NOT DISTINCT FROM 30;

-- depo · REXONA CLINICAL CLASSIC CREMA VIOLETA · $11.144,04: $10.400 → $14.500
UPDATE "ProductoLocal" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1902 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 11144.04 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1902 AND "precio_venta" = 10400 AND "precio_costo" = 11144.04;

-- depo · REXONA CLINICAL CLASSIC CREMA ROSA · $11.144,04: $10.400 → $14.500
UPDATE "ProductoLocal" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1901 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 11144.04 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1901 AND "precio_venta" = 10400 AND "precio_costo" = 11144.04;

-- depo · REXONA x1 ANTIBACTERIAL · $1.298,57: $900 → $1.700
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1707 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 1298.57 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1707 AND "precio_venta" = 900 AND "precio_costo" = 1298.57;

-- depo · REXONA X3 BAMBOO · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 494 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 494 AND "precio_venta" = 2900 AND "precio_costo" = 3261.01;

-- depo · REXONA X3 SENSIBLE · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 496 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 496 AND "precio_venta" = 2900 AND "precio_costo" = 3261.01;

-- depo · SCHNEIDER LIMON 473 · $47.400: $61.700 → $61.800
UPDATE "ProductoLocal" SET "precio_venta" = 61800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9101 AND "precio_venta" IS NOT DISTINCT FROM 61700 AND "precio_costo" IS NOT DISTINCT FROM 47400 AND "margen" IS NOT DISTINCT FROM 30.17;
UPDATE "ProductoBase" SET "precio_venta" = 61800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2403 AND "precio_venta" = 61700 AND "precio_costo" = 47400;

-- depo · STELLA 710ML · $58.884: $76.600 → $76.700
UPDATE "ProductoLocal" SET "precio_venta" = 76700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 536 AND "precio_venta" IS NOT DISTINCT FROM 76600 AND "precio_costo" IS NOT DISTINCT FROM 58884 AND "margen" IS NOT DISTINCT FROM 30.09;
UPDATE "ProductoBase" SET "precio_venta" = 76700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 536 AND "precio_venta" = 76600 AND "precio_costo" = 58884;

-- depo · TERRABUSI CHOCOLATE · $53.640: $69.800 → $69.900
UPDATE "ProductoLocal" SET "precio_venta" = 69900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6738 AND "precio_venta" IS NOT DISTINCT FROM 69800 AND "precio_costo" IS NOT DISTINCT FROM 53640 AND "margen" IS NOT DISTINCT FROM 30.13;
UPDATE "ProductoBase" SET "precio_venta" = 69900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2305 AND "precio_venta" = 69800 AND "precio_costo" = 53640;

-- depo · TITA X19GR · $28.250: $36.800 → $36.900
UPDATE "ProductoLocal" SET "precio_venta" = 36900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13992 AND "precio_venta" IS NOT DISTINCT FROM 36800 AND "precio_costo" IS NOT DISTINCT FROM 28250 AND "margen" IS NOT DISTINCT FROM 30.27;
UPDATE "ProductoBase" SET "precio_venta" = 36900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2611 AND "precio_venta" = 36800 AND "precio_costo" = 28250;

-- mini el 7 · 9 DE ORO AZUCARADAS · $26.880: $34.900 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2007 AND "precio_venta" IS NOT DISTINCT FROM 34900 AND "precio_costo" IS NOT DISTINCT FROM 26880 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ACEITE COSTA DEL SOL 900ML · $38.850: $50.500 → $50.600
UPDATE "ProductoLocal" SET "precio_venta" = 50600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3482 AND "precio_venta" IS NOT DISTINCT FROM 50500 AND "precio_costo" IS NOT DISTINCT FROM 38850 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Aceituna rellena con morron · $10.530: $10.500 → $13.700
UPDATE "ProductoLocal" SET "precio_venta" = 13700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8979 AND "precio_venta" IS NOT DISTINCT FROM 10500 AND "precio_costo" IS NOT DISTINCT FROM 10530 AND "margen" IS NOT DISTINCT FROM 0;

-- mini el 7 · ALA JABON EN PAN 200GR · $63.137,28: $73.300 → $82.100
UPDATE "ProductoLocal" SET "precio_venta" = 82100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2017 AND "precio_venta" IS NOT DISTINCT FROM 73300 AND "precio_costo" IS NOT DISTINCT FROM 63137.28 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ALA LIQUIDO 800ML LAVADO A MANO · $29.340: $38.100 → $38.200
UPDATE "ProductoLocal" SET "precio_venta" = 38200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2019 AND "precio_venta" IS NOT DISTINCT FROM 38100 AND "precio_costo" IS NOT DISTINCT FROM 29340 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ALA LIQUIDO MATIC 800ML · $32.203,20: $38.100 → $41.900
UPDATE "ProductoLocal" SET "precio_venta" = 41900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2020 AND "precio_venta" IS NOT DISTINCT FROM 38100 AND "precio_costo" IS NOT DISTINCT FROM 32203.2 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ALF AGUILA DARK · $1.442,22: $1.800 → $1.900
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6535 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1442.22 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · ALFAJOR FULBITO · $9.100: $11.800 → $11.900
UPDATE "ProductoLocal" SET "precio_venta" = 11900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6512 AND "precio_venta" IS NOT DISTINCT FROM 11800 AND "precio_costo" IS NOT DISTINCT FROM 9100 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · ALICANTE OREGANO 25G · $12.700: $16.500 → $16.600
UPDATE "ProductoLocal" SET "precio_venta" = 16600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2699 AND "precio_venta" IS NOT DISTINCT FROM 16500 AND "precio_costo" IS NOT DISTINCT FROM 12700 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · AMANDA YERBA 500G · $15.650: $20.300 → $20.400
UPDATE "ProductoLocal" SET "precio_venta" = 20400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2668 AND "precio_venta" IS NOT DISTINCT FROM 20300 AND "precio_costo" IS NOT DISTINCT FROM 15650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · AMSTEL LAGER 473 · $35.400: $46.100 → $46.200
UPDATE "ProductoLocal" SET "precio_venta" = 46200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13983 AND "precio_venta" IS NOT DISTINCT FROM 46100 AND "precio_costo" IS NOT DISTINCT FROM 35400 AND "margen" IS NOT DISTINCT FROM 30.23;

-- mini el 7 · ARCORMIX MENTA X810G · $11.906,59: $16.300 → $16.700
UPDATE "ProductoLocal" SET "precio_venta" = 16700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3949 AND "precio_venta" IS NOT DISTINCT FROM 16300 AND "precio_costo" IS NOT DISTINCT FROM 11906.59 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ARROZ LUCCHETTI 500G · $10.400: $13.500 → $13.600
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2032 AND "precio_venta" IS NOT DISTINCT FROM 13500 AND "precio_costo" IS NOT DISTINCT FROM 10400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ARVEJAS LATA ELIO · $12.830,40: $15.300 → $16.700
UPDATE "ProductoLocal" SET "precio_venta" = 16700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2879 AND "precio_venta" IS NOT DISTINCT FROM 15300 AND "precio_costo" IS NOT DISTINCT FROM 12830.4 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ATUN DESMENUSADO AL NATURAL BAHIA · $74.640: $97.000 → $97.100
UPDATE "ProductoLocal" SET "precio_venta" = 97100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2942 AND "precio_venta" IS NOT DISTINCT FROM 97000 AND "precio_costo" IS NOT DISTINCT FROM 74640 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ATUN DESMENUSADO EN ACEITE BAHIA · $74.640: $97.000 → $97.100
UPDATE "ProductoLocal" SET "precio_venta" = 97100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2941 AND "precio_venta" IS NOT DISTINCT FROM 97000 AND "precio_costo" IS NOT DISTINCT FROM 74640 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · axe gold vainilla · $3.400,73: $3.600 → $4.500
UPDATE "ProductoLocal" SET "precio_venta" = 4500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3533 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 3400.73 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · AXE MUSK 150ML · $3.400,73: $3.600 → $4.500
UPDATE "ProductoLocal" SET "precio_venta" = 4500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2037 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 3400.73 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · AZAFRAN MOLIDO X2 · $5.425,46: $5.600 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2930 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 5425.46 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAGGIO 1L DURAZNO · $12.100: $15.700 → $15.800
UPDATE "ProductoLocal" SET "precio_venta" = 15800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3202 AND "precio_venta" IS NOT DISTINCT FROM 15700 AND "precio_costo" IS NOT DISTINCT FROM 12100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAHIA FRUTOS DEL BOSQUE · $35.160: $45.700 → $45.800
UPDATE "ProductoLocal" SET "precio_venta" = 45800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3640 AND "precio_venta" IS NOT DISTINCT FROM 45700 AND "precio_costo" IS NOT DISTINCT FROM 35160 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAHIA LOMITO DE ATUN ACEITE Y AGUA · $112.800: $146.600 → $146.700
UPDATE "ProductoLocal" SET "precio_venta" = 146700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3730 AND "precio_venta" IS NOT DISTINCT FROM 146600 AND "precio_costo" IS NOT DISTINCT FROM 112800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BANANITA DOLCA 30G · $17.650: $24.700 → $24.800
UPDATE "ProductoLocal" SET "precio_venta" = 24800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3176 AND "precio_venta" IS NOT DISTINCT FROM 24700 AND "precio_costo" IS NOT DISTINCT FROM 17650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BASTON VIENA · $4.325,63: $5.900 → $6.100
UPDATE "ProductoLocal" SET "precio_venta" = 6100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2830 AND "precio_venta" IS NOT DISTINCT FROM 5900 AND "precio_costo" IS NOT DISTINCT FROM 4325.63 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BATATA ARCOR 500G · $2.063,52: $1.900 → $2.700
UPDATE "ProductoLocal" SET "precio_venta" = 2700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2081 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 2063.52 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Beldent Azul 13.3gr · $12.240: $17.100 → $17.200
UPDATE "ProductoLocal" SET "precio_venta" = 17200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2083 AND "precio_venta" IS NOT DISTINCT FROM 17100 AND "precio_costo" IS NOT DISTINCT FROM 12240 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BLENDERS WHISKY 1L · $51.294,60: $64.400 → $66.700
UPDATE "ProductoLocal" SET "precio_venta" = 66700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2094 AND "precio_venta" IS NOT DISTINCT FROM 64400 AND "precio_costo" IS NOT DISTINCT FROM 51294.6 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BOLSA 80X110 · $1.030: $1.300 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6489 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1030 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Bon o Bon Aguila · $9.184,18: $10.700 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6634 AND "precio_venta" IS NOT DISTINCT FROM 10700 AND "precio_costo" IS NOT DISTINCT FROM 9184.18 AND "margen" IS NOT DISTINCT FROM 40;

-- mini el 7 · Bon O Bon Blanco · $15.159,78: $16.400 → $19.800
UPDATE "ProductoLocal" SET "precio_venta" = 19800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2097 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 15159.78 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Bon O Bon Negro · $15.159,78: $16.400 → $19.800
UPDATE "ProductoLocal" SET "precio_venta" = 19800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2098 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 15159.78 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BROCHES MADERA NUVIA X12 · $420: $400 → $600
UPDATE "ProductoLocal" SET "precio_venta" = 600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2074 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 420 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BUHERO NEGRO FERNET 700ML · $49.152,15: $61.700 → $63.900
UPDATE "ProductoLocal" SET "precio_venta" = 63900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2856 AND "precio_venta" IS NOT DISTINCT FROM 61700 AND "precio_costo" IS NOT DISTINCT FROM 49152.15 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Cabsha Tradicion Caja · $21.229,57: $24.200 → $27.600
UPDATE "ProductoLocal" SET "precio_venta" = 27600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2143 AND "precio_venta" IS NOT DISTINCT FROM 24200 AND "precio_costo" IS NOT DISTINCT FROM 21229.57 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Cadbury 82g frutilla · $5.100: $6.600 → $6.700
UPDATE "ProductoLocal" SET "precio_venta" = 6700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2145 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · cafe arlistan 170 · $5.800: $7.500 → $7.600
UPDATE "ProductoLocal" SET "precio_venta" = 7600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6688 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 5800 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Camel 10 · $40.380: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6496 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40380 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · CAMPEON · $29.640,24: $38.200 → $38.600
UPDATE "ProductoLocal" SET "precio_venta" = 38600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2151 AND "precio_venta" IS NOT DISTINCT FROM 38200 AND "precio_costo" IS NOT DISTINCT FROM 29640.24 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CARAMELOS ALKA CREMOSO · $10.100: $14.100 → $14.200
UPDATE "ProductoLocal" SET "precio_venta" = 14200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2989 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CARAMELOS ALKA MENTA VERDE · $10.100: $14.100 → $14.200
UPDATE "ProductoLocal" SET "precio_venta" = 14200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2770 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CARAMELOS ALKA NEGRO STRONG · $9.300: $13.000 → $13.100
UPDATE "ProductoLocal" SET "precio_venta" = 13100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2716 AND "precio_venta" IS NOT DISTINCT FROM 13000 AND "precio_costo" IS NOT DISTINCT FROM 9300 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CARAMELOS ALKA ROJO CHERRY 400u · $10.100: $14.100 → $14.200
UPDATE "ProductoLocal" SET "precio_venta" = 14200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2715 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CARAMELOS BILLIKEN 600g · $3.101: $4.300 → $4.400
UPDATE "ProductoLocal" SET "precio_venta" = 4400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2093 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 3101 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CARBON GRANDE · $4.400: $5.700 → $5.800
UPDATE "ProductoLocal" SET "precio_venta" = 5800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6414 AND "precio_venta" IS NOT DISTINCT FROM 5700 AND "precio_costo" IS NOT DISTINCT FROM 4400 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · CARTAS HABANA 40 · $20.400: $26.500 → $26.600
UPDATE "ProductoLocal" SET "precio_venta" = 26600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2905 AND "precio_venta" IS NOT DISTINCT FROM 26500 AND "precio_costo" IS NOT DISTINCT FROM 20400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · cartas habana x50 · $23.640: $30.700 → $30.800
UPDATE "ProductoLocal" SET "precio_venta" = 30800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2990 AND "precio_venta" IS NOT DISTINCT FROM 30700 AND "precio_costo" IS NOT DISTINCT FROM 23640 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CEPILLO MAPUCHE DE MANO · $1.321: $1.300 → $1.800
UPDATE "ProductoLocal" SET "precio_venta" = 1800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2112 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1321 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CEREAL MIX BARRITA YOGHURT & FRUTILLA · $16.900: $19.300 → $22.000
UPDATE "ProductoLocal" SET "precio_venta" = 22000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2686 AND "precio_venta" IS NOT DISTINCT FROM 19300 AND "precio_costo" IS NOT DISTINCT FROM 16900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CEREAL MIX BARRITA YOGHURT & FRUTILLA LIGHT · $16.900: $19.300 → $22.000
UPDATE "ProductoLocal" SET "precio_venta" = 22000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3062 AND "precio_venta" IS NOT DISTINCT FROM 19300 AND "precio_costo" IS NOT DISTINCT FROM 16900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Cereal mix choco/alm · $16.900: $19.300 → $22.000
UPDATE "ProductoLocal" SET "precio_venta" = 22000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2935 AND "precio_venta" IS NOT DISTINCT FROM 19300 AND "precio_costo" IS NOT DISTINCT FROM 16900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CEREAL MIX FRUTILLA Y CHOCOLOTE 26G · $16.900: $19.300 → $22.000
UPDATE "ProductoLocal" SET "precio_venta" = 22000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3226 AND "precio_venta" IS NOT DISTINCT FROM 19300 AND "precio_costo" IS NOT DISTINCT FROM 16900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CEREAL MIX MANZANA LIGHT · $16.900: $19.300 → $22.000
UPDATE "ProductoLocal" SET "precio_venta" = 22000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2934 AND "precio_venta" IS NOT DISTINCT FROM 19300 AND "precio_costo" IS NOT DISTINCT FROM 16900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CEREAL MIX PASION DE CHOCOLATE · $16.900: $19.300 → $22.000
UPDATE "ProductoLocal" SET "precio_venta" = 22000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3235 AND "precio_venta" IS NOT DISTINCT FROM 19300 AND "precio_costo" IS NOT DISTINCT FROM 16900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CERVEZA IGUANA 1L · $25.500: $33.200 → $33.300
UPDATE "ProductoLocal" SET "precio_venta" = 33300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2993 AND "precio_venta" IS NOT DISTINCT FROM 33200 AND "precio_costo" IS NOT DISTINCT FROM 25500 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHEETOS QUESO 43G · $1.650: $1.500 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3123 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Chester 10 · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6074 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Chester 10 mentolado · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6075 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · CHOCLO CREMOSO BLANCO LATA · $16.464: $21.400 → $21.500
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3141 AND "precio_venta" IS NOT DISTINCT FROM 21400 AND "precio_costo" IS NOT DISTINCT FROM 16464 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCLO CREMOSO INALPA · $14.400: $18.700 → $18.800
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2116 AND "precio_venta" IS NOT DISTINCT FROM 18700 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCLO EN GRANO INALPA · $26.578,32: $34.300 → $34.600
UPDATE "ProductoLocal" SET "precio_venta" = 34600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2117 AND "precio_venta" IS NOT DISTINCT FROM 34300 AND "precio_costo" IS NOT DISTINCT FROM 26578.32 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCLO EN GRANOS BAHIA · $26.640: $34.600 → $34.700
UPDATE "ProductoLocal" SET "precio_venta" = 34700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2878 AND "precio_venta" IS NOT DISTINCT FROM 34600 AND "precio_costo" IS NOT DISTINCT FROM 26640 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · choclo noel · $40.800: $53.000 → $53.100
UPDATE "ProductoLocal" SET "precio_venta" = 53100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6375 AND "precio_venta" IS NOT DISTINCT FROM 53000 AND "precio_costo" IS NOT DISTINCT FROM 40800 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · CHOCOLATE COFLER DUBAI 43 · $55.668,69: $67.000 → $78.100
UPDATE "ProductoLocal" SET "precio_venta" = 78100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3761 AND "precio_venta" IS NOT DISTINCT FROM 67000 AND "precio_costo" IS NOT DISTINCT FROM 55668.69 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Chocolate Dubai x43g · $47.800: $62.100 → $62.200
UPDATE "ProductoLocal" SET "precio_venta" = 62200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6056 AND "precio_venta" IS NOT DISTINCT FROM 62100 AND "precio_costo" IS NOT DISTINCT FROM 47800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCOLINA 170G · $1.644,35: $1.800 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2726 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1644.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCOLINA 170G BLANCO · $1.644,35: $1.800 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3328 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1644.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCOLINA 181G NEGRO · $1.644,35: $1.800 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3329 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1644.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCOLINA 250G · $2.179,72: $2.400 → $2.900
UPDATE "ProductoLocal" SET "precio_venta" = 2900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2168 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 2179.72 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCOLINO CHOCOLATADA 180G · $1.863,74: $2.200 → $2.500
UPDATE "ProductoLocal" SET "precio_venta" = 2500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2118 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1863.74 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHOCOTORTA ALFAJOR 71G · $1.442,22: $1.800 → $2.100
UPDATE "ProductoLocal" SET "precio_venta" = 2100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3453 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1442.22 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHUPETIN EXPLOSIVE SANDIA · $12.181,95: $14.600 → $15.900
UPDATE "ProductoLocal" SET "precio_venta" = 15900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6739 AND "precio_venta" IS NOT DISTINCT FROM 14600 AND "precio_costo" IS NOT DISTINCT FROM 12181.95 AND "margen" IS NOT DISTINCT FROM 30.24;

-- mini el 7 · CIF CREMA 375g · $1.911,97: $2.200 → $2.500
UPDATE "ProductoLocal" SET "precio_venta" = 2500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2123 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1911.97 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CIF Pisos 750ml · $4.345,88: $5.000 → $5.700
UPDATE "ProductoLocal" SET "precio_venta" = 5700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6607 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 4345.88 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · CLOSE UP MENTA 70g · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3132 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CLOSE UP MENTA AMERICANA 70g · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3133 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CLUB SOCIAL JAMON · $2.550: $3.300 → $3.400
UPDATE "ProductoLocal" SET "precio_venta" = 3400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2857 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2550 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CLUB SOCIAL ORIGINAL · $2.550: $3.300 → $3.400
UPDATE "ProductoLocal" SET "precio_venta" = 3400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2180 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2550 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Cofler Air Leche 100g · $71.311,54: $86.400 → $100.000
UPDATE "ProductoLocal" SET "precio_venta" = 100000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2190 AND "precio_venta" IS NOT DISTINCT FROM 86400 AND "precio_costo" IS NOT DISTINCT FROM 71311.54 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Cofler Block 110gr · $49.277,10: $60.200 → $69.000
UPDATE "ProductoLocal" SET "precio_venta" = 69000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2196 AND "precio_venta" IS NOT DISTINCT FROM 60200 AND "precio_costo" IS NOT DISTINCT FROM 49277.1 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Cofler Block 300grs · $11.768,36: $14.700 → $16.600
UPDATE "ProductoLocal" SET "precio_venta" = 16600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3089 AND "precio_venta" IS NOT DISTINCT FROM 14700 AND "precio_costo" IS NOT DISTINCT FROM 11768.36 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Cofler DDL 35g · $32.842,16: $37.300 → $42.700
UPDATE "ProductoLocal" SET "precio_venta" = 42700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6405 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 32842.16 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Cofler Leche 55g · $29.595,99: $35.000 → $38.500
UPDATE "ProductoLocal" SET "precio_venta" = 38500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6338 AND "precio_venta" IS NOT DISTINCT FROM 35000 AND "precio_costo" IS NOT DISTINCT FROM 29595.99 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · COFLER ROCKLETS 140 grs · $6.650: $9.300 → $9.400
UPDATE "ProductoLocal" SET "precio_venta" = 9400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3301 AND "precio_venta" IS NOT DISTINCT FROM 9300 AND "precio_costo" IS NOT DISTINCT FROM 6650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · COQUITAS 177 · $1.644,35: $1.800 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3096 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1644.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Crema de Leche Cremac · $36.960: $48.000 → $48.100
UPDATE "ProductoLocal" SET "precio_venta" = 48100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6169 AND "precio_venta" IS NOT DISTINCT FROM 48000 AND "precio_costo" IS NOT DISTINCT FROM 36960 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · CREMAC DULCE DE LECHE 400G · $1.490: $1.900 → $2.000
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3423 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1490 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CREMINO SURTIDOS X940GR · $12.482,04: $15.600 → $16.300
UPDATE "ProductoLocal" SET "precio_venta" = 16300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13822 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12482.04 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · CRIOLLITA x3 100G · $34.320: $44.600 → $44.700
UPDATE "ProductoLocal" SET "precio_venta" = 44700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2207 AND "precio_venta" IS NOT DISTINCT FROM 44600 AND "precio_costo" IS NOT DISTINCT FROM 34320 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · dea lavandina · $14.186,79: $18.400 → $18.500
UPDATE "ProductoLocal" SET "precio_venta" = 18500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2778 AND "precio_venta" IS NOT DISTINCT FROM 18400 AND "precio_costo" IS NOT DISTINCT FROM 14186.79 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Disco Empanada Tapa 14 · $23.400: $30.400 → $30.500
UPDATE "ProductoLocal" SET "precio_venta" = 30500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2219 AND "precio_venta" IS NOT DISTINCT FROM 30400 AND "precio_costo" IS NOT DISTINCT FROM 23400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DISMAR HISOPOS 100U · $942: $1.200 → $1.300
UPDATE "ProductoLocal" SET "precio_venta" = 1300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2308 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 942 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOBLE-V WHISKY 1L · $4.817,92: $4.700 → $6.300
UPDATE "ProductoLocal" SET "precio_venta" = 6300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2221 AND "precio_venta" IS NOT DISTINCT FROM 4700 AND "precio_costo" IS NOT DISTINCT FROM 4817.92 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DORITO SWEET CHILI 35G · $1.650: $1.400 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3910 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DORITO 82G EXRA FLAMIN HOT · $2.500: $2.000 → $3.300
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3908 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DORITO DINAMITA 45G · $1.650: $1.300 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3915 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DORITO FLAMINT HOT 45G · $1.650: $1.300 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3909 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DORITOS 40g · $1.650: $1.500 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2226 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOVE 180 ML REPUEST · $29.160: $38.000 → $38.100
UPDATE "ProductoLocal" SET "precio_venta" = 38100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3927 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 29160 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOVE ACONDICIONADOR 180ML · $29.160: $38.000 → $38.100
UPDATE "ProductoLocal" SET "precio_venta" = 38100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2216 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 29160 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Dove Jabon · $1.770: $2.300 → $2.400
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 4000 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 1770 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOVE SHAMPOO 180ML · $29.160: $37.900 → $38.000
UPDATE "ProductoLocal" SET "precio_venta" = 38000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2214 AND "precio_venta" IS NOT DISTINCT FROM 37900 AND "precio_costo" IS NOT DISTINCT FROM 29160 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOWNY 400ML BRISA INTENSO · $3.141: $3.100 → $4.100
UPDATE "ProductoLocal" SET "precio_venta" = 4100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3758 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 3141 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOWNYY CONCENTRADO 1L BRISA DE VERANO · $7.842: $7.800 → $10.200
UPDATE "ProductoLocal" SET "precio_venta" = 10200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3439 AND "precio_venta" IS NOT DISTINCT FROM 7800 AND "precio_costo" IS NOT DISTINCT FROM 7842 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DR LEMON 473 · $10.400: $13.500 → $13.600
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3833 AND "precio_venta" IS NOT DISTINCT FROM 13500 AND "precio_costo" IS NOT DISTINCT FROM 10400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · dr lemon blck cherry · $10.400: $13.500 → $13.600
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3195 AND "precio_venta" IS NOT DISTINCT FROM 13500 AND "precio_costo" IS NOT DISTINCT FROM 10400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DR LEMON GREEN APPLE 1L · $34.800: $45.200 → $45.300
UPDATE "ProductoLocal" SET "precio_venta" = 45300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3902 AND "precio_venta" IS NOT DISTINCT FROM 45200 AND "precio_costo" IS NOT DISTINCT FROM 34800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DR LEMON LIMON 1L X CAJA · $34.800: $45.200 → $45.300
UPDATE "ProductoLocal" SET "precio_venta" = 45300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2641 AND "precio_venta" IS NOT DISTINCT FROM 45200 AND "precio_costo" IS NOT DISTINCT FROM 34800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DULCOR BATATA 500G · $16.730: $21.700 → $21.800
UPDATE "ProductoLocal" SET "precio_venta" = 21800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2924 AND "precio_venta" IS NOT DISTINCT FROM 21700 AND "precio_costo" IS NOT DISTINCT FROM 16730 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DULCOR BATATA CHOCOLATE 500G · $17.416,80: $21.700 → $22.700
UPDATE "ProductoLocal" SET "precio_venta" = 22700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2997 AND "precio_venta" IS NOT DISTINCT FROM 21700 AND "precio_costo" IS NOT DISTINCT FROM 17416.8 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DULCOR MEMBRILLO 500G · $21.693,48: $26.200 → $28.300
UPDATE "ProductoLocal" SET "precio_venta" = 28300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2998 AND "precio_venta" IS NOT DISTINCT FROM 26200 AND "precio_costo" IS NOT DISTINCT FROM 21693.48 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DULCOR MERMELADA 500G CIRUELA · $1.211,14: $1.500 → $1.600
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2925 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1211.14 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DULCOR MERMELADA 500G DAMASCO · $1.223,70: $1.500 → $1.600
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2400 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1223.7 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DULCOR MERMELADA 500g DURAZNO · $1.223,70: $1.500 → $1.600
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2401 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1223.7 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DULCOR MERMELADA 500g FRUTILLA · $1.630: $2.100 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2402 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1630 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DULCOR MERMELADA 500G ZAPALLO · $1.223,59: $1.500 → $1.600
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2404 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1223.59 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DURAZNO HORVINDUL LATA · $23.880: $31.000 → $31.100
UPDATE "ProductoLocal" SET "precio_venta" = 31100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3972 AND "precio_venta" IS NOT DISTINCT FROM 31000 AND "precio_costo" IS NOT DISTINCT FROM 23880 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ELITE DISNEY X6 · $1.146: $1.100 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3219 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1146 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESCOBILLON CURVO · $1.250: $1.600 → $1.700
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3613 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1250 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESCOBILLON ECON · $1.411: $1.400 → $1.900
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2236 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1411 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESPONJA DORADA SEIKO · $390: $500 → $600
UPDATE "ProductoLocal" SET "precio_venta" = 600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3042 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 390 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESPONJA ACERO SEIKO · $245: $300 → $400
UPDATE "ProductoLocal" SET "precio_venta" = 400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3041 AND "precio_venta" IS NOT DISTINCT FROM 300 AND "precio_costo" IS NOT DISTINCT FROM 245 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESPONJA AMARILLA BATUQUE · $220: $200 → $300
UPDATE "ProductoLocal" SET "precio_venta" = 300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3043 AND "precio_venta" IS NOT DISTINCT FROM 200 AND "precio_costo" IS NOT DISTINCT FROM 220 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESPONJA DE BRONCE DEA · $505: $500 → $700
UPDATE "ProductoLocal" SET "precio_venta" = 700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2737 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 505 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESPONJA DEA AMARILLA · $320: $400 → $500
UPDATE "ProductoLocal" SET "precio_venta" = 500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2237 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 320 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESPUMA NIEVE LANDIA · $1.400: $1.800 → $1.900
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3006 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESTANCIA MENDOZA SYR-MAL 1.125 X6 · $17.400: $22.600 → $22.700
UPDATE "ProductoLocal" SET "precio_venta" = 22700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3106 AND "precio_venta" IS NOT DISTINCT FROM 22600 AND "precio_costo" IS NOT DISTINCT FROM 17400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · EVEREADY AA · $2.700: $3.500 → $3.600
UPDATE "ProductoLocal" SET "precio_venta" = 3600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3022 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · EXQUISITA BIZCOCHUELO CHOCOLATE · $3.315: $4.300 → $4.400
UPDATE "ProductoLocal" SET "precio_venta" = 4400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3248 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 3315 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · EXQUISITA CHOCOLATADA 300g · $2.015: $2.600 → $2.700
UPDATE "ProductoLocal" SET "precio_venta" = 2700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3255 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 2015 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · EXQUISITA FLAN DDL · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9225 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;

-- mini el 7 · EXQUISITA FLAN VAINILLA · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9222 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;

-- mini el 7 · fanacoa kepchu 250 · $1.081,92: $1.300 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6040 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1081.92 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Fanta Limon 2l · $23.333,33: $30.400 → $30.500
UPDATE "ProductoLocal" SET "precio_venta" = 30500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6798 AND "precio_venta" IS NOT DISTINCT FROM 30400 AND "precio_costo" IS NOT DISTINCT FROM 23333.33 AND "margen" IS NOT DISTINCT FROM 30.29;

-- mini el 7 · FAVORITA PAN RALLADO 500G · $800: $1.000 → $1.100
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3528 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · fizz extreme · $10.890: $15.200 → $15.300
UPDATE "ProductoLocal" SET "precio_venta" = 15300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2836 AND "precio_venta" IS NOT DISTINCT FROM 15200 AND "precio_costo" IS NOT DISTINCT FROM 10890 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FORMIS BLACK LILA 102G · $1.015: $1.300 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2267 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1015 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FORMIS CHOCOLATE ROJA 102G · $1.015: $1.300 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2269 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1015 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FORMIS DULCE DE LECHE NARANJA 102G · $1.015: $1.300 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2268 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1015 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FORMIS FRUTILLA ROSA 102 · $1.015: $1.300 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2270 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1015 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FRANELA FIBRAN · $1.040: $1.000 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2254 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 1040 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FRANELA NUVIA · $821: $800 → $1.100
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2255 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 821 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Frutigran avena y frutos rojos · $49.351,68: $60.500 → $64.200
UPDATE "ProductoLocal" SET "precio_venta" = 64200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3724 AND "precio_venta" IS NOT DISTINCT FROM 60500 AND "precio_costo" IS NOT DISTINCT FROM 49351.68 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Frutigran tropical · $49.351,68: $60.300 → $64.200
UPDATE "ProductoLocal" SET "precio_venta" = 64200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3725 AND "precio_venta" IS NOT DISTINCT FROM 60300 AND "precio_costo" IS NOT DISTINCT FROM 49351.68 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FUYI AEROSOL 360CM3 · $3.510: $3.500 → $4.600
UPDATE "ProductoLocal" SET "precio_venta" = 4600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2950 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 3510 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FUYI REPELENTE AERO · $37.800: $49.100 → $49.200
UPDATE "ProductoLocal" SET "precio_venta" = 49200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3781 AND "precio_venta" IS NOT DISTINCT FROM 49100 AND "precio_costo" IS NOT DISTINCT FROM 37800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GAONA CHIPS CHOCO 230g · $19.800: $25.700 → $25.800
UPDATE "ProductoLocal" SET "precio_venta" = 25800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3531 AND "precio_venta" IS NOT DISTINCT FROM 25700 AND "precio_costo" IS NOT DISTINCT FROM 19800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GAONA RECREO 300G · $1.640: $2.100 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2509 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1640 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GELATINA EXQUISITA FRUTILLA X15 · $13.700: $17.800 → $17.900
UPDATE "ProductoLocal" SET "precio_venta" = 17900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2919 AND "precio_venta" IS NOT DISTINCT FROM 17800 AND "precio_costo" IS NOT DISTINCT FROM 13700 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Gin Brighton 700ml · $7.674,53: $9.600 → $10.000
UPDATE "ProductoLocal" SET "precio_venta" = 10000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2100 AND "precio_venta" IS NOT DISTINCT FROM 9600 AND "precio_costo" IS NOT DISTINCT FROM 7674.53 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GRANBY LIQUIDO 800ML ROSA · $22.020: $28.600 → $28.700
UPDATE "ProductoLocal" SET "precio_venta" = 28700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2282 AND "precio_venta" IS NOT DISTINCT FROM 28600 AND "precio_costo" IS NOT DISTINCT FROM 22020 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GRANBY LIQUIDO 800ML VERDE · $25.151,16: $28.600 → $32.700
UPDATE "ProductoLocal" SET "precio_venta" = 32700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2283 AND "precio_venta" IS NOT DISTINCT FROM 28600 AND "precio_costo" IS NOT DISTINCT FROM 25151.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GUANTES DEA CHICOS · $2.102: $2.100 → $2.800
UPDATE "ProductoLocal" SET "precio_venta" = 2800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3402 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2102 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GUANTES NUVIA S · $1.125: $1.100 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3401 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1125 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GUSANITOS ROCK extreme 40gr · $8.977,88: $11.600 → $12.600
UPDATE "ProductoLocal" SET "precio_venta" = 12600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6051 AND "precio_venta" IS NOT DISTINCT FROM 11600 AND "precio_costo" IS NOT DISTINCT FROM 8977.88 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · HUEVO KINDER NENA · $26.600: $37.300 → $37.400
UPDATE "ProductoLocal" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3179 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 26600 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · HUEVO KINDER NENE · $26.600: $37.300 → $37.400
UPDATE "ProductoLocal" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3178 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 26600 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · INALPA ARVEJAS · $12.240: $15.900 → $16.000
UPDATE "ProductoLocal" SET "precio_venta" = 16000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2034 AND "precio_venta" IS NOT DISTINCT FROM 15900 AND "precio_costo" IS NOT DISTINCT FROM 12240 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · INALPA LENTEJA LATA 300G · $19.800: $25.700 → $25.800
UPDATE "ProductoLocal" SET "precio_venta" = 25800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3616 AND "precio_venta" IS NOT DISTINCT FROM 25700 AND "precio_costo" IS NOT DISTINCT FROM 19800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · IODOPOVIDONA · $2.140: $2.100 → $2.800
UPDATE "ProductoLocal" SET "precio_venta" = 2800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2681 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2140 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · JABON REXONA X3 COTTON FRESH · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2523 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · JABON REXONA X3 FUTBOL FANATICS · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3206 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · JABON REXONA X3 NUTRITIVE ORCHID · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3015 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jaimitos X 10u · $1.120: $1.100 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2316 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1120 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · kit cadbury small · $87.490: $122.500 → $122.600
UPDATE "ProductoLocal" SET "precio_venta" = 122600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6838 AND "precio_venta" IS NOT DISTINCT FROM 122500 AND "precio_costo" IS NOT DISTINCT FROM 87490 AND "margen" IS NOT DISTINCT FROM 40.02;

-- mini el 7 · kit cadbury yogurt · $112.160: $157.100 → $157.200
UPDATE "ProductoLocal" SET "precio_venta" = 157200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6844 AND "precio_venta" IS NOT DISTINCT FROM 157100 AND "precio_costo" IS NOT DISTINCT FROM 112160 AND "margen" IS NOT DISTINCT FROM 40.07;

-- mini el 7 · kit milka leger pause · $83.810: $117.300 → $117.400
UPDATE "ProductoLocal" SET "precio_venta" = 117400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3425 AND "precio_venta" IS NOT DISTINCT FROM 117300 AND "precio_costo" IS NOT DISTINCT FROM 83810 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Kit Shot · $45.430: $63.600 → $63.700
UPDATE "ProductoLocal" SET "precio_venta" = 63700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3424 AND "precio_venta" IS NOT DISTINCT FROM 63600 AND "precio_costo" IS NOT DISTINCT FROM 45430 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNOoR RECETA COMPLETA · $26.640: $34.600 → $34.700
UPDATE "ProductoLocal" SET "precio_venta" = 34700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3903 AND "precio_venta" IS NOT DISTINCT FROM 34600 AND "precio_costo" IS NOT DISTINCT FROM 26640 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR CALDO CARNE 24U · $11.595,84: $13.800 → $15.100
UPDATE "ProductoLocal" SET "precio_venta" = 15100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2148 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 11595.84 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR CALDO GALLINA 24U · $11.596,08: $13.800 → $15.100
UPDATE "ProductoLocal" SET "precio_venta" = 15100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2149 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 11596.08 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR CALDO VERDURA 24U · $11.596,08: $13.800 → $15.100
UPDATE "ProductoLocal" SET "precio_venta" = 15100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2150 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 11596.08 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA VIRGINIA CAFE EQUILIBRADO 125G · $2.947,64: $3.500 → $3.900
UPDATE "ProductoLocal" SET "precio_venta" = 3900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3332 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2947.64 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA VIRGINIA CAFE INSTANTANEO 100G · $28.819,98: $34.000 → $37.500
UPDATE "ProductoLocal" SET "precio_venta" = 37500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3144 AND "precio_venta" IS NOT DISTINCT FROM 34000 AND "precio_costo" IS NOT DISTINCT FROM 28819.98 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA VIRGINIA CAFE INSTANTANEO 50G · $15.957,12: $19.000 → $20.800
UPDATE "ProductoLocal" SET "precio_venta" = 20800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3145 AND "precio_venta" IS NOT DISTINCT FROM 19000 AND "precio_costo" IS NOT DISTINCT FROM 15957.12 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA VIRGINIA TE NEGRO X PACK · $7.250: $9.400 → $9.500
UPDATE "ProductoLocal" SET "precio_venta" = 9500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2695 AND "precio_venta" IS NOT DISTINCT FROM 9400 AND "precio_costo" IS NOT DISTINCT FROM 7250 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Ladrillos extreme mundial 500gr · $6.160: $8.600 → $8.700
UPDATE "ProductoLocal" SET "precio_venta" = 8700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6315 AND "precio_venta" IS NOT DISTINCT FROM 8600 AND "precio_costo" IS NOT DISTINCT FROM 6160 AND "margen" IS NOT DISTINCT FROM 40;

-- mini el 7 · LADYSOFT NOCTURNA x16 · $2.505: $2.500 → $3.300
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3754 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2505 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · lata bombon · $8.639: $82.600 → $82.700
UPDATE "ProductoLocal" SET "precio_venta" = 82700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9081 AND "precio_venta" IS NOT DISTINCT FROM 82600 AND "precio_costo" IS NOT DISTINCT FROM 8639 AND "margen" IS NOT DISTINCT FROM 856.48;

-- mini el 7 · Laurel Hoja 10g · $19.184,28: $22.600 → $25.000
UPDATE "ProductoLocal" SET "precio_venta" = 25000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2341 AND "precio_venta" IS NOT DISTINCT FROM 22600 AND "precio_costo" IS NOT DISTINCT FROM 19184.28 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS 40g QUESO CREMA · $1.650: $1.500 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3739 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS CLASICA 40G · $1.650: $1.500 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2342 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS CLASICA 85g · $2.500: $2.300 → $3.300
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2343 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · lays flaming hot 30grs · $1.650: $1.500 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3037 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS HONDAS FH 70G · $2.500: $2.100 → $3.300
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2860 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS JAMON SERRANO 77g · $2.642,86: $2.300 → $3.500
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2344 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 2642.86 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS KETCHUP 77g · $2.500: $2.300 → $3.300
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3772 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS PANCETA 77G · $2.500: $2.300 → $3.300
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3677 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS QUESO CREMA Y CEBOLLA 77g · $2.500: $2.300 → $3.300
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2345 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LIMZUL 3L · $6.600: $5.000 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3992 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 6600 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LORD CHESELINE EXTRA FIJACION 150G · $3.217,68: $4.000 → $4.200
UPDATE "ProductoLocal" SET "precio_venta" = 4200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2891 AND "precio_venta" IS NOT DISTINCT FROM 4000 AND "precio_costo" IS NOT DISTINCT FROM 3217.68 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LORD CHESELINE EXTRA FIJACION 280G · $6.187,08: $7.400 → $8.100
UPDATE "ProductoLocal" SET "precio_venta" = 8100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2890 AND "precio_venta" IS NOT DISTINCT FROM 7400 AND "precio_costo" IS NOT DISTINCT FROM 6187.08 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Lucky 10 · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6095 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Lucky 10 mentolado · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6096 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · LUX X3 LIRIO AZUL · $3.407,33: $3.000 → $4.500
UPDATE "ProductoLocal" SET "precio_venta" = 4500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2336 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 3407.33 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LYSOFORM AIRE DE MONTAÑA · $28.320: $36.800 → $36.900
UPDATE "ProductoLocal" SET "precio_venta" = 36900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3546 AND "precio_venta" IS NOT DISTINCT FROM 36800 AND "precio_costo" IS NOT DISTINCT FROM 28320 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGISTRAL 300 LIMON CREMOSO · $1.800: $1.700 → $2.400
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3500 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGISTRAL 300 PUREZA ACTIVE · $1.800: $1.700 → $2.400
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3499 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGISTRAL 300ML LIMON · $1.800: $1.700 → $2.400
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2352 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGISTRAL 300ml MARINA · $1.800: $1.700 → $2.400
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2353 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGISTRAL 500ML MARINA · $3.200: $2.800 → $4.200
UPDATE "ProductoLocal" SET "precio_venta" = 4200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2354 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 3200 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAIZ PISINGALLO ELIO · $630: $600 → $900
UPDATE "ProductoLocal" SET "precio_venta" = 900, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2816 AND "precio_venta" IS NOT DISTINCT FROM 600 AND "precio_costo" IS NOT DISTINCT FROM 630 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAIZENA ALMIDON DE MAIZ 550G · $3.114,93: $3.900 → $4.100
UPDATE "ProductoLocal" SET "precio_venta" = 4100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3931 AND "precio_venta" IS NOT DISTINCT FROM 3900 AND "precio_costo" IS NOT DISTINCT FROM 3114.93 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MANA 136g · $1.070,74: $1.200 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6570 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 1070.74 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · mana con leche · $1.070,74: $1.200 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6572 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 1070.74 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · mani jamon · $6.250: $8.100 → $8.200
UPDATE "ProductoLocal" SET "precio_venta" = 8200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6387 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 6250 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · mani pizza · $6.250: $8.100 → $8.200
UPDATE "ProductoLocal" SET "precio_venta" = 8200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6388 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 6250 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Manteca Serenisima 200g · $31.800: $41.300 → $41.400
UPDATE "ProductoLocal" SET "precio_venta" = 41400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6526 AND "precio_venta" IS NOT DISTINCT FROM 41300 AND "precio_costo" IS NOT DISTINCT FROM 31800 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Marlboro 10 · $40.272: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6354 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40272 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Marlboro 10 Uva · $39.840: $41.000 → $42.000
UPDATE "ProductoLocal" SET "precio_venta" = 42000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6094 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 39840 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Marlboro 20 Crafted suave · $40.260: $40.260 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6113 AND "precio_venta" IS NOT DISTINCT FROM 40260 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 0;

-- mini el 7 · MENTA CRISTAL 140g · $2.000: $2.800 → $2.900
UPDATE "ProductoLocal" SET "precio_venta" = 2900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3367 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MERENGADA 88G · $1.376,67: $1.600 → $1.900
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2359 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1376.67 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Mermelada Naranja Dulcor 500g · $1.211,14: $1.500 → $1.600
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2403 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1211.14 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Milk 12g Barrita · $11.296,55: $15.100 → $15.900
UPDATE "ProductoLocal" SET "precio_venta" = 15900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2407 AND "precio_venta" IS NOT DISTINCT FROM 15100 AND "precio_costo" IS NOT DISTINCT FROM 11296.55 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Milka Bis Oreo · $3.430: $4.800 → $4.900
UPDATE "ProductoLocal" SET "precio_venta" = 4900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6643 AND "precio_venta" IS NOT DISTINCT FROM 4800 AND "precio_costo" IS NOT DISTINCT FROM 3430 AND "margen" IS NOT DISTINCT FROM 40;

-- mini el 7 · MINERVA LIMON 500ML · $22.800: $29.600 → $29.700
UPDATE "ProductoLocal" SET "precio_venta" = 29700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3151 AND "precio_venta" IS NOT DISTINCT FROM 29600 AND "precio_costo" IS NOT DISTINCT FROM 22800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MINI PEPITO 50G · $859: $1.100 → $1.200
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2360 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 859 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MINI TORTA AGUILA COCO · $1.442,22: $1.800 → $2.100
UPDATE "ProductoLocal" SET "precio_venta" = 2100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2777 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1442.22 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MISKY BLANCO 25G · $25.400: $35.600 → $35.700
UPDATE "ProductoLocal" SET "precio_venta" = 35700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2980 AND "precio_venta" IS NOT DISTINCT FROM 35600 AND "precio_costo" IS NOT DISTINCT FROM 25400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL ANILLOS 1Kg · $11.601,86: $15.100 → $16.300
UPDATE "ProductoLocal" SET "precio_venta" = 16300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2063 AND "precio_venta" IS NOT DISTINCT FROM 15100 AND "precio_costo" IS NOT DISTINCT FROM 11601.86 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL BITES BAÑADAS 150g · $4.382,14: $5.000 → $5.700
UPDATE "ProductoLocal" SET "precio_venta" = 5700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3766 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 4382.14 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL COLA 500g · $7.316,96: $8.300 → $10.300
UPDATE "ProductoLocal" SET "precio_venta" = 10300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3765 AND "precio_venta" IS NOT DISTINCT FROM 8300 AND "precio_costo" IS NOT DISTINCT FROM 7316.96 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL DIENTES 500G · $7.316,96: $8.300 → $10.300
UPDATE "ProductoLocal" SET "precio_venta" = 10300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2217 AND "precio_venta" IS NOT DISTINCT FROM 8300 AND "precio_costo" IS NOT DISTINCT FROM 7316.96 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL DINOS 30G · $5.930: $7.700 → $7.800
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3156 AND "precio_venta" IS NOT DISTINCT FROM 7700 AND "precio_costo" IS NOT DISTINCT FROM 5930 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL EXTREME FRUTALES 35G · $6.179,95: $7.000 → $8.100
UPDATE "ProductoLocal" SET "precio_venta" = 8100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2638 AND "precio_venta" IS NOT DISTINCT FROM 7000 AND "precio_costo" IS NOT DISTINCT FROM 6179.95 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL EXTREME OSITOS 500g · $7.316,96: $8.300 → $10.300
UPDATE "ProductoLocal" SET "precio_venta" = 10300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3020 AND "precio_venta" IS NOT DISTINCT FROM 8300 AND "precio_costo" IS NOT DISTINCT FROM 7316.96 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL EXTREME SANDIA · $7.316,96: $8.300 → $10.300
UPDATE "ProductoLocal" SET "precio_venta" = 10300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2931 AND "precio_venta" IS NOT DISTINCT FROM 8300 AND "precio_costo" IS NOT DISTINCT FROM 7316.96 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL FRUTILLA ACIDAS 500G · $5.930: $8.300 → $8.400
UPDATE "ProductoLocal" SET "precio_venta" = 8400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2275 AND "precio_venta" IS NOT DISTINCT FROM 8300 AND "precio_costo" IS NOT DISTINCT FROM 5930 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL MASTI FYL · $8.935,45: $10.900 → $12.600
UPDATE "ProductoLocal" SET "precio_venta" = 12600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3536 AND "precio_venta" IS NOT DISTINCT FROM 10900 AND "precio_costo" IS NOT DISTINCT FROM 8935.45 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL MASTI UVA · $8.935,45: $10.900 → $12.600
UPDATE "ProductoLocal" SET "precio_venta" = 12600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3535 AND "precio_venta" IS NOT DISTINCT FROM 10900 AND "precio_costo" IS NOT DISTINCT FROM 8935.45 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Mogul Mini Twist Uva · $7.370,26: $7.800 → $9.600
UPDATE "ProductoLocal" SET "precio_venta" = 9600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6451 AND "precio_venta" IS NOT DISTINCT FROM 7800 AND "precio_costo" IS NOT DISTINCT FROM 7370.26 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · MOGUL OSITOS 500G · $7.316,96: $8.300 → $10.300
UPDATE "ProductoLocal" SET "precio_venta" = 10300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2932 AND "precio_venta" IS NOT DISTINCT FROM 8300 AND "precio_costo" IS NOT DISTINCT FROM 7316.96 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL VIBORITAS 30G · $8.731,07: $10.100 → $12.300
UPDATE "ProductoLocal" SET "precio_venta" = 12300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2933 AND "precio_venta" IS NOT DISTINCT FROM 10100 AND "precio_costo" IS NOT DISTINCT FROM 8731.07 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Oblea Bon O Bon Xl · $19.115: $24.800 → $24.900
UPDATE "ProductoLocal" SET "precio_venta" = 24900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2147 AND "precio_venta" IS NOT DISTINCT FROM 24800 AND "precio_costo" IS NOT DISTINCT FROM 19115 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Oblea Chocolina Max · $19.115: $24.800 → $24.900
UPDATE "ProductoLocal" SET "precio_venta" = 24900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3231 AND "precio_venta" IS NOT DISTINCT FROM 24800 AND "precio_costo" IS NOT DISTINCT FROM 19115 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Oblea Cofler Block Max · $22.262,44: $24.800 → $29.000
UPDATE "ProductoLocal" SET "precio_venta" = 29000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2422 AND "precio_venta" IS NOT DISTINCT FROM 24800 AND "precio_costo" IS NOT DISTINCT FROM 22262.44 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Pan Pancho Fucci · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2448 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Pascualina Tapa 14 · $22.700: $29.500 → $29.600
UPDATE "ProductoLocal" SET "precio_venta" = 29600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6217 AND "precio_venta" IS NOT DISTINCT FROM 29500 AND "precio_costo" IS NOT DISTINCT FROM 22700 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · PATRICHS VERDE · $3.802,20: $4.600 → $5.000
UPDATE "ProductoLocal" SET "precio_venta" = 5000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6423 AND "precio_venta" IS NOT DISTINCT FROM 4600 AND "precio_costo" IS NOT DISTINCT FROM 3802.2 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · PEP RUEDITAS PIZZA 74G · $1.650: $1.500 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2454 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Philips 10 · $36.103: $37.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6073 AND "precio_venta" IS NOT DISTINCT FROM 37000 AND "precio_costo" IS NOT DISTINCT FROM 36103 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · Philips 10 mentolado · $36.578: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6072 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36578 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · PITUSA BLACK · $26.100: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3008 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PITUSA CHOCOLATE · $26.100: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2458 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PITUSA FRUTILLA · $26.100: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2434 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PITUSA JALEA FRAMBUESA · $26.100: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2881 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PITUSA LIMON · $26.100: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3191 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PITUSA MERENGUE · $26.100: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2823 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PITUSA MOUSSE · $26.100: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2459 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PITUSA VAINILLA · $26.100: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2435 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE x1 BALANCE · $900: $800 → $1.200
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3366 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE X1 COCO Y VAINILLA · $900: $800 → $1.200
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3783 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE x1 HUMENTACION · $900: $800 → $1.200
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3362 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · poeet espiritu play · $14.100: $18.300 → $18.400
UPDATE "ProductoLocal" SET "precio_venta" = 18400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3566 AND "precio_venta" IS NOT DISTINCT FROM 18300 AND "precio_costo" IS NOT DISTINCT FROM 14100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POETT PERFUMINA ALEGRA TU DIA · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3074 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POETT PERFUMINA ESPIRITU PLAY · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3086 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POETT PERFUMINA FRESCURA TROPICAL · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3618 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POETT PERFUMINA LAVANDA · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2490 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Poett Perfumina musica en Primavera · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2491 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POETT PERFUMINA MUSICA EN PRIMAVERA · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3233 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POETT PERFUMINA SOLO PARA TI · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2492 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POETT PERFUMINA SUAVIDAD ALGODON · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3047 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POETT PERFUMINA SUAVIDAD BEBE · $16.800: $21.800 → $21.900
UPDATE "ProductoLocal" SET "precio_venta" = 21900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2489 AND "precio_venta" IS NOT DISTINCT FROM 21800 AND "precio_costo" IS NOT DISTINCT FROM 16800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POP EVOLUTION CHUPETIN AZUL 24U · $5.460,02: $6.000 → $7.700
UPDATE "ProductoLocal" SET "precio_venta" = 7700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2171 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 5460.02 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POP EVOLUTION CHUPETIN ROJO · $5.459,98: $6.000 → $7.700
UPDATE "ProductoLocal" SET "precio_venta" = 7700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2172 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 5459.98 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Puflitos · $4.955: $6.400 → $6.500
UPDATE "ProductoLocal" SET "precio_venta" = 6500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6364 AND "precio_venta" IS NOT DISTINCT FROM 6400 AND "precio_costo" IS NOT DISTINCT FROM 4955 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · QUENTO ARROZ 92G · $1.320: $1.300 → $1.800
UPDATE "ProductoLocal" SET "precio_venta" = 1800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3930 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1320 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Queso Sardo La Verona · $16.300: $22.800 → $22.900
UPDATE "ProductoLocal" SET "precio_venta" = 22900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6709 AND "precio_venta" IS NOT DISTINCT FROM 22800 AND "precio_costo" IS NOT DISTINCT FROM 16300 AND "margen" IS NOT DISTINCT FROM 40;

-- mini el 7 · RAMEN CARNE 70G · $1.175: $1.500 → $1.600
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3451 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1175 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAMEN CUP CARNE · $28.929,82: $35.500 → $37.700
UPDATE "ProductoLocal" SET "precio_venta" = 37700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6826 AND "precio_venta" IS NOT DISTINCT FROM 35500 AND "precio_costo" IS NOT DISTINCT FROM 28929.82 AND "margen" IS NOT DISTINCT FROM 30.18;

-- mini el 7 · RAMEN CUP POLLO · $28.929,82: $35.500 → $37.700
UPDATE "ProductoLocal" SET "precio_venta" = 37700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6824 AND "precio_venta" IS NOT DISTINCT FROM 35500 AND "precio_costo" IS NOT DISTINCT FROM 28929.82 AND "margen" IS NOT DISTINCT FROM 30.18;

-- mini el 7 · RAMEN CUP POLLO PICANTE · $28.929,82: $35.500 → $37.700
UPDATE "ProductoLocal" SET "precio_venta" = 37700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6822 AND "precio_venta" IS NOT DISTINCT FROM 35500 AND "precio_costo" IS NOT DISTINCT FROM 28929.82 AND "margen" IS NOT DISTINCT FROM 30.18;

-- mini el 7 · RAMEN POLLO PICANTE 70G · $1.307,02: $1.500 → $1.700
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3427 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1307.02 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RASTA ARGENTRICO · $19.700: $25.700 → $25.800
UPDATE "ProductoLocal" SET "precio_venta" = 25800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3756 AND "precio_venta" IS NOT DISTINCT FROM 25700 AND "precio_costo" IS NOT DISTINCT FROM 19700 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Rasta Blanco X18 · $17.800: $23.200 → $23.300
UPDATE "ProductoLocal" SET "precio_venta" = 23300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2530 AND "precio_venta" IS NOT DISTINCT FROM 23200 AND "precio_costo" IS NOT DISTINCT FROM 17800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Rasta Negro X18 · $17.800: $23.200 → $23.300
UPDATE "ProductoLocal" SET "precio_venta" = 23300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2531 AND "precio_venta" IS NOT DISTINCT FROM 23200 AND "precio_costo" IS NOT DISTINCT FROM 17800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RASTA TRICO MAICENA · $19.700: $25.700 → $25.800
UPDATE "ProductoLocal" SET "precio_venta" = 25800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6742 AND "precio_venta" IS NOT DISTINCT FROM 25700 AND "precio_costo" IS NOT DISTINCT FROM 19700 AND "margen" IS NOT DISTINCT FROM 30.46;

-- mini el 7 · RASTA TRICOLOR · $19.700: $25.700 → $25.800
UPDATE "ProductoLocal" SET "precio_venta" = 25800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6743 AND "precio_venta" IS NOT DISTINCT FROM 25700 AND "precio_costo" IS NOT DISTINCT FROM 19700 AND "margen" IS NOT DISTINCT FROM 30.46;

-- mini el 7 · REX 75g · $1.180: $1.500 → $1.600
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3442 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1180 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA BOLILLA ACTIVE EMOTION · $2.638,95: $2.100 → $3.500
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3186 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA BOLILLA INVISIBLE 50ML · $2.639,07: $2.100 → $3.500
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2516 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2639.07 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA BOLILLA NUTRITIVE 50ML · $2.638,95: $2.100 → $3.500
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2517 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA BOLILLA POWDER DRY · $2.638,95: $2.100 → $3.500
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3185 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA BOLILLA V8 50ML · $2.639,07: $2.100 → $3.500
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2518 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2639.07 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA CLINICAL CLASSIC CREMA VIOLETA · $11.144,04: $8.000 → $14.500
UPDATE "ProductoLocal" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3938 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 11144.04 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA CLINICAL CLASSIC CREMA ROSA · $11.144,04: $8.000 → $14.500
UPDATE "ProductoLocal" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3937 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 11144.04 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Rexona Crema Sensible · $2.560: $3.300 → $3.400
UPDATE "ProductoLocal" SET "precio_venta" = 3400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6691 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2560 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · REXONA TALCO 200 · $5.100,61: $6.200 → $6.700
UPDATE "ProductoLocal" SET "precio_venta" = 6700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2230 AND "precio_venta" IS NOT DISTINCT FROM 6200 AND "precio_costo" IS NOT DISTINCT FROM 5100.61 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA X3 BAMBOO · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2522 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA X3 SENSIBLE · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2524 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Rocklet confitados 20gr · $18.371,44: $20.500 → $23.900
UPDATE "ProductoLocal" SET "precio_venta" = 23900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2544 AND "precio_venta" IS NOT DISTINCT FROM 20500 AND "precio_costo" IS NOT DISTINCT FROM 18371.44 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ROCKLETS MUNDIAL 20G · $15.792: $20.600 → $20.700
UPDATE "ProductoLocal" SET "precio_venta" = 20700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6840 AND "precio_venta" IS NOT DISTINCT FROM 20600 AND "precio_costo" IS NOT DISTINCT FROM 15792 AND "margen" IS NOT DISTINCT FROM 30.45;

-- mini el 7 · ROSAMONTE SUAVE YERBA 500G · $16.400: $21.300 → $21.400
UPDATE "ProductoLocal" SET "precio_venta" = 21400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2817 AND "precio_venta" IS NOT DISTINCT FROM 21300 AND "precio_costo" IS NOT DISTINCT FROM 16400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SAL GRUESA · $800: $1.000 → $1.100
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2736 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Salchichas Fela · $26.112: $33.900 → $34.000
UPDATE "ProductoLocal" SET "precio_venta" = 34000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6236 AND "precio_venta" IS NOT DISTINCT FROM 33900 AND "precio_costo" IS NOT DISTINCT FROM 26112 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · SALSA BLANCA ALICANTE 40g · $14.335,92: $16.800 → $18.700
UPDATE "ProductoLocal" SET "precio_venta" = 18700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3474 AND "precio_venta" IS NOT DISTINCT FROM 16800 AND "precio_costo" IS NOT DISTINCT FROM 14335.92 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SCHNEIDER LIMON 473 · $47.400: $61.700 → $61.800
UPDATE "ProductoLocal" SET "precio_venta" = 61800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9102 AND "precio_venta" IS NOT DISTINCT FROM 61700 AND "precio_costo" IS NOT DISTINCT FROM 47400 AND "margen" IS NOT DISTINCT FROM 30.17;

-- mini el 7 · SEDAL CERAMIDA ACONDICIONADOR 300ML · $31.200: $40.600 → $40.700
UPDATE "ProductoLocal" SET "precio_venta" = 40700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2552 AND "precio_venta" IS NOT DISTINCT FROM 40600 AND "precio_costo" IS NOT DISTINCT FROM 31200 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SHERIDAN S 750 · $26.420: $34.300 → $34.400
UPDATE "ProductoLocal" SET "precio_venta" = 34400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3496 AND "precio_venta" IS NOT DISTINCT FROM 34300 AND "precio_costo" IS NOT DISTINCT FROM 26420 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SKIP LIQUIDO 3LT · $10.399,66: $12.800 → $13.700
UPDATE "ProductoLocal" SET "precio_venta" = 13700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14048 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 10399.66 AND "margen" IS NOT DISTINCT FROM 30.93;

-- mini el 7 · SONRISA 108G X6 · $1.376,67: $1.500 → $1.800
UPDATE "ProductoLocal" SET "precio_venta" = 1800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2559 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1376.67 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · STELLA 710ML · $58.884: $76.600 → $76.700
UPDATE "ProductoLocal" SET "precio_venta" = 76700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2564 AND "precio_venta" IS NOT DISTINCT FROM 76600 AND "precio_costo" IS NOT DISTINCT FROM 58884 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Tabaco Pacha Mama · $23.250: $30.200 → $30.300
UPDATE "ProductoLocal" SET "precio_venta" = 30300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6188 AND "precio_venta" IS NOT DISTINCT FROM 30200 AND "precio_costo" IS NOT DISTINCT FROM 23250 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · TABLETA BONOBON 160grs · $6.619,91: $8.300 → $9.300
UPDATE "ProductoLocal" SET "precio_venta" = 9300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3298 AND "precio_venta" IS NOT DISTINCT FROM 8300 AND "precio_costo" IS NOT DISTINCT FROM 6619.91 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Talco fresh 100gr · $3.038,35: $3.700 → $4.000
UPDATE "ProductoLocal" SET "precio_venta" = 4000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3539 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3038.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TARRITO ORINA · $250: $300 → $400
UPDATE "ProductoLocal" SET "precio_venta" = 400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2614 AND "precio_venta" IS NOT DISTINCT FROM 300 AND "precio_costo" IS NOT DISTINCT FROM 250 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TATIN ALFAJOR 60G BLANCO · $17.896,66: $20.000 → $25.100
UPDATE "ProductoLocal" SET "precio_venta" = 25100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2463 AND "precio_venta" IS NOT DISTINCT FROM 20000 AND "precio_costo" IS NOT DISTINCT FROM 17896.66 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TATIN ALFAJOR 60G NEGRO · $17.896,66: $20.000 → $25.100
UPDATE "ProductoLocal" SET "precio_venta" = 25100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2057 AND "precio_venta" IS NOT DISTINCT FROM 20000 AND "precio_costo" IS NOT DISTINCT FROM 17896.66 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TE BOLDO TARAGUI X6 · $6.100: $7.900 → $8.000
UPDATE "ProductoLocal" SET "precio_venta" = 8000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2886 AND "precio_venta" IS NOT DISTINCT FROM 7900 AND "precio_costo" IS NOT DISTINCT FROM 6100 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TECNO LED 15W · $800: $1.000 → $1.100
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3784 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 800 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TEREPIN PEPAS 200G · $14.232: $18.500 → $18.600
UPDATE "ProductoLocal" SET "precio_venta" = 18600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2615 AND "precio_venta" IS NOT DISTINCT FROM 18500 AND "precio_costo" IS NOT DISTINCT FROM 14232 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TERRABUSI CHOCOLATE · $53.640: $69.800 → $69.900
UPDATE "ProductoLocal" SET "precio_venta" = 69900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6726 AND "precio_venta" IS NOT DISTINCT FROM 69800 AND "precio_costo" IS NOT DISTINCT FROM 53640 AND "margen" IS NOT DISTINCT FROM 30.13;

-- mini el 7 · TITA X19GR · $28.250: $36.800 → $36.900
UPDATE "ProductoLocal" SET "precio_venta" = 36900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13993 AND "precio_venta" IS NOT DISTINCT FROM 36800 AND "precio_costo" IS NOT DISTINCT FROM 28250 AND "margen" IS NOT DISTINCT FROM 30.27;

-- mini el 7 · Toallas húmedas huggies x48 · $3.077,30: $3.300 → $4.100
UPDATE "ProductoLocal" SET "precio_venta" = 4100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6604 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 3077.3 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · tofi 55grs negro · $44.573,14: $50.100 → $58.000
UPDATE "ProductoLocal" SET "precio_venta" = 58000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3232 AND "precio_venta" IS NOT DISTINCT FROM 50100 AND "precio_costo" IS NOT DISTINCT FROM 44573.14 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TOSTEX CEBOLLA · $1.113,67: $1.400 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9192 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1113.67 AND "margen" IS NOT DISTINCT FROM 33.33;

-- mini el 7 · TOSTEX OLIVA · $1.113,67: $1.000 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9189 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 1113.67 AND "margen" IS NOT DISTINCT FROM 0;

-- mini el 7 · TRAPO DE PISO GRIS FIBRAN · $960: $1.200 → $1.300
UPDATE "ProductoLocal" SET "precio_venta" = 1300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3569 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 960 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TRAPO DE PISO SECA MAS · $480: $600 → $700
UPDATE "ProductoLocal" SET "precio_venta" = 700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2629 AND "precio_venta" IS NOT DISTINCT FROM 600 AND "precio_costo" IS NOT DISTINCT FROM 480 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · trapo piso blanco fibran · $952: $1.200 → $1.300
UPDATE "ProductoLocal" SET "precio_venta" = 1300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2991 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 952 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TRAVIATA REX 96G · $841,30: $900 → $1.100
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2479 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 841.3 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TREGAR DULCE DE LECHE 400g · $1.955: $2.500 → $2.600
UPDATE "ProductoLocal" SET "precio_venta" = 2600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3253 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1955 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TRES PATITOS FOSFOROS ARGENTINA 222 · $650: $800 → $900
UPDATE "ProductoLocal" SET "precio_venta" = 900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2252 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 650 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Tripack Pepito · $4.850: $6.300 → $6.400
UPDATE "ProductoLocal" SET "precio_venta" = 6400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6673 AND "precio_venta" IS NOT DISTINCT FROM 6300 AND "precio_costo" IS NOT DISTINCT FROM 4850 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · unipox x unidad · $11.480: $14.900 → $15.000
UPDATE "ProductoLocal" SET "precio_venta" = 15000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2712 AND "precio_venta" IS NOT DISTINCT FROM 14900 AND "precio_costo" IS NOT DISTINCT FROM 11480 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · vaso cotar frutilla 190g · $780: $900 → $1.100
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6121 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 780 AND "margen" IS NOT DISTINCT FROM 30;

-- mini el 7 · VINO PERRO CALLEJERO · $27.090: $35.200 → $35.300
UPDATE "ProductoLocal" SET "precio_venta" = 35300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2740 AND "precio_venta" IS NOT DISTINCT FROM 35200 AND "precio_costo" IS NOT DISTINCT FROM 27090 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · VINO TORO TETRA BLANCO 1L · $16.400: $21.300 → $21.400
UPDATE "ProductoLocal" SET "precio_venta" = 21400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2476 AND "precio_venta" IS NOT DISTINCT FROM 21300 AND "precio_costo" IS NOT DISTINCT FROM 16400 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · WASSINGTON POMADA LIQUIDA NEGRO · $3.466: $4.500 → $4.600
UPDATE "ProductoLocal" SET "precio_venta" = 4600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3267 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3466 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · WHITE HORSE WHISKY 750ML · $73.278: $92.000 → $95.300
UPDATE "ProductoLocal" SET "precio_venta" = 95300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3667 AND "precio_venta" IS NOT DISTINCT FROM 92000 AND "precio_costo" IS NOT DISTINCT FROM 73278 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ala 800 lavado total con bica · $60.120: $79.200 → $79.300
UPDATE "ProductoLocal" SET "precio_venta" = 79300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14649 AND "precio_venta" IS NOT DISTINCT FROM 79200 AND "precio_costo" IS NOT DISTINCT FROM 60120 AND "margen" IS NOT DISTINCT FROM 31.74;

-- Minimarket ayala · ALA DETERGENTE CONCENTRADO 300ML LIMON · $19.749,36: $26.400 → $26.500
UPDATE "ProductoLocal" SET "precio_venta" = 26500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9876 AND "precio_venta" IS NOT DISTINCT FROM 26400 AND "precio_costo" IS NOT DISTINCT FROM 19749.36 AND "margen" IS NOT DISTINCT FROM 33.68;

-- Minimarket ayala · ALA POLVO 400GR MATIC BICARBONATO · $31.636,08: $48.000 → $48.100
UPDATE "ProductoLocal" SET "precio_venta" = 48100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9852 AND "precio_venta" IS NOT DISTINCT FROM 48000 AND "precio_costo" IS NOT DISTINCT FROM 31636.08 AND "margen" IS NOT DISTINCT FROM 51.73;

-- Minimarket ayala · ALF. B&N BLANCO 73 5g · $1.442,22: $1.800 → $1.900
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9909 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1442.22 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · ALFAJOR FANTOCHE BLANCO · $17.614,56: $24.000 → $26.000
UPDATE "ProductoLocal" SET "precio_venta" = 26000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10027 AND "precio_venta" IS NOT DISTINCT FROM 24000 AND "precio_costo" IS NOT DISTINCT FROM 17614.56 AND "margen" IS NOT DISTINCT FROM 47.06;

-- Minimarket ayala · ALFAJOR FULBITO · $9.100: $11.800 → $11.900
UPDATE "ProductoLocal" SET "precio_venta" = 11900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10545 AND "precio_venta" IS NOT DISTINCT FROM 11800 AND "precio_costo" IS NOT DISTINCT FROM 9100 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · ALKA ACIDO · $10.100: $13.100 → $13.200
UPDATE "ProductoLocal" SET "precio_venta" = 13200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10829 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 10100 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · AMSTEL LAGER 473 · $35.400: $46.100 → $46.200
UPDATE "ProductoLocal" SET "precio_venta" = 46200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13985 AND "precio_venta" IS NOT DISTINCT FROM 46100 AND "precio_costo" IS NOT DISTINCT FROM 35400 AND "margen" IS NOT DISTINCT FROM 30.23;

-- Minimarket ayala · AZAFRAN MOLIDO X2 · $5.425,46: $5.600 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10588 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 5425.46 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Beldent Inf Azul 26 6g · $19.637: $25.500 → $25.600
UPDATE "ProductoLocal" SET "precio_venta" = 25600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9919 AND "precio_venta" IS NOT DISTINCT FROM 25500 AND "precio_costo" IS NOT DISTINCT FROM 19637 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Beldent Inf Verde 26.6g · $19.634: $25.500 → $25.600
UPDATE "ProductoLocal" SET "precio_venta" = 25600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9923 AND "precio_venta" IS NOT DISTINCT FROM 25500 AND "precio_costo" IS NOT DISTINCT FROM 19634 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BELDENT MENTOL AZUL · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9921 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BELDENT NEGRO MENTA FUERTE · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9904 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BELDENT ROJO · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10746 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BELDENT ROSA · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9920 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Beldent sandia · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11545 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BELDENT TROPICAL · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11526 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BELDENT VERDE MENTA · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9522 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BUBBALOO FRUTILLA ROJO · $5.480: $7.100 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9955 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 5480 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BUBBALOO MENTA CELESTE · $5.480: $7.100 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9956 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 5480 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BUBBALOO TUTTI FRUTI ROSA · $5.480: $7.100 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9947 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 5480 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · BUBBALOO UVA VIOLETA · $5.480: $7.100 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10832 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 5480 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Camel 10 · $40.380: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10423 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40380 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · CERVEZA IGUANA 1L · $25.500: $36.000 → $36.100
UPDATE "ProductoLocal" SET "precio_venta" = 36100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9749 AND "precio_venta" IS NOT DISTINCT FROM 36000 AND "precio_costo" IS NOT DISTINCT FROM 25500 AND "margen" IS NOT DISTINCT FROM 41.18;

-- Minimarket ayala · Chester 10 · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9484 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Chester 10 mentolado · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9501 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · CHOCOLINA 250G · $2.179,72: $2.400 → $2.900
UPDATE "ProductoLocal" SET "precio_venta" = 2900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9976 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 2179.72 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · CHUPETIN CRAZY POP FRUTILLA · $2.410: $3.100 → $3.200
UPDATE "ProductoLocal" SET "precio_venta" = 3200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9563 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 2410 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · CHUPETIN CRAZY POP x1 UVA · $2.410: $3.100 → $3.200
UPDATE "ProductoLocal" SET "precio_venta" = 3200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9985 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 2410 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · COCA COLA 2L · $23.333,33: $30.400 → $30.500
UPDATE "ProductoLocal" SET "precio_venta" = 30500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9995 AND "precio_venta" IS NOT DISTINCT FROM 30400 AND "precio_costo" IS NOT DISTINCT FROM 23333.33 AND "margen" IS NOT DISTINCT FROM 30.29;

-- Minimarket ayala · Coca cola 2L zero · $23.333,33: $30.400 → $30.500
UPDATE "ProductoLocal" SET "precio_venta" = 30500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10007 AND "precio_venta" IS NOT DISTINCT FROM 30400 AND "precio_costo" IS NOT DISTINCT FROM 23333.33 AND "margen" IS NOT DISTINCT FROM 30.29;

-- Minimarket ayala · crazy pop x5 naranja · $2.410: $3.100 → $3.200
UPDATE "ProductoLocal" SET "precio_venta" = 3200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9986 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 2410 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Crema de Leche Cremac · $36.960: $52.800 → $52.900
UPDATE "ProductoLocal" SET "precio_venta" = 52900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9819 AND "precio_venta" IS NOT DISTINCT FROM 52800 AND "precio_costo" IS NOT DISTINCT FROM 36960 AND "margen" IS NOT DISTINCT FROM 42.86;

-- Minimarket ayala · CREMINO SURTIDOS X940GR · $12.482,04: $15.600 → $16.300
UPDATE "ProductoLocal" SET "precio_venta" = 16300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13824 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12482.04 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · DULCOR MERMELADA 500g FRUTILLA · $1.630: $2.100 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9390 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1630 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · EXQUISITA FLAN DDL · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11571 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;

-- Minimarket ayala · EXQUISITA FLAN VAINILLA · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11540 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;

-- Minimarket ayala · FANTA 2L · $23.333,33: $30.400 → $30.500
UPDATE "ProductoLocal" SET "precio_venta" = 30500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10026 AND "precio_venta" IS NOT DISTINCT FROM 30400 AND "precio_costo" IS NOT DISTINCT FROM 23333.33 AND "margen" IS NOT DISTINCT FROM 30.29;

-- Minimarket ayala · Flan Cotar · $750: $700 → $1.000
UPDATE "ProductoLocal" SET "precio_venta" = 1000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9712 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM -6.67;

-- Minimarket ayala · GAJOS FRUTALES 485G · $4.600,34: $5.800 → $6.000
UPDATE "ProductoLocal" SET "precio_venta" = 6000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10727 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 4600.34 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Hamburguesa Paty Clasica x2 · $61.703: $84.000 → $84.100
UPDATE "ProductoLocal" SET "precio_venta" = 84100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9642 AND "precio_venta" IS NOT DISTINCT FROM 84000 AND "precio_costo" IS NOT DISTINCT FROM 61703 AND "margen" IS NOT DISTINCT FROM 36.14;

-- Minimarket ayala · Harina Pizza Pureza · $16.667,40: $20.000 → $21.800
UPDATE "ProductoLocal" SET "precio_venta" = 21800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9684 AND "precio_venta" IS NOT DISTINCT FROM 20000 AND "precio_costo" IS NOT DISTINCT FROM 16667.4 AND "margen" IS NOT DISTINCT FROM 30.72;

-- Minimarket ayala · HELLMANNS MAYONESA 250G · $30.982,56: $40.800 → $40.900
UPDATE "ProductoLocal" SET "precio_venta" = 40900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10162 AND "precio_venta" IS NOT DISTINCT FROM 40800 AND "precio_costo" IS NOT DISTINCT FROM 30982.56 AND "margen" IS NOT DISTINCT FROM 31.69;

-- Minimarket ayala · HUEVO KINDER NENA · $26.600: $37.300 → $37.400
UPDATE "ProductoLocal" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10822 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 26600 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · HUEVO KINDER NENE · $26.600: $37.300 → $37.400
UPDATE "ProductoLocal" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10830 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 26600 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · JABON REXONA X3 COTTON FRESH · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9590 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LA VIRGINIA CAFE EQUILIBRADO 125G · $2.947,64: $3.500 → $3.900
UPDATE "ProductoLocal" SET "precio_venta" = 3900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10961 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2947.64 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · la Yapa 36 U · $10.410: $13.500 → $13.600
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10383 AND "precio_venta" IS NOT DISTINCT FROM 13500 AND "precio_costo" IS NOT DISTINCT FROM 10410 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · LIMZUL 3L · $6.600: $6.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11517 AND "precio_venta" IS NOT DISTINCT FROM 6500 AND "precio_costo" IS NOT DISTINCT FROM 6600 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LINA PROTECTORES · $61.827: $78.000 → $78.100
UPDATE "ProductoLocal" SET "precio_venta" = 78100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10240 AND "precio_venta" IS NOT DISTINCT FROM 78000 AND "precio_costo" IS NOT DISTINCT FROM 61827 AND "margen" IS NOT DISTINCT FROM 26.16;

-- Minimarket ayala · LINA TOALLITAS NOCTURNA · $86.400: $110.400 → $110.500
UPDATE "ProductoLocal" SET "precio_venta" = 110500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10372 AND "precio_venta" IS NOT DISTINCT FROM 110400 AND "precio_costo" IS NOT DISTINCT FROM 86400 AND "margen" IS NOT DISTINCT FROM 27.78;

-- Minimarket ayala · Lucky 10 · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9525 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 5.61;

-- Minimarket ayala · Lucky 10 mentolado · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9542 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Lucky 10 origen convertible · $5.658.000: $5.658.000 → $5.660.000
UPDATE "ProductoLocal" SET "precio_venta" = 5660000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14523 AND "precio_venta" IS NOT DISTINCT FROM 5658000 AND "precio_costo" IS NOT DISTINCT FROM 5658000 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Lucky 20 Menta Comun · $56.460: $57.000 → $114.000
UPDATE "ProductoLocal" SET "precio_venta" = 114000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9615 AND "precio_venta" IS NOT DISTINCT FROM 57000 AND "precio_costo" IS NOT DISTINCT FROM 56460 AND "margen" IS NOT DISTINCT FROM 6.62;

-- Minimarket ayala · LUX X3 LIRIO AZUL · $3.407,33: $3.000 → $4.500
UPDATE "ProductoLocal" SET "precio_venta" = 4500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10145 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 3407.33 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · mani jamon · $6.250: $8.100 → $8.200
UPDATE "ProductoLocal" SET "precio_venta" = 8200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9539 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 6250 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · mani pizza · $6.250: $8.100 → $8.200
UPDATE "ProductoLocal" SET "precio_venta" = 8200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9556 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 6250 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Marlboro 10 · $40.272: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9357 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40272 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Marlboro 10 Uva · $39.840: $41.000 → $42.000
UPDATE "ProductoLocal" SET "precio_venta" = 42000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9514 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 39840 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Marlboro 20 Crafted suave · $40.260: $40.260 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9649 AND "precio_venta" IS NOT DISTINCT FROM 40260 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 0;

-- Minimarket ayala · MENTA CRISTAL 140g · $2.000: $2.800 → $2.900
UPDATE "ProductoLocal" SET "precio_venta" = 2900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10994 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MENTHOPLUS ZERO STRONG · $9.029,95: $10.700 → $11.800
UPDATE "ProductoLocal" SET "precio_venta" = 11800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10181 AND "precio_venta" IS NOT DISTINCT FROM 10700 AND "precio_costo" IS NOT DISTINCT FROM 9029.95 AND "margen" IS NOT DISTINCT FROM 30.49;

-- Minimarket ayala · MOGUL BANANITAS 30G · $6.777,26: $8.100 → $8.900
UPDATE "ProductoLocal" SET "precio_venta" = 8900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10815 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 6777.26 AND "margen" IS NOT DISTINCT FROM 31.28;

-- Minimarket ayala · MOGUL COLA 30gr · $6.777,26: $7.600 → $8.900
UPDATE "ProductoLocal" SET "precio_venta" = 8900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9820 AND "precio_venta" IS NOT DISTINCT FROM 7600 AND "precio_costo" IS NOT DISTINCT FROM 6777.26 AND "margen" IS NOT DISTINCT FROM 30.7;

-- Minimarket ayala · MOGUL EXTREME LENGUAS · $12.045,08: $13.100 → $15.700
UPDATE "ProductoLocal" SET "precio_venta" = 15700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10491 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 12045.08 AND "margen" IS NOT DISTINCT FROM 30.15;

-- Minimarket ayala · Mogul extreme mini gustnitos · $5.926: $7.700 → $7.800
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11274 AND "precio_venta" IS NOT DISTINCT FROM 7700 AND "precio_costo" IS NOT DISTINCT FROM 5926 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Mogul extreme tubito max 25gr · $12.045,08: $13.100 → $15.700
UPDATE "ProductoLocal" SET "precio_venta" = 15700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10341 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 12045.08 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Mogul Mini Twist Uva · $7.370,26: $7.800 → $9.600
UPDATE "ProductoLocal" SET "precio_venta" = 9600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9772 AND "precio_venta" IS NOT DISTINCT FROM 7800 AND "precio_costo" IS NOT DISTINCT FROM 7370.26 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Oso Acido 50g · $8.977,88: $10.300 → $11.800
UPDATE "ProductoLocal" SET "precio_venta" = 11800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10176 AND "precio_venta" IS NOT DISTINCT FROM 10300 AND "precio_costo" IS NOT DISTINCT FROM 8977.88 AND "margen" IS NOT DISTINCT FROM 31.21;

-- Minimarket ayala · Philips 10 · $36.103: $37.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9488 AND "precio_venta" IS NOT DISTINCT FROM 37000 AND "precio_costo" IS NOT DISTINCT FROM 36103 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Philips 10 mentolado · $36.578: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9489 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36578 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Philips 20 bluw select · $29.460: $30.000 → $33.500
UPDATE "ProductoLocal" SET "precio_venta" = 33500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14513 AND "precio_venta" IS NOT DISTINCT FROM 30000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 13.38;

-- Minimarket ayala · Queso Cascara Negra CLP · $11.500: $7.500 → $15.000
UPDATE "ProductoLocal" SET "precio_venta" = 15000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9818 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 11500 AND "margen" IS NOT DISTINCT FROM -34.78;

-- Minimarket ayala · QUILMES CERVEZA 1L · $34.000: $45.600 → $45.700
UPDATE "ProductoLocal" SET "precio_venta" = 45700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10227 AND "precio_venta" IS NOT DISTINCT FROM 45600 AND "precio_costo" IS NOT DISTINCT FROM 34000 AND "margen" IS NOT DISTINCT FROM 34.12;

-- Minimarket ayala · REXONA CLINICAL CLASSIC CREMA VIOLETA · $11.144,04: $10.400 → $14.500
UPDATE "ProductoLocal" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11453 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 11144.04 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA CLINICAL CLASSIC CREMA ROSA · $11.144,04: $10.400 → $14.500
UPDATE "ProductoLocal" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9476 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 11144.04 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA TALCO 200 · $5.100,61: $5.100 → $6.700
UPDATE "ProductoLocal" SET "precio_venta" = 6700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9577 AND "precio_venta" IS NOT DISTINCT FROM 5100 AND "precio_costo" IS NOT DISTINCT FROM 5100.61 AND "margen" IS NOT DISTINCT FROM -0.01;

-- Minimarket ayala · REXONA x1 ANTIBACTERIAL · $1.298,57: $900 → $1.700
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11281 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 1298.57 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA X3 BAMBOO · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10282 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA X3 SENSIBLE · $3.261,01: $2.900 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9594 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ROCKLETS MUNDIAL 20G · $15.792: $20.600 → $20.700
UPDATE "ProductoLocal" SET "precio_venta" = 20700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9435 AND "precio_venta" IS NOT DISTINCT FROM 20600 AND "precio_costo" IS NOT DISTINCT FROM 15792 AND "margen" IS NOT DISTINCT FROM 30.45;

-- Minimarket ayala · SCHNEIDER 473 · $34.000: $48.000 → $48.100
UPDATE "ProductoLocal" SET "precio_venta" = 48100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10592 AND "precio_venta" IS NOT DISTINCT FROM 48000 AND "precio_costo" IS NOT DISTINCT FROM 34000 AND "margen" IS NOT DISTINCT FROM 41.18;

-- Minimarket ayala · SCHNEIDER LIMON 473 · $47.400: $61.700 → $61.800
UPDATE "ProductoLocal" SET "precio_venta" = 61800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9886 AND "precio_venta" IS NOT DISTINCT FROM 61700 AND "precio_costo" IS NOT DISTINCT FROM 47400 AND "margen" IS NOT DISTINCT FROM 30.17;

-- Minimarket ayala · SKIP LIQUIDO 3LT · $10.399,66: $12.800 → $13.700
UPDATE "ProductoLocal" SET "precio_venta" = 13700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14050 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 10399.66 AND "margen" IS NOT DISTINCT FROM 30.93;

-- Minimarket ayala · SPEED XL · $23.500: $34.800 → $34.900
UPDATE "ProductoLocal" SET "precio_venta" = 34900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10296 AND "precio_venta" IS NOT DISTINCT FROM 34800 AND "precio_costo" IS NOT DISTINCT FROM 23500 AND "margen" IS NOT DISTINCT FROM 48.09;

-- Minimarket ayala · SPRITE 2L · $23.333,33: $30.400 → $30.500
UPDATE "ProductoLocal" SET "precio_venta" = 30500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10313 AND "precio_venta" IS NOT DISTINCT FROM 30400 AND "precio_costo" IS NOT DISTINCT FROM 23333.33 AND "margen" IS NOT DISTINCT FROM 30.29;

-- Minimarket ayala · STELLA 710ML · $58.884: $76.600 → $76.700
UPDATE "ProductoLocal" SET "precio_venta" = 76700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10281 AND "precio_venta" IS NOT DISTINCT FROM 76600 AND "precio_costo" IS NOT DISTINCT FROM 58884 AND "margen" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · TERRABUSI CHOCOLATE · $53.640: $69.800 → $69.900
UPDATE "ProductoLocal" SET "precio_venta" = 69900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11462 AND "precio_venta" IS NOT DISTINCT FROM 69800 AND "precio_costo" IS NOT DISTINCT FROM 53640 AND "margen" IS NOT DISTINCT FROM 30.13;

-- Minimarket ayala · Tic tac citrus · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11450 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Tic tac frutilla · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10755 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Tic tac frutilla y crema · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11187 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Tic tac menta · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10380 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Tic tac menta fresca · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11195 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Tic tac mix de frutas · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10756 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Tic tac naranja · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10761 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TITA X19GR · $28.250: $36.800 → $36.900
UPDATE "ProductoLocal" SET "precio_venta" = 36900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13995 AND "precio_venta" IS NOT DISTINCT FROM 36800 AND "precio_costo" IS NOT DISTINCT FROM 28250 AND "margen" IS NOT DISTINCT FROM 30.27;

-- Minimarket ayala · TOP LINE MENTA FRESCA DEFENSE 6.u7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10938 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Topline 7 ultra blueberry 24gr · $19.567,59: $23.300 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11182 AND "precio_venta" IS NOT DISTINCT FROM 23300 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPLINE 7 ULTRA CLEAN MINT 24gr · $19.567,59: $23.300 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11181 AND "precio_venta" IS NOT DISTINCT FROM 23300 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPLINE 7 ULTRA GREEN MINT 24gr · $19.567,59: $23.300 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11183 AND "precio_venta" IS NOT DISTINCT FROM 23300 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 30.15;

-- Minimarket ayala · TOPLINE 7 ULTRA RED BERRY 24gr · $19.567,59: $23.300 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11184 AND "precio_venta" IS NOT DISTINCT FROM 23300 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPLINE MENTA VERDE 6.7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10546 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPLINE STRONG NEGRO 6.7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10547 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Topline7 Mandarina Naranja 14g · $10.651: $13.800 → $13.900
UPDATE "ProductoLocal" SET "precio_venta" = 13900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9377 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 10651 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPLINE7 SANDIA MANIA 14gr · $13.067,63: $13.800 → $17.000
UPDATE "ProductoLocal" SET "precio_venta" = 17000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10355 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 13067.63 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · Topline7 Strong Negro 14g · $13.067,63: $13.800 → $17.000
UPDATE "ProductoLocal" SET "precio_venta" = 17000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10373 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 13067.63 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPLINE7 VIBRANT STRAWBERRY 14gr · $10.651: $13.800 → $13.900
UPDATE "ProductoLocal" SET "precio_venta" = 13900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10358 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 10651 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPLINE7 VIOLET CHERRY 14gr · $10.651: $13.800 → $13.900
UPDATE "ProductoLocal" SET "precio_venta" = 13900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10359 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 10651 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPLINE7 X- PLOSIVE MINT 14gr · $13.067,63: $13.800 → $17.000
UPDATE "ProductoLocal" SET "precio_venta" = 17000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10375 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 13067.63 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TOPPLINE ROJO 6.7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10535 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Minimarket ayala · TRIMACER ARROZ 500G · $6.982,20: $8.000 → $8.900
UPDATE "ProductoLocal" SET "precio_venta" = 8900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9912 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 6982.2 AND "margen" IS NOT DISTINCT FROM 26.98;

-- Minimarket ayala · Turron arcor · $13.690,71: $15.600 → $17.800
UPDATE "ProductoLocal" SET "precio_venta" = 17800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10426 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 13690.71 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · ALFAJOR FANTOCHE BLANCO · $17.614,56: $22.900 → $24.700
UPDATE "ProductoLocal" SET "precio_venta" = 24700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7441 AND "precio_venta" IS NOT DISTINCT FROM 22900 AND "precio_costo" IS NOT DISTINCT FROM 17614.56 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · ALICANTE OREGANO 25G · $12.700: $16.500 → $16.600
UPDATE "ProductoLocal" SET "precio_venta" = 16600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7146 AND "precio_venta" IS NOT DISTINCT FROM 16500 AND "precio_costo" IS NOT DISTINCT FROM 12700 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Alikal · $665,80: $1.000 → $1.100
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13874 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 665.8 AND "margen" IS NOT DISTINCT FROM 53.23;

-- Casiano casas · AMSTEL LAGER 473 · $35.400: $46.100 → $46.200
UPDATE "ProductoLocal" SET "precio_venta" = 46200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13984 AND "precio_venta" IS NOT DISTINCT FROM 46100 AND "precio_costo" IS NOT DISTINCT FROM 35400 AND "margen" IS NOT DISTINCT FROM 30.23;

-- Casiano casas · ARVEJAS LATA ELIO · $12.830,40: $15.300 → $16.700
UPDATE "ProductoLocal" SET "precio_venta" = 16700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7984 AND "precio_venta" IS NOT DISTINCT FROM 15300 AND "precio_costo" IS NOT DISTINCT FROM 12830.4 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · AZAFRAN MOLIDO X2 · $5.425,46: $5.600 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7988 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 5425.46 AND "margen" IS NOT DISTINCT FROM NULL;

-- Casiano casas · BASTON VIENA · $4.325,63: $5.900 → $6.100
UPDATE "ProductoLocal" SET "precio_venta" = 6100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7961 AND "precio_venta" IS NOT DISTINCT FROM 5900 AND "precio_costo" IS NOT DISTINCT FROM 4325.63 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · Bayaspirina · $161,04: $300 → $400
UPDATE "ProductoLocal" SET "precio_venta" = 400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13877 AND "precio_venta" IS NOT DISTINCT FROM 300 AND "precio_costo" IS NOT DISTINCT FROM 161.04 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · Beldent sandia · $12.640: $18.000 → $18.100
UPDATE "ProductoLocal" SET "precio_venta" = 18100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8920 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 42.41;

-- Casiano casas · BELDENT TROPICAL · $12.640: $18.000 → $18.100
UPDATE "ProductoLocal" SET "precio_venta" = 18100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8906 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 42.41;

-- Casiano casas · BELDENT VERDE MENTA · $12.640: $18.000 → $18.100
UPDATE "ProductoLocal" SET "precio_venta" = 18100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6986 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 42.41;

-- Casiano casas · Bon O Bon Blanco · $15.159,78: $17.800 → $21.400
UPDATE "ProductoLocal" SET "precio_venta" = 21400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7309 AND "precio_venta" IS NOT DISTINCT FROM 17800 AND "precio_costo" IS NOT DISTINCT FROM 15159.78 AND "margen" IS NOT DISTINCT FROM 40.71;

-- Casiano casas · Bon o Bon Chocolinas · $9.184,18: $10.800 → $13.000
UPDATE "ProductoLocal" SET "precio_venta" = 13000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7054 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 9184.18 AND "margen" IS NOT DISTINCT FROM 40.99;

-- Casiano casas · BON O BON COCO · $9.184,18: $10.800 → $13.000
UPDATE "ProductoLocal" SET "precio_venta" = 13000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7804 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 9184.18 AND "margen" IS NOT DISTINCT FROM 40.99;

-- Casiano casas · Bon O Bon Cookies · $9.184,18: $10.800 → $13.000
UPDATE "ProductoLocal" SET "precio_venta" = 13000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7046 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 9184.18 AND "margen" IS NOT DISTINCT FROM 40.99;

-- Casiano casas · Bon O Bon Negro · $15.159,78: $17.800 → $21.400
UPDATE "ProductoLocal" SET "precio_venta" = 21400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7044 AND "precio_venta" IS NOT DISTINCT FROM 17800 AND "precio_costo" IS NOT DISTINCT FROM 15159.78 AND "margen" IS NOT DISTINCT FROM 40.71;

-- Casiano casas · Bon O Bon Supreme · $18.131,82: $23.200 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7037 AND "precio_venta" IS NOT DISTINCT FROM 23200 AND "precio_costo" IS NOT DISTINCT FROM 18131.82 AND "margen" IS NOT DISTINCT FROM 40.52;

-- Casiano casas · Cabsha Tradicion Caja · $21.229,57: $26.200 → $29.900
UPDATE "ProductoLocal" SET "precio_venta" = 29900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7352 AND "precio_venta" IS NOT DISTINCT FROM 26200 AND "precio_costo" IS NOT DISTINCT FROM 21229.57 AND "margen" IS NOT DISTINCT FROM 40.48;

-- Casiano casas · Camel 10 · $40.380: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7828 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40380 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · CARAMELOS ALKA CREMOSO · $10.100: $14.100 → $14.200
UPDATE "ProductoLocal" SET "precio_venta" = 14200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8057 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10100 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · CARAMELOS ALKA MENTA VERDE · $10.100: $14.100 → $14.200
UPDATE "ProductoLocal" SET "precio_venta" = 14200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7881 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10100 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · Carpano 950ml · $74.880: $100.800 → $100.900
UPDATE "ProductoLocal" SET "precio_venta" = 100900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7398 AND "precio_venta" IS NOT DISTINCT FROM 100800 AND "precio_costo" IS NOT DISTINCT FROM 74880 AND "margen" IS NOT DISTINCT FROM 34.62;

-- Casiano casas · CEREAL MIX 207G AVENA Y CHOCOLATE · $1.988,52: $2.500 → $2.800
UPDATE "ProductoLocal" SET "precio_venta" = 2800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8112 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1988.52 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · CEREAL MIX 207G FRUTILLA Y CHIA · $1.988,52: $2.500 → $2.800
UPDATE "ProductoLocal" SET "precio_venta" = 2800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8036 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1988.52 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · CEREAL MIX 207G SEMILLA Y CHIPS · $1.988,52: $2.500 → $2.800
UPDATE "ProductoLocal" SET "precio_venta" = 2800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8037 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1988.52 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · CEREAL MIX AVENA Y PASAS · $1.988,52: $2.500 → $2.800
UPDATE "ProductoLocal" SET "precio_venta" = 2800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8039 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1988.52 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · CERVEZA IGUANA 1L · $25.500: $33.200 → $33.300
UPDATE "ProductoLocal" SET "precio_venta" = 33300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7178 AND "precio_venta" IS NOT DISTINCT FROM 33200 AND "precio_costo" IS NOT DISTINCT FROM 25500 AND "margen" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Chester 10 · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6960 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 12.28;

-- Casiano casas · Chester 10 mentolado · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6967 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 12.28;

-- Casiano casas · Chester 20 común · $49.980: $50.000 → $53.000
UPDATE "ProductoLocal" SET "precio_venta" = 53000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9286 AND "precio_venta" IS NOT DISTINCT FROM 50000 AND "precio_costo" IS NOT DISTINCT FROM 49980 AND "margen" IS NOT DISTINCT FROM 8.05;

-- Casiano casas · Chester 20 mentolado box · $54.300: $55.000 → $58.000
UPDATE "ProductoLocal" SET "precio_venta" = 58000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9292 AND "precio_venta" IS NOT DISTINCT FROM 55000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 7.37;

-- Casiano casas · chester 20 mentolado comun · $50.000: $50.000 → $53.000
UPDATE "ProductoLocal" SET "precio_venta" = 53000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7797 AND "precio_venta" IS NOT DISTINCT FROM 50000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM 8.05;

-- Casiano casas · Chester 20 Purple motion 2 box · $55.380: $56.000 → $59.000
UPDATE "ProductoLocal" SET "precio_venta" = 59000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9289 AND "precio_venta" IS NOT DISTINCT FROM 56000 AND "precio_costo" IS NOT DISTINCT FROM 55380 AND "margen" IS NOT DISTINCT FROM 5.15;

-- Casiano casas · Chicle Laxante · $565,70: $1.100 → $1.200
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13882 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 565.7 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · Chocolate Arcor Chocolinas · $29.595,99: $37.700 → $41.500
UPDATE "ProductoLocal" SET "precio_venta" = 41500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7118 AND "precio_venta" IS NOT DISTINCT FROM 37700 AND "precio_costo" IS NOT DISTINCT FROM 29595.99 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · Chocolate Cofler Yogurth Frutilla 20 x35g · $32.842,16: $41.200 → $46.100
UPDATE "ProductoLocal" SET "precio_venta" = 46100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8927 AND "precio_venta" IS NOT DISTINCT FROM 41200 AND "precio_costo" IS NOT DISTINCT FROM 32842.16 AND "margen" IS NOT DISTINCT FROM 40.14;

-- Casiano casas · Chocolatin Arcor 25g Blanco · $31.311,78: $38.700 → $43.900
UPDATE "ProductoLocal" SET "precio_venta" = 43900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6871 AND "precio_venta" IS NOT DISTINCT FROM 38700 AND "precio_costo" IS NOT DISTINCT FROM 31311.78 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · Chocolatin Arcor Leche 25g · $31.311,78: $37.700 → $43.900
UPDATE "ProductoLocal" SET "precio_venta" = 43900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7041 AND "precio_venta" IS NOT DISTINCT FROM 37700 AND "precio_costo" IS NOT DISTINCT FROM 31311.78 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · CHOCOLINA 250G · $2.179,72: $2.400 → $2.900
UPDATE "ProductoLocal" SET "precio_venta" = 2900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7391 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 2179.72 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · CITRIC X 1LTS · $46.400: $61.200 → $61.300
UPDATE "ProductoLocal" SET "precio_venta" = 61300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7849 AND "precio_venta" IS NOT DISTINCT FROM 61200 AND "precio_costo" IS NOT DISTINCT FROM 46400 AND "margen" IS NOT DISTINCT FROM 31.9;

-- Casiano casas · Cofler 3 Placeres 55gr · $29.595,99: $37.700 → $41.500
UPDATE "ProductoLocal" SET "precio_venta" = 41500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7112 AND "precio_venta" IS NOT DISTINCT FROM 37700 AND "precio_costo" IS NOT DISTINCT FROM 29595.99 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · Cofler Air Leche 55g · $34.106,63: $41.900 → $47.800
UPDATE "ProductoLocal" SET "precio_venta" = 47800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7415 AND "precio_venta" IS NOT DISTINCT FROM 41900 AND "precio_costo" IS NOT DISTINCT FROM 34106.63 AND "margen" IS NOT DISTINCT FROM 40.13;

-- Casiano casas · Cofler DDL 35g · $32.842,16: $44.000 → $50.400
UPDATE "ProductoLocal" SET "precio_venta" = 50400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7076 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 32842.16 AND "margen" IS NOT DISTINCT FROM 53.31;

-- Casiano casas · Cofler Rocklets 55g · $29.595,99: $37.700 → $41.500
UPDATE "ProductoLocal" SET "precio_venta" = 41500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7122 AND "precio_venta" IS NOT DISTINCT FROM 37700 AND "precio_costo" IS NOT DISTINCT FROM 29595.99 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · COLGATE DENTRIFICO 70G X12 · $22.200: $30.000 → $30.100
UPDATE "ProductoLocal" SET "precio_venta" = 30100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8336 AND "precio_venta" IS NOT DISTINCT FROM 30000 AND "precio_costo" IS NOT DISTINCT FROM 22200 AND "margen" IS NOT DISTINCT FROM 35.14;

-- Casiano casas · CONDIMENTO ARROZ 25G · $10.670,40: $15.000 → $15.600
UPDATE "ProductoLocal" SET "precio_venta" = 15600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7064 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 10670.4 AND "margen" IS NOT DISTINCT FROM 46.19;

-- Casiano casas · crazy pop x5 naranja · $2.410: $3.100 → $3.200
UPDATE "ProductoLocal" SET "precio_venta" = 3200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7400 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 2410 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · dea lavandina · $14.186,79: $18.400 → $18.500
UPDATE "ProductoLocal" SET "precio_venta" = 18500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7886 AND "precio_venta" IS NOT DISTINCT FROM 18400 AND "precio_costo" IS NOT DISTINCT FROM 14186.79 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · DIENTES 50gr · $8.977,94: $10.800 → $11.700
UPDATE "ProductoLocal" SET "precio_venta" = 11700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8123 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 8977.94 AND "margen" IS NOT DISTINCT FROM 30.02;

-- Casiano casas · DULCOR MERMELADA 500g FRUTILLA · $1.630: $2.100 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6883 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1630 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · EXQUISITA FLAN DDL · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9226 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;

-- Casiano casas · EXQUISITA FLAN VAINILLA · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9223 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;

-- Casiano casas · FERNET BRANCA 750ML · $166.860: $217.200 → $217.300
UPDATE "ProductoLocal" SET "precio_venta" = 217300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7429 AND "precio_venta" IS NOT DISTINCT FROM 217200 AND "precio_costo" IS NOT DISTINCT FROM 166860 AND "margen" IS NOT DISTINCT FROM 30.17;

-- Casiano casas · flynn paff manzana · $6.800: $16.100 → $16.200
UPDATE "ProductoLocal" SET "precio_venta" = 16200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8854 AND "precio_venta" IS NOT DISTINCT FROM 16100 AND "precio_costo" IS NOT DISTINCT FROM 6800 AND "margen" IS NOT DISTINCT FROM 137.29;

-- Casiano casas · FLYNN PAFF PINTA LENGUA · $6.800: $16.100 → $16.200
UPDATE "ProductoLocal" SET "precio_venta" = 16200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8680 AND "precio_venta" IS NOT DISTINCT FROM 16100 AND "precio_costo" IS NOT DISTINCT FROM 6800 AND "margen" IS NOT DISTINCT FROM 137.29;

-- Casiano casas · flynn paff uva · $6.800: $16.100 → $16.200
UPDATE "ProductoLocal" SET "precio_venta" = 16200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8681 AND "precio_venta" IS NOT DISTINCT FROM 16100 AND "precio_costo" IS NOT DISTINCT FROM 6800 AND "margen" IS NOT DISTINCT FROM 137.29;

-- Casiano casas · GAJOS FRUTALES 485G · $4.600,34: $5.800 → $6.000
UPDATE "ProductoLocal" SET "precio_venta" = 6000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8131 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 4600.34 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · GELATINA EXQUISITA FRUTILLA X15 · $13.700: $17.800 → $17.900
UPDATE "ProductoLocal" SET "precio_venta" = 17900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7995 AND "precio_venta" IS NOT DISTINCT FROM 17800 AND "precio_costo" IS NOT DISTINCT FROM 13700 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · GRANBY LIQUIDO 800ML VERDE · $25.151,16: $31.200 → $35.700
UPDATE "ProductoLocal" SET "precio_venta" = 35700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7506 AND "precio_venta" IS NOT DISTINCT FROM 31200 AND "precio_costo" IS NOT DISTINCT FROM 25151.16 AND "margen" IS NOT DISTINCT FROM 41.69;

-- Casiano casas · GUSANITOS ROCK extreme 40gr · $8.977,88: $11.600 → $12.600
UPDATE "ProductoLocal" SET "precio_venta" = 12600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8948 AND "precio_venta" IS NOT DISTINCT FROM 11600 AND "precio_costo" IS NOT DISTINCT FROM 8977.88 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · Harina 0000 Venado Tuerto X10 · $10.396: $12.000 → $13.000
UPDATE "ProductoLocal" SET "precio_venta" = 13000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7519 AND "precio_venta" IS NOT DISTINCT FROM 12000 AND "precio_costo" IS NOT DISTINCT FROM 10396 AND "margen" IS NOT DISTINCT FROM 24.93;

-- Casiano casas · Harina Blanca Flor Leudante · $27.950: $37.500 → $37.600
UPDATE "ProductoLocal" SET "precio_venta" = 37600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7505 AND "precio_venta" IS NOT DISTINCT FROM 37500 AND "precio_costo" IS NOT DISTINCT FROM 27950 AND "margen" IS NOT DISTINCT FROM 34.17;

-- Casiano casas · Harina Cañuelas 000 · $8.615,80: $10.400 → $11.300
UPDATE "ProductoLocal" SET "precio_venta" = 11300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8904 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 8615.8 AND "margen" IS NOT DISTINCT FROM 30.03;

-- Casiano casas · Harina Pizza Pureza · $16.667,40: $20.100 → $21.800
UPDATE "ProductoLocal" SET "precio_venta" = 21800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7123 AND "precio_venta" IS NOT DISTINCT FROM 20100 AND "precio_costo" IS NOT DISTINCT FROM 16667.4 AND "margen" IS NOT DISTINCT FROM 30.72;

-- Casiano casas · Harina Venado Tuerto Leudante · $11.658,90: $15.000 → $15.600
UPDATE "ProductoLocal" SET "precio_venta" = 15600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7482 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 11658.9 AND "margen" IS NOT DISTINCT FROM 33.75;

-- Casiano casas · HEINEKEN LATA 473 · $56.000: $74.400 → $74.500
UPDATE "ProductoLocal" SET "precio_venta" = 74500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8042 AND "precio_venta" IS NOT DISTINCT FROM 74400 AND "precio_costo" IS NOT DISTINCT FROM 56000 AND "margen" IS NOT DISTINCT FROM 32.86;

-- Casiano casas · Ibuevanol FORTE (amarillo) · $212,46: $400 → $500
UPDATE "ProductoLocal" SET "precio_venta" = 500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13887 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 212.46 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · JABON REXONA X3 COTTON FRESH · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7043 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 31.03;

-- Casiano casas · JABON REXONA X3 FUTBOL FANATICS · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8273 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 31.03;

-- Casiano casas · JABON REXONA X3 NUTRITIVE ORCHID · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8063 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 31.03;

-- Casiano casas · Jugo Arcor Limonada X Caja · $5.962,16: $6.600 → $7.900
UPDATE "ProductoLocal" SET "precio_venta" = 7900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8856 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM 31.74;

-- Casiano casas · LA HOJA YERBA 500G · $13.363,20: $16.400 → $17.400
UPDATE "ProductoLocal" SET "precio_venta" = 17400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8609 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 13363.2 AND "margen" IS NOT DISTINCT FROM 30.16;

-- Casiano casas · la Yapa 36 U · $10.410: $13.500 → $13.600
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7792 AND "precio_venta" IS NOT DISTINCT FROM 13500 AND "precio_costo" IS NOT DISTINCT FROM 10410 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Ladrillos extreme mundial 500gr · $6.160: $8.600 → $8.700
UPDATE "ProductoLocal" SET "precio_venta" = 8700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6855 AND "precio_venta" IS NOT DISTINCT FROM 8600 AND "precio_costo" IS NOT DISTINCT FROM 6160 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · Loratadina · $50,94: $100 → $200
UPDATE "ProductoLocal" SET "precio_venta" = 200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13896 AND "precio_venta" IS NOT DISTINCT FROM 100 AND "precio_costo" IS NOT DISTINCT FROM 50.94 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · Lucky 10 · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6992 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 0;

-- Casiano casas · Lucky 10 mentolado · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6999 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 7.89;

-- Casiano casas · Lucky 10 origen · $22.500: $25.000 → $27.000
UPDATE "ProductoLocal" SET "precio_venta" = 27000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14517 AND "precio_venta" IS NOT DISTINCT FROM 25000 AND "precio_costo" IS NOT DISTINCT FROM 22500 AND "margen" IS NOT DISTINCT FROM 200;

-- Casiano casas · Lucky 20 box · $62.346: $63.000 → $66.000
UPDATE "ProductoLocal" SET "precio_venta" = 66000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7104 AND "precio_venta" IS NOT DISTINCT FROM 63000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 5.55;

-- Casiano casas · Lucky 20 común · $58.000: $58.000 → $61.000
UPDATE "ProductoLocal" SET "precio_venta" = 61000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7090 AND "precio_venta" IS NOT DISTINCT FROM 58000 AND "precio_costo" IS NOT DISTINCT FROM 58000 AND "margen" IS NOT DISTINCT FROM 6.82;

-- Casiano casas · Lucky 20 convertible xl · $62.346: $63.000 → $66.000
UPDATE "ProductoLocal" SET "precio_venta" = 66000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7070 AND "precio_venta" IS NOT DISTINCT FROM 63000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 5.55;

-- Casiano casas · Lucky 20 Menta Comun · $56.460: $57.000 → $60.000
UPDATE "ProductoLocal" SET "precio_venta" = 60000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7058 AND "precio_venta" IS NOT DISTINCT FROM 57000 AND "precio_costo" IS NOT DISTINCT FROM 56460 AND "margen" IS NOT DISTINCT FROM 17.17;

-- Casiano casas · Lucky 20 Origen Menta Box · $43.500: $44.000 → $47.000
UPDATE "ProductoLocal" SET "precio_venta" = 47000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7049 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 12;

-- Casiano casas · Lucky 20 red · $29.460: $30.000 → $33.000
UPDATE "ProductoLocal" SET "precio_venta" = 33000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9274 AND "precio_venta" IS NOT DISTINCT FROM 30000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 10.2;

-- Casiano casas · Lucky 20 Silver · $54.300: $55.000 → $58.000
UPDATE "ProductoLocal" SET "precio_venta" = 58000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8081 AND "precio_venta" IS NOT DISTINCT FROM 55000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 7.37;

-- Casiano casas · Lucky origen 20 comun · $40.260: $41.000 → $44.000
UPDATE "ProductoLocal" SET "precio_venta" = 44000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6946 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 10.14;

-- Casiano casas · Lucky origen 20 común mentolado · $40.260: $41.000 → $44.000
UPDATE "ProductoLocal" SET "precio_venta" = 44000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7085 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 10.14;

-- Casiano casas · LUX X3 LIRIO AZUL · $3.407,33: $4.000 → $4.600
UPDATE "ProductoLocal" SET "precio_venta" = 4600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7557 AND "precio_venta" IS NOT DISTINCT FROM 4000 AND "precio_costo" IS NOT DISTINCT FROM 3407.33 AND "margen" IS NOT DISTINCT FROM 32.45;

-- Casiano casas · MANA 136g · $1.070,74: $1.200 → $1.400
UPDATE "ProductoLocal" SET "precio_venta" = 1400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8886 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 1070.74 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · MANA VAINILLA x3 136G · $2.805,83: $3.300 → $3.700
UPDATE "ProductoLocal" SET "precio_venta" = 3700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7523 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2805.83 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · mani jamon · $6.250: $8.100 → $8.200
UPDATE "ProductoLocal" SET "precio_venta" = 8200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6998 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 6250 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · mani pizza · $6.250: $8.100 → $8.200
UPDATE "ProductoLocal" SET "precio_venta" = 8200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7012 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 6250 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Marlboro 10 · $40.272: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6859 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40272 AND "margen" IS NOT DISTINCT FROM 8.64;

-- Casiano casas · Marlboro 10 Uva · $39.840: $41.000 → $42.000
UPDATE "ProductoLocal" SET "precio_venta" = 42000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6979 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 39840 AND "margen" IS NOT DISTINCT FROM 9.86;

-- Casiano casas · Marlboro 20 Box · $69.000: $69.000 → $72.000
UPDATE "ProductoLocal" SET "precio_venta" = 72000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7062 AND "precio_venta" IS NOT DISTINCT FROM 69000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 4.92;

-- Casiano casas · marlboro 20 comun · $64.000: $64.000 → $67.000
UPDATE "ProductoLocal" SET "precio_venta" = 67000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7246 AND "precio_venta" IS NOT DISTINCT FROM 64000 AND "precio_costo" IS NOT DISTINCT FROM 64000 AND "margen" IS NOT DISTINCT FROM 5.36;

-- Casiano casas · Marlboro 20 coral XL · $69.000: $69.000 → $72.000
UPDATE "ProductoLocal" SET "precio_venta" = 72000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7069 AND "precio_venta" IS NOT DISTINCT FROM 69000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 4.92;

-- Casiano casas · Marlboro 20 Crafted Box · $43.500: $44.000 → $47.000
UPDATE "ProductoLocal" SET "precio_venta" = 47000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6980 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 12;

-- Casiano casas · Marlboro 20 crafted común · $40.260: $41.000 → $44.000
UPDATE "ProductoLocal" SET "precio_venta" = 44000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9277 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 10.14;

-- Casiano casas · Marlboro 20 crafted coral box · $43.500: $44.000 → $47.000
UPDATE "ProductoLocal" SET "precio_venta" = 47000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9283 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 12;

-- Casiano casas · Marlboro 20 Crafted menta box · $42.420: $43.000 → $46.000
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9268 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 42420 AND "margen" IS NOT DISTINCT FROM 15.07;

-- Casiano casas · Marlboro 20 crafted mentolado común · $40.260: $41.000 → $44.000
UPDATE "ProductoLocal" SET "precio_venta" = 44000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9280 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 10.14;

-- Casiano casas · Marlboro 20 Crafted suave · $40.260: $41.000 → $44.000
UPDATE "ProductoLocal" SET "precio_venta" = 44000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7093 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 10.14;

-- Casiano casas · Marlboro 20 Crafted Uva Box · $43.500: $44.000 → $47.000
UPDATE "ProductoLocal" SET "precio_venta" = 47000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6968 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 9.09;

-- Casiano casas · Marlboro 20 gold · $64.020: $65.000 → $68.000
UPDATE "ProductoLocal" SET "precio_venta" = 68000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7086 AND "precio_venta" IS NOT DISTINCT FROM 65000 AND "precio_costo" IS NOT DISTINCT FROM 64020 AND "margen" IS NOT DISTINCT FROM 6.19;

-- Casiano casas · Marlboro 20 menta box · $69.000: $69.000 → $72.000
UPDATE "ProductoLocal" SET "precio_venta" = 72000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7068 AND "precio_venta" IS NOT DISTINCT FROM 69000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 4.92;

-- Casiano casas · Marlboro 20 uva box · $69.000: $69.000 → $72.000
UPDATE "ProductoLocal" SET "precio_venta" = 72000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7060 AND "precio_venta" IS NOT DISTINCT FROM 69000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 4.92;

-- Casiano casas · Mejoralito · $220,39: $400 → $500
UPDATE "ProductoLocal" SET "precio_venta" = 500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13897 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 220.39 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · MENTA CRISTAL 140g · $2.000: $2.800 → $2.900
UPDATE "ProductoLocal" SET "precio_venta" = 2900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8381 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL;

-- Casiano casas · MENTHOPLUS CHERRY ROJO · $6.022,55: $9.600 → $9.700
UPDATE "ProductoLocal" SET "precio_venta" = 9700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7582 AND "precio_venta" IS NOT DISTINCT FROM 9600 AND "precio_costo" IS NOT DISTINCT FROM 6022.55 AND "margen" IS NOT DISTINCT FROM 60;

-- Casiano casas · MERENGADA 88G · $1.376,67: $1.600 → $1.900
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7546 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1376.67 AND "margen" IS NOT DISTINCT FROM 33.93;

-- Casiano casas · MOGUL ANILLOS 1Kg · $11.601,86: $15.100 → $16.300
UPDATE "ProductoLocal" SET "precio_venta" = 16300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7305 AND "precio_venta" IS NOT DISTINCT FROM 15100 AND "precio_costo" IS NOT DISTINCT FROM 11601.86 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · MOGUL BITES BAÑADAS 150g · $4.382,14: $5.500 → $6.300
UPDATE "ProductoLocal" SET "precio_venta" = 6300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8707 AND "precio_venta" IS NOT DISTINCT FROM 5500 AND "precio_costo" IS NOT DISTINCT FROM 4382.14 AND "margen" IS NOT DISTINCT FROM 42.49;

-- Casiano casas · MOGUL EUCALIPTUS · $11.601,86: $18.100 → $21.700
UPDATE "ProductoLocal" SET "precio_venta" = 21700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7951 AND "precio_venta" IS NOT DISTINCT FROM 18100 AND "precio_costo" IS NOT DISTINCT FROM 11601.86 AND "margen" IS NOT DISTINCT FROM 86.6;

-- Casiano casas · MOGUL EXTREME FRUTALES 35G · $6.179,95: $7.600 → $8.700
UPDATE "ProductoLocal" SET "precio_venta" = 8700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8176 AND "precio_venta" IS NOT DISTINCT FROM 7600 AND "precio_costo" IS NOT DISTINCT FROM 6179.95 AND "margen" IS NOT DISTINCT FROM 40.74;

-- Casiano casas · MOGUL EXTREME OSITOS 500g · $7.316,96: $17.500 → $21.600
UPDATE "ProductoLocal" SET "precio_venta" = 21600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8075 AND "precio_venta" IS NOT DISTINCT FROM 17500 AND "precio_costo" IS NOT DISTINCT FROM 7316.96 AND "margen" IS NOT DISTINCT FROM 195.11;

-- Casiano casas · MOGUL EXTREME TUBITOS 620G · $10.996,51: $15.000 → $18.600
UPDATE "ProductoLocal" SET "precio_venta" = 18600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7764 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 10996.51 AND "margen" IS NOT DISTINCT FROM 68.35;

-- Casiano casas · MOGUL EXTREME TUBITOS TUTTI FRUTTI 15G · $7.538,45: $10.000 → $10.700
UPDATE "ProductoLocal" SET "precio_venta" = 10700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8561 AND "precio_venta" IS NOT DISTINCT FROM 10000 AND "precio_costo" IS NOT DISTINCT FROM 7538.45 AND "margen" IS NOT DISTINCT FROM 40.74;

-- Casiano casas · MOGUL OSITOS 500G · $7.316,96: $19.000 → $23.500
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7967 AND "precio_venta" IS NOT DISTINCT FROM 19000 AND "precio_costo" IS NOT DISTINCT FROM 7316.96 AND "margen" IS NOT DISTINCT FROM 220.4;

-- Casiano casas · MOGUL VIBORITAS 30G · $8.731,07: $10.800 → $13.100
UPDATE "ProductoLocal" SET "precio_venta" = 13100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8016 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 8731.07 AND "margen" IS NOT DISTINCT FROM 49.27;

-- Casiano casas · Mylanta · $317,52: $600 → $700
UPDATE "ProductoLocal" SET "precio_venta" = 700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13899 AND "precio_venta" IS NOT DISTINCT FROM 600 AND "precio_costo" IS NOT DISTINCT FROM 317.52 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · Oblea Avellanas Max · $22.262,44: $27.200 → $31.700
UPDATE "ProductoLocal" SET "precio_venta" = 31700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7077 AND "precio_venta" IS NOT DISTINCT FROM 27200 AND "precio_costo" IS NOT DISTINCT FROM 22262.44 AND "margen" IS NOT DISTINCT FROM 42.26;

-- Casiano casas · OBLEA BON O BON BLANCO 30gr · $19.063,70: $28.000 → $28.100
UPDATE "ProductoLocal" SET "precio_venta" = 28100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7812 AND "precio_venta" IS NOT DISTINCT FROM 28000 AND "precio_costo" IS NOT DISTINCT FROM 19063.7 AND "margen" IS NOT DISTINCT FROM 46.88;

-- Casiano casas · OBLEA BON O BON LECHE 30gr · $19.063,70: $28.000 → $28.100
UPDATE "ProductoLocal" SET "precio_venta" = 28100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7808 AND "precio_venta" IS NOT DISTINCT FROM 28000 AND "precio_costo" IS NOT DISTINCT FROM 19063.7 AND "margen" IS NOT DISTINCT FROM 46.88;

-- Casiano casas · Oblea Chocolina Max · $22.262,44: $27.200 → $31.700
UPDATE "ProductoLocal" SET "precio_venta" = 31700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7066 AND "precio_venta" IS NOT DISTINCT FROM 27200 AND "precio_costo" IS NOT DISTINCT FROM 22262.44 AND "margen" IS NOT DISTINCT FROM 42.3;

-- Casiano casas · Oblea Cofler Block Max · $22.262,44: $27.200 → $31.700
UPDATE "ProductoLocal" SET "precio_venta" = 31700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7575 AND "precio_venta" IS NOT DISTINCT FROM 27200 AND "precio_costo" IS NOT DISTINCT FROM 22262.44 AND "margen" IS NOT DISTINCT FROM 42.3;

-- Casiano casas · Oso Acido 50g · $8.977,88: $10.300 → $11.800
UPDATE "ProductoLocal" SET "precio_venta" = 11800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7586 AND "precio_venta" IS NOT DISTINCT FROM 10300 AND "precio_costo" IS NOT DISTINCT FROM 8977.88 AND "margen" IS NOT DISTINCT FROM 31.21;

-- Casiano casas · Philips 10 · $36.103: $37.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6959 AND "precio_venta" IS NOT DISTINCT FROM 37000 AND "precio_costo" IS NOT DISTINCT FROM 36103 AND "margen" IS NOT DISTINCT FROM 9.24;

-- Casiano casas · Philips 10 mentolado · $36.578: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6957 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36578 AND "margen" IS NOT DISTINCT FROM 7.76;

-- Casiano casas · Philips 20 box · $61.266: $62.000 → $65.000
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9295 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 61266 AND "margen" IS NOT DISTINCT FROM 7.51;

-- Casiano casas · Philips 20 común · $59.500: $60.000 → $63.000
UPDATE "ProductoLocal" SET "precio_venta" = 63000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6945 AND "precio_venta" IS NOT DISTINCT FROM 60000 AND "precio_costo" IS NOT DISTINCT FROM 59500 AND "margen" IS NOT DISTINCT FROM 6.82;

-- Casiano casas · philips 20 mentolado box · $61.320: $62.000 → $65.000
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7312 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 61320 AND "margen" IS NOT DISTINCT FROM 7.41;

-- Casiano casas · Philips 20 red común · $29.460: $30.000 → $33.000
UPDATE "ProductoLocal" SET "precio_venta" = 33000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7084 AND "precio_venta" IS NOT DISTINCT FROM 30000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 14.29;

-- Casiano casas · POETT AERO MUSICA EN PRIMAVERA · $14.200: $18.600 → $18.700
UPDATE "ProductoLocal" SET "precio_venta" = 18700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8735 AND "precio_venta" IS NOT DISTINCT FROM 18600 AND "precio_costo" IS NOT DISTINCT FROM 14200 AND "margen" IS NOT DISTINCT FROM 30.99;

-- Casiano casas · pure de tomate arcor 520gr · $12.710,63: $15.600 → $22.700
UPDATE "ProductoLocal" SET "precio_venta" = 22700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6921 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12710.63 AND "margen" IS NOT DISTINCT FROM 78.08;

-- Casiano casas · Quraplus · $316,12: $600 → $700
UPDATE "ProductoLocal" SET "precio_venta" = 700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13903 AND "precio_venta" IS NOT DISTINCT FROM 600 AND "precio_costo" IS NOT DISTINCT FROM 316.12 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · RAMEN CUP CARNE · $28.929,82: $35.500 → $37.700
UPDATE "ProductoLocal" SET "precio_venta" = 37700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7250 AND "precio_venta" IS NOT DISTINCT FROM 35500 AND "precio_costo" IS NOT DISTINCT FROM 28929.82 AND "margen" IS NOT DISTINCT FROM 30.18;

-- Casiano casas · RAMEN CUP POLLO · $28.929,82: $35.500 → $37.700
UPDATE "ProductoLocal" SET "precio_venta" = 37700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7241 AND "precio_venta" IS NOT DISTINCT FROM 35500 AND "precio_costo" IS NOT DISTINCT FROM 28929.82 AND "margen" IS NOT DISTINCT FROM 30.18;

-- Casiano casas · RAMEN CUP POLLO PICANTE · $28.929,82: $35.500 → $37.700
UPDATE "ProductoLocal" SET "precio_venta" = 37700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7236 AND "precio_venta" IS NOT DISTINCT FROM 35500 AND "precio_costo" IS NOT DISTINCT FROM 28929.82 AND "margen" IS NOT DISTINCT FROM 30.18;

-- Casiano casas · REXONA X3 BAMBOO · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7690 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · REXONA X3 SENSIBLE · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7045 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · RHODESIA X22GR · $31.070: $46.800 → $46.900
UPDATE "ProductoLocal" SET "precio_venta" = 46900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13989 AND "precio_venta" IS NOT DISTINCT FROM 46800 AND "precio_costo" IS NOT DISTINCT FROM 31070 AND "margen" IS NOT DISTINCT FROM 50.63;

-- Casiano casas · ROCKLETS MUNDIAL 20G · $15.792: $20.600 → $20.700
UPDATE "ProductoLocal" SET "precio_venta" = 20700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6918 AND "precio_venta" IS NOT DISTINCT FROM 20600 AND "precio_costo" IS NOT DISTINCT FROM 15792 AND "margen" IS NOT DISTINCT FROM 30.45;

-- Casiano casas · SCHNEIDER LIMON 473 · $47.400: $61.700 → $61.800
UPDATE "ProductoLocal" SET "precio_venta" = 61800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9103 AND "precio_venta" IS NOT DISTINCT FROM 61700 AND "precio_costo" IS NOT DISTINCT FROM 47400 AND "margen" IS NOT DISTINCT FROM 30.17;

-- Casiano casas · sedal acondicionador liso 190 · $32.004,36: $38.300 → $41.700
UPDATE "ProductoLocal" SET "precio_venta" = 41700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8918 AND "precio_venta" IS NOT DISTINCT FROM 38300 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · SEDAL ACONDICIONADOR x10ML BALANCE · $5.373,36: $6.600 → $7.000
UPDATE "ProductoLocal" SET "precio_venta" = 7000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8384 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5373.36 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · SEDAL SHAMPOO x190ml BALANCE · $32.004,36: $38.300 → $41.700
UPDATE "ProductoLocal" SET "precio_venta" = 41700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8387 AND "precio_venta" IS NOT DISTINCT FROM 38300 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Sertal Compuesto · $511,30: $1.000 → $1.100
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13906 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 511.3 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · SKIP LIQUIDO 3LT · $10.399,66: $12.800 → $13.700
UPDATE "ProductoLocal" SET "precio_venta" = 13700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14049 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 10399.66 AND "margen" IS NOT DISTINCT FROM 30.93;

-- Casiano casas · STELLA 710ML · $58.884: $76.600 → $76.700
UPDATE "ProductoLocal" SET "precio_venta" = 76700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7689 AND "precio_venta" IS NOT DISTINCT FROM 76600 AND "precio_costo" IS NOT DISTINCT FROM 58884 AND "margen" IS NOT DISTINCT FROM 30.09;

-- Casiano casas · Tafirol DUO (azul) · $256,14: $500 → $600
UPDATE "ProductoLocal" SET "precio_venta" = 600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13910 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 256.14 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · Te Vent · $702,46: $1.400 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13918 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 702.46 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · Te Vick · $1.804,07: $3.600 → $3.700
UPDATE "ProductoLocal" SET "precio_venta" = 3700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13917 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 1804.07 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · Tetralgin · $351,41: $700 → $800
UPDATE "ProductoLocal" SET "precio_venta" = 800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13915 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 351.41 AND "margen" IS NOT DISTINCT FROM 100;

-- Casiano casas · Tic tac citrus · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8827 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Tic tac frutilla · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8150 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Tic tac frutilla y crema · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8571 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Tic tac menta · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7788 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Tic tac menta fresca · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8577 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Tic tac mix de frutas · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8151 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Tic tac naranja · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8156 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · TITA X19GR · $28.250: $36.800 → $36.900
UPDATE "ProductoLocal" SET "precio_venta" = 36900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13994 AND "precio_venta" IS NOT DISTINCT FROM 36800 AND "precio_costo" IS NOT DISTINCT FROM 28250 AND "margen" IS NOT DISTINCT FROM 30.27;

-- Casiano casas · tofi 55grs negro · $44.573,14: $54.000 → $62.500
UPDATE "ProductoLocal" SET "precio_venta" = 62500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8271 AND "precio_venta" IS NOT DISTINCT FROM 54000 AND "precio_costo" IS NOT DISTINCT FROM 44573.14 AND "margen" IS NOT DISTINCT FROM 40;

-- Casiano casas · TOP LINE MENTA FRESCA DEFENSE 6.u7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8327 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · Topline 7 ultra blueberry 24gr · $19.567,59: $25.200 → $27.600
UPDATE "ProductoLocal" SET "precio_venta" = 27600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8564 AND "precio_venta" IS NOT DISTINCT FROM 25200 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 40.77;

-- Casiano casas · TOPLINE 7 ULTRA CLEAN MINT 24gr · $19.567,59: $25.200 → $27.600
UPDATE "ProductoLocal" SET "precio_venta" = 27600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8563 AND "precio_venta" IS NOT DISTINCT FROM 25200 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 40.77;

-- Casiano casas · TOPLINE 7 ULTRA GREEN MINT 24gr · $19.567,59: $25.200 → $27.600
UPDATE "ProductoLocal" SET "precio_venta" = 27600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8565 AND "precio_venta" IS NOT DISTINCT FROM 25200 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 40.77;

-- Casiano casas · TOPLINE 7 ULTRA RED BERRY 24gr · $19.567,59: $25.200 → $27.600
UPDATE "ProductoLocal" SET "precio_venta" = 27600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8567 AND "precio_venta" IS NOT DISTINCT FROM 25200 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 40.77;

-- Casiano casas · TOPLINE7 BUBBLE FUN ROSA 14G · $13.067,63: $16.000 → $19.700
UPDATE "ProductoLocal" SET "precio_venta" = 19700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7771 AND "precio_venta" IS NOT DISTINCT FROM 16000 AND "precio_costo" IS NOT DISTINCT FROM 13067.63 AND "margen" IS NOT DISTINCT FROM 50.22;

-- Casiano casas · TOPLINE7 MENTHOL 14gr · $13.067,63: $16.000 → $19.700
UPDATE "ProductoLocal" SET "precio_venta" = 19700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7762 AND "precio_venta" IS NOT DISTINCT FROM 16000 AND "precio_costo" IS NOT DISTINCT FROM 13067.63 AND "margen" IS NOT DISTINCT FROM 50.22;

-- Casiano casas · TOPLINE7 SANDIA MANIA 14gr · $13.067,63: $16.000 → $19.700
UPDATE "ProductoLocal" SET "precio_venta" = 19700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7763 AND "precio_venta" IS NOT DISTINCT FROM 16000 AND "precio_costo" IS NOT DISTINCT FROM 13067.63 AND "margen" IS NOT DISTINCT FROM 50.22;

-- Casiano casas · Topline7 Strong Negro 14g · $13.067,63: $16.000 → $19.700
UPDATE "ProductoLocal" SET "precio_venta" = 19700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7780 AND "precio_venta" IS NOT DISTINCT FROM 16000 AND "precio_costo" IS NOT DISTINCT FROM 13067.63 AND "margen" IS NOT DISTINCT FROM 50.22;

-- Casiano casas · TOPLINE7 X- PLOSIVE MINT 14gr · $13.067,63: $16.000 → $19.700
UPDATE "ProductoLocal" SET "precio_venta" = 19700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7782 AND "precio_venta" IS NOT DISTINCT FROM 16000 AND "precio_costo" IS NOT DISTINCT FROM 13067.63 AND "margen" IS NOT DISTINCT FROM 50.22;

-- Casiano casas · TOSTEX CEBOLLA · $1.113,67: $1.400 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9193 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1113.67 AND "margen" IS NOT DISTINCT FROM 33.33;

-- Casiano casas · TRIMACER ARROZ 500G · $6.982,20: $9.100 → $10.000
UPDATE "ProductoLocal" SET "precio_venta" = 10000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7328 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 6982.2 AND "margen" IS NOT DISTINCT FROM 42.86;

-- Casiano casas · Turron arcor · $13.690,71: $15.600 → $17.800
UPDATE "ProductoLocal" SET "precio_venta" = 17800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7831 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 13690.71 AND "margen" IS NOT DISTINCT FROM 30;

-- Casiano casas · VENADO TUERTO HARINA 000 · $8.991,70: $11.000 → $12.200
UPDATE "ProductoLocal" SET "precio_venta" = 12200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7520 AND "precio_venta" IS NOT DISTINCT FROM 11000 AND "precio_costo" IS NOT DISTINCT FROM 8991.7 AND "margen" IS NOT DISTINCT FROM 35.47;

-- Mini unidas · ALF. B&N BLANCO 73 5g · $1.442,22: $1.800 → $1.900
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12144 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1442.22 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · ALFAJOR FANTOCHE BLANCO · $17.614,56: $24.100 → $26.000
UPDATE "ProductoLocal" SET "precio_venta" = 26000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12262 AND "precio_venta" IS NOT DISTINCT FROM 24100 AND "precio_costo" IS NOT DISTINCT FROM 17614.56 AND "margen" IS NOT DISTINCT FROM 47.06;

-- Mini unidas · ALKA ACIDO · $10.100: $13.100 → $13.200
UPDATE "ProductoLocal" SET "precio_venta" = 13200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13064 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 10100 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · AMSTEL LAGER 473 · $35.400: $46.100 → $46.200
UPDATE "ProductoLocal" SET "precio_venta" = 46200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13986 AND "precio_venta" IS NOT DISTINCT FROM 46100 AND "precio_costo" IS NOT DISTINCT FROM 35400 AND "margen" IS NOT DISTINCT FROM 30.23;

-- Mini unidas · AZAFRAN MOLIDO X2 · $5.425,46: $5.600 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12823 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 5425.46 AND "margen" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Beldent Inf Azul 26 6g · $19.637: $25.500 → $25.600
UPDATE "ProductoLocal" SET "precio_venta" = 25600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12154 AND "precio_venta" IS NOT DISTINCT FROM 25500 AND "precio_costo" IS NOT DISTINCT FROM 19637 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Beldent Inf Verde 13.3g · $12.240: $15.900 → $16.000
UPDATE "ProductoLocal" SET "precio_venta" = 16000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12157 AND "precio_venta" IS NOT DISTINCT FROM 15900 AND "precio_costo" IS NOT DISTINCT FROM 12240 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Beldent Inf Verde 26.6g · $19.634: $25.500 → $25.600
UPDATE "ProductoLocal" SET "precio_venta" = 25600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12158 AND "precio_venta" IS NOT DISTINCT FROM 25500 AND "precio_costo" IS NOT DISTINCT FROM 19634 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · BELDENT ROSA · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12155 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Beldent sandia · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13780 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · BELDENT TROPICAL · $12.640: $16.400 → $16.500
UPDATE "ProductoLocal" SET "precio_venta" = 16500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13761 AND "precio_venta" IS NOT DISTINCT FROM 16400 AND "precio_costo" IS NOT DISTINCT FROM 12640 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · BUBBALOO FRUTILLA ROJO · $5.480: $7.100 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12190 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 5480 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · BUBBALOO MENTA CELESTE · $5.480: $7.100 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12191 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 5480 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · BUBBALOO TUTTI FRUTI ROSA · $5.480: $7.100 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12182 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 5480 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · BUBBALOO UVA VIOLETA · $5.480: $7.100 → $7.200
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13067 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 5480 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Chester 10 · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11719 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Chester 10 mentolado · $32.280: $33.000 → $35.000
UPDATE "ProductoLocal" SET "precio_venta" = 35000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11736 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 32280 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Chester 20 mentolado box · $54.300: $55.000 → $57.000
UPDATE "ProductoLocal" SET "precio_venta" = 57000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11681 AND "precio_venta" IS NOT DISTINCT FROM 55000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 7.21;

-- Mini unidas · CHOCOLATE MARROC · $35.830: $60.000 → $60.100
UPDATE "ProductoLocal" SET "precio_venta" = 60100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12871 AND "precio_venta" IS NOT DISTINCT FROM 60000 AND "precio_costo" IS NOT DISTINCT FROM 35830 AND "margen" IS NOT DISTINCT FROM 67.46;

-- Mini unidas · Chocolatin Arcor 25g Blanco · $31.311,78: $48.000 → $48.100
UPDATE "ProductoLocal" SET "precio_venta" = 48100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11614 AND "precio_venta" IS NOT DISTINCT FROM 48000 AND "precio_costo" IS NOT DISTINCT FROM 31311.78 AND "margen" IS NOT DISTINCT FROM 53.3;

-- Mini unidas · CHUPETIN CRAZY POP FRUTILLA · $2.410: $3.100 → $3.200
UPDATE "ProductoLocal" SET "precio_venta" = 3200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11798 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 2410 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · CHUPETIN CRAZY POP x1 UVA · $2.410: $3.100 → $3.200
UPDATE "ProductoLocal" SET "precio_venta" = 3200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12220 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 2410 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · CITRIC X 1LTS · $46.400: $48.000 → $48.100
UPDATE "ProductoLocal" SET "precio_venta" = 48100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12682 AND "precio_venta" IS NOT DISTINCT FROM 48000 AND "precio_costo" IS NOT DISTINCT FROM 46400 AND "margen" IS NOT DISTINCT FROM 3.45;

-- Mini unidas · Cofler Block Blanco 38g · $32.853,13: $46.000 → $46.100
UPDATE "ProductoLocal" SET "precio_venta" = 46100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13470 AND "precio_venta" IS NOT DISTINCT FROM 46000 AND "precio_costo" IS NOT DISTINCT FROM 32853.13 AND "margen" IS NOT DISTINCT FROM 40.02;

-- Mini unidas · crazy pop x5 naranja · $2.410: $3.100 → $3.200
UPDATE "ProductoLocal" SET "precio_venta" = 3200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12221 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 2410 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · CREMINO SURTIDOS X940GR · $12.482,04: $15.600 → $16.300
UPDATE "ProductoLocal" SET "precio_venta" = 16300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13825 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12482.04 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · DULCOR MERMELADA 500g FRUTILLA · $1.630: $2.100 → $2.200
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11625 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1630 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · EXQUISITA FLAN DDL · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13806 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;

-- Mini unidas · EXQUISITA FLAN VAINILLA · $14.400: $18.800 → $18.900
UPDATE "ProductoLocal" SET "precio_venta" = 18900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13775 AND "precio_venta" IS NOT DISTINCT FROM 18800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM 30.56;

-- Mini unidas · FANTOCHE MINI ALFAJOR NEGRO x6 · $41.497,20: $64.800 → $65.600
UPDATE "ProductoLocal" SET "precio_venta" = 65600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13320 AND "precio_venta" IS NOT DISTINCT FROM 64800 AND "precio_costo" IS NOT DISTINCT FROM 41497.2 AND "margen" IS NOT DISTINCT FROM 57.89;

-- Mini unidas · FANTOCHE YAYITA 275G · $18.655,56: $26.400 → $26.700
UPDATE "ProductoLocal" SET "precio_venta" = 26700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12647 AND "precio_venta" IS NOT DISTINCT FROM 26400 AND "precio_costo" IS NOT DISTINCT FROM 18655.56 AND "margen" IS NOT DISTINCT FROM 42.7;

-- Mini unidas · FERNET 1882 LATA · $40.800: $48.000 → $48.100
UPDATE "ProductoLocal" SET "precio_venta" = 48100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12293 AND "precio_venta" IS NOT DISTINCT FROM 48000 AND "precio_costo" IS NOT DISTINCT FROM 40800 AND "margen" IS NOT DISTINCT FROM 17.65;

-- Mini unidas · FERNET BRANCA 750ML · $166.860: $217.200 → $217.300
UPDATE "ProductoLocal" SET "precio_venta" = 217300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12292 AND "precio_venta" IS NOT DISTINCT FROM 217200 AND "precio_costo" IS NOT DISTINCT FROM 166860 AND "margen" IS NOT DISTINCT FROM 30.17;

-- Mini unidas · GAJOS FRUTALES 485G · $4.600,34: $5.800 → $6.000
UPDATE "ProductoLocal" SET "precio_venta" = 6000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12962 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 4600.34 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Harina 0000 Venado Tuerto X10 · $10.396: $13.000 → $14.100
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12339 AND "precio_venta" IS NOT DISTINCT FROM 13000 AND "precio_costo" IS NOT DISTINCT FROM 10396 AND "margen" IS NOT DISTINCT FROM 35.35;

-- Mini unidas · Harina Pizza Pureza · $16.667,40: $20.100 → $21.800
UPDATE "ProductoLocal" SET "precio_venta" = 21800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11919 AND "precio_venta" IS NOT DISTINCT FROM 20100 AND "precio_costo" IS NOT DISTINCT FROM 16667.4 AND "margen" IS NOT DISTINCT FROM 30.72;

-- Mini unidas · HUEVO KINDER NENA · $26.600: $37.300 → $37.400
UPDATE "ProductoLocal" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13057 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 26600 AND "margen" IS NOT DISTINCT FROM 40.23;

-- Mini unidas · HUEVO KINDER NENE · $26.600: $37.300 → $37.400
UPDATE "ProductoLocal" SET "precio_venta" = 37400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13065 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 26600 AND "margen" IS NOT DISTINCT FROM 40.23;

-- Mini unidas · HUGGIES PAÑALES G AMARILLO · $31.984,08: $46.800 → $50.700
UPDATE "ProductoLocal" SET "precio_venta" = 50700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12746 AND "precio_venta" IS NOT DISTINCT FROM 46800 AND "precio_costo" IS NOT DISTINCT FROM 31984.08 AND "margen" IS NOT DISTINCT FROM 58.22;

-- Mini unidas · IMPERIAL 473 apa · $42.000: $55.200 → $55.300
UPDATE "ProductoLocal" SET "precio_venta" = 55300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15452 AND "precio_venta" IS NOT DISTINCT FROM 55200 AND "precio_costo" IS NOT DISTINCT FROM 42000 AND "margen" IS NOT DISTINCT FROM 31.43;

-- Mini unidas · JABON REXONA X3 COTTON FRESH · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11825 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · JABON REXONA X3 FUTBOL FANATICS · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13119 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · JABON REXONA X3 NUTRITIVE ORCHID · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12901 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · LA HOJA YERBA 500G · $13.363,20: $16.800 → $17.900
UPDATE "ProductoLocal" SET "precio_venta" = 17900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13462 AND "precio_venta" IS NOT DISTINCT FROM 16800 AND "precio_costo" IS NOT DISTINCT FROM 13363.2 AND "margen" IS NOT DISTINCT FROM 33.33;

-- Mini unidas · la Yapa 36 U · $10.410: $13.500 → $13.600
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12618 AND "precio_venta" IS NOT DISTINCT FROM 13500 AND "precio_costo" IS NOT DISTINCT FROM 10410 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Lata durazno Sabio · $22.680: $31.200 → $31.300
UPDATE "ProductoLocal" SET "precio_venta" = 31300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11618 AND "precio_venta" IS NOT DISTINCT FROM 31200 AND "precio_costo" IS NOT DISTINCT FROM 22680 AND "margen" IS NOT DISTINCT FROM 37.57;

-- Mini unidas · LINA PROTECTORES · $61.827: $78.000 → $78.100
UPDATE "ProductoLocal" SET "precio_venta" = 78100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12475 AND "precio_venta" IS NOT DISTINCT FROM 78000 AND "precio_costo" IS NOT DISTINCT FROM 61827 AND "margen" IS NOT DISTINCT FROM 26.16;

-- Mini unidas · Lucky 10 · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11760 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 5.61;

-- Mini unidas · Lucky 10 mentolado · $36.535: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11777 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36535 AND "margen" IS NOT DISTINCT FROM 5.61;

-- Mini unidas · Lucky 20 Menta Comun · $56.460: $57.000 → $59.000
UPDATE "ProductoLocal" SET "precio_venta" = 59000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11850 AND "precio_venta" IS NOT DISTINCT FROM 57000 AND "precio_costo" IS NOT DISTINCT FROM 56460 AND "margen" IS NOT DISTINCT FROM 6.62;

-- Mini unidas · Lucky 20 Origen Menta Box · $43.500: $44.000 → $46.000
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11834 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 8.64;

-- Mini unidas · LUX X3 LIRIO AZUL · $3.407,33: $4.000 → $4.500
UPDATE "ProductoLocal" SET "precio_venta" = 4500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12380 AND "precio_venta" IS NOT DISTINCT FROM 4000 AND "precio_costo" IS NOT DISTINCT FROM 3407.33 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Marlboro 10 · $40.272: $41.000 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11592 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 40272 AND "margen" IS NOT DISTINCT FROM 3.17;

-- Mini unidas · Marlboro 10 Uva · $39.840: $41.000 → $42.000
UPDATE "ProductoLocal" SET "precio_venta" = 42000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11749 AND "precio_venta" IS NOT DISTINCT FROM 41000 AND "precio_costo" IS NOT DISTINCT FROM 39840 AND "margen" IS NOT DISTINCT FROM 4.33;

-- Mini unidas · Marlboro 20 Crafted menta box · $42.420: $44.000 → $45.000
UPDATE "ProductoLocal" SET "precio_venta" = 45000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11594 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 42420 AND "margen" IS NOT DISTINCT FROM 11.62;

-- Mini unidas · Marlboro 20 Crafted suave · $40.260: $40.260 → $43.000
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11884 AND "precio_venta" IS NOT DISTINCT FROM 40260 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 0;

-- Mini unidas · MENTA CRISTAL 140g · $2.000: $2.800 → $2.900
UPDATE "ProductoLocal" SET "precio_venta" = 2900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13229 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MENTHOPLUS ZERO STRONG · $9.029,95: $10.700 → $11.800
UPDATE "ProductoLocal" SET "precio_venta" = 11800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12416 AND "precio_venta" IS NOT DISTINCT FROM 10700 AND "precio_costo" IS NOT DISTINCT FROM 9029.95 AND "margen" IS NOT DISTINCT FROM 30.49;

-- Mini unidas · MOGUL BANANITAS 30G · $6.777,26: $8.100 → $8.900
UPDATE "ProductoLocal" SET "precio_venta" = 8900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13050 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 6777.26 AND "margen" IS NOT DISTINCT FROM 31.28;

-- Mini unidas · MOGUL COLA 30gr · $6.777,26: $7.600 → $8.900
UPDATE "ProductoLocal" SET "precio_venta" = 8900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12055 AND "precio_venta" IS NOT DISTINCT FROM 7600 AND "precio_costo" IS NOT DISTINCT FROM 6777.26 AND "margen" IS NOT DISTINCT FROM 30.7;

-- Mini unidas · MOGUL EXTREME LENGUAS · $12.045,08: $13.100 → $15.700
UPDATE "ProductoLocal" SET "precio_venta" = 15700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12726 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 12045.08 AND "margen" IS NOT DISTINCT FROM 30.15;

-- Mini unidas · Mogul extreme mini gustnitos · $5.926: $7.700 → $7.800
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13509 AND "precio_venta" IS NOT DISTINCT FROM 7700 AND "precio_costo" IS NOT DISTINCT FROM 5926 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Mogul extreme tubito max 25gr · $12.045,08: $13.100 → $15.700
UPDATE "ProductoLocal" SET "precio_venta" = 15700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12576 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 12045.08 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Mogul Mini Twist Uva · $7.370,26: $7.800 → $9.600
UPDATE "ProductoLocal" SET "precio_venta" = 9600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12007 AND "precio_venta" IS NOT DISTINCT FROM 7800 AND "precio_costo" IS NOT DISTINCT FROM 7370.26 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · MOÑO SOL PAMPEANO · $15.069,45: $22.500 → $22.700
UPDATE "ProductoLocal" SET "precio_venta" = 22700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11960 AND "precio_venta" IS NOT DISTINCT FROM 22500 AND "precio_costo" IS NOT DISTINCT FROM 15069.45 AND "margen" IS NOT DISTINCT FROM 50;

-- Mini unidas · OBLEA BON O BON BLANCO 30gr · $19.063,70: $30.000 → $30.100
UPDATE "ProductoLocal" SET "precio_venta" = 30100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12639 AND "precio_venta" IS NOT DISTINCT FROM 30000 AND "precio_costo" IS NOT DISTINCT FROM 19063.7 AND "margen" IS NOT DISTINCT FROM 57.37;

-- Mini unidas · OBLEA BON O BON LECHE 30gr · $19.063,70: $30.000 → $30.100
UPDATE "ProductoLocal" SET "precio_venta" = 30100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12635 AND "precio_venta" IS NOT DISTINCT FROM 30000 AND "precio_costo" IS NOT DISTINCT FROM 19063.7 AND "margen" IS NOT DISTINCT FROM 57.37;

-- Mini unidas · OCB Negro · $17.400: $27.500 → $27.600
UPDATE "ProductoLocal" SET "precio_venta" = 27600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12670 AND "precio_venta" IS NOT DISTINCT FROM 27500 AND "precio_costo" IS NOT DISTINCT FROM 17400 AND "margen" IS NOT DISTINCT FROM 58.05;

-- Mini unidas · Oso Acido 50g · $8.977,88: $10.300 → $11.800
UPDATE "ProductoLocal" SET "precio_venta" = 11800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12411 AND "precio_venta" IS NOT DISTINCT FROM 10300 AND "precio_costo" IS NOT DISTINCT FROM 8977.88 AND "margen" IS NOT DISTINCT FROM 31.21;

-- Mini unidas · PASEO 5 SEMILLAS · $19.600: $28.000 → $28.100
UPDATE "ProductoLocal" SET "precio_venta" = 28100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12659 AND "precio_venta" IS NOT DISTINCT FROM 28000 AND "precio_costo" IS NOT DISTINCT FROM 19600 AND "margen" IS NOT DISTINCT FROM 42.86;

-- Mini unidas · PEHUAMAR CHISITOS 265G · $17.548: $25.000 → $25.100
UPDATE "ProductoLocal" SET "precio_venta" = 25100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11637 AND "precio_venta" IS NOT DISTINCT FROM 25000 AND "precio_costo" IS NOT DISTINCT FROM 17548 AND "margen" IS NOT DISTINCT FROM 42.47;

-- Mini unidas · Philips 10 · $36.103: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11723 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36103 AND "margen" IS NOT DISTINCT FROM 9.82;

-- Mini unidas · Philips 10 mentolado · $36.578: $38.000 → $39.000
UPDATE "ProductoLocal" SET "precio_venta" = 39000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11724 AND "precio_venta" IS NOT DISTINCT FROM 38000 AND "precio_costo" IS NOT DISTINCT FROM 36578 AND "margen" IS NOT DISTINCT FROM 5.48;

-- Mini unidas · Philips 20 bluw select · $29.460: $30.000 → $33.500
UPDATE "ProductoLocal" SET "precio_venta" = 33500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14514 AND "precio_venta" IS NOT DISTINCT FROM 30000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 13.38;

-- Mini unidas · Philips 20 red común · $29.460: $30.000 → $32.000
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11876 AND "precio_venta" IS NOT DISTINCT FROM 30000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 1.83;

-- Mini unidas · REXONA CLINICAL CLASSIC CREMA VIOLETA · $11.144,04: $10.400 → $14.500
UPDATE "ProductoLocal" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13688 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 11144.04 AND "margen" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA CLINICAL CLASSIC CREMA ROSA · $11.144,04: $10.400 → $14.500
UPDATE "ProductoLocal" SET "precio_venta" = 14500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11711 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 11144.04 AND "margen" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA x1 ANTIBACTERIAL · $1.298,57: $900 → $1.700
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13516 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 1298.57 AND "margen" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA X3 BAMBOO · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12517 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · REXONA X3 SENSIBLE · $3.261,01: $3.800 → $4.300
UPDATE "ProductoLocal" SET "precio_venta" = 4300, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11829 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 3261.01 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Rocklets mini 10g · $19.886,80: $30.800 → $30.900
UPDATE "ProductoLocal" SET "precio_venta" = 30900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12504 AND "precio_venta" IS NOT DISTINCT FROM 30800 AND "precio_costo" IS NOT DISTINCT FROM 19886.8 AND "margen" IS NOT DISTINCT FROM 54.88;

-- Mini unidas · ROCKLETS MUNDIAL 20G · $15.792: $20.600 → $20.700
UPDATE "ProductoLocal" SET "precio_venta" = 20700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11670 AND "precio_venta" IS NOT DISTINCT FROM 20600 AND "precio_costo" IS NOT DISTINCT FROM 15792 AND "margen" IS NOT DISTINCT FROM 30.45;

-- Mini unidas · Salametro · $16.500: $23.700 → $23.800
UPDATE "ProductoLocal" SET "precio_venta" = 23800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11631 AND "precio_venta" IS NOT DISTINCT FROM 23700 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM 43.64;

-- Mini unidas · SCHNEIDER 473 · $34.000: $45.600 → $45.700
UPDATE "ProductoLocal" SET "precio_venta" = 45700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12827 AND "precio_venta" IS NOT DISTINCT FROM 45600 AND "precio_costo" IS NOT DISTINCT FROM 34000 AND "margen" IS NOT DISTINCT FROM 34.12;

-- Mini unidas · SCHNEIDER LIMON 473 · $47.400: $61.700 → $61.800
UPDATE "ProductoLocal" SET "precio_venta" = 61800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12121 AND "precio_venta" IS NOT DISTINCT FROM 61700 AND "precio_costo" IS NOT DISTINCT FROM 47400 AND "margen" IS NOT DISTINCT FROM 30.17;

-- Mini unidas · sedal acondicionador liso 190 · $32.004,36: $38.400 → $41.900
UPDATE "ProductoLocal" SET "precio_venta" = 41900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13778 AND "precio_venta" IS NOT DISTINCT FROM 38400 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM 30.61;

-- Mini unidas · SEDAL SHAMPOO x190ml BALANCE · $32.004,36: $38.400 → $41.900
UPDATE "ProductoLocal" SET "precio_venta" = 41900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13235 AND "precio_venta" IS NOT DISTINCT FROM 38400 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM 30.61;

-- Mini unidas · SKIP LIQUIDO 3LT · $10.399,66: $12.800 → $13.700
UPDATE "ProductoLocal" SET "precio_venta" = 13700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14051 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 10399.66 AND "margen" IS NOT DISTINCT FROM 30.93;

-- Mini unidas · Skyy Clasico · $102.000: $144.000 → $144.100
UPDATE "ProductoLocal" SET "precio_venta" = 144100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12721 AND "precio_venta" IS NOT DISTINCT FROM 144000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM 41.18;

-- Mini unidas · SKYY VODKA APRICOT X CAJA · $102.000: $144.000 → $144.100
UPDATE "ProductoLocal" SET "precio_venta" = 144100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13112 AND "precio_venta" IS NOT DISTINCT FROM 144000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM 41.18;

-- Mini unidas · SKYY VODKA BLOOD ORANGE X CAJA · $102.000: $144.000 → $144.100
UPDATE "ProductoLocal" SET "precio_venta" = 144100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13441 AND "precio_venta" IS NOT DISTINCT FROM 144000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM 41.18;

-- Mini unidas · SKYY VODKA PINEAPPLES X CAJA 12U · $102.000: $144.000 → $144.100
UPDATE "ProductoLocal" SET "precio_venta" = 144100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12063 AND "precio_venta" IS NOT DISTINCT FROM 144000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM 41.18;

-- Mini unidas · SKYY VODKA RASBERRY X CAJA 12U · $102.000: $144.000 → $144.100
UPDATE "ProductoLocal" SET "precio_venta" = 144100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12544 AND "precio_venta" IS NOT DISTINCT FROM 144000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM 41.18;

-- Mini unidas · STELLA 710ML · $58.884: $76.600 → $76.700
UPDATE "ProductoLocal" SET "precio_venta" = 76700, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12516 AND "precio_venta" IS NOT DISTINCT FROM 76600 AND "precio_costo" IS NOT DISTINCT FROM 58884 AND "margen" IS NOT DISTINCT FROM NULL;

-- Mini unidas · TEREPIN PEPAS 200G · $15.650,40: $24.000 → $25.200
UPDATE "ProductoLocal" SET "precio_venta" = 25200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11847 AND "precio_venta" IS NOT DISTINCT FROM 24000 AND "precio_costo" IS NOT DISTINCT FROM 15650.4 AND "margen" IS NOT DISTINCT FROM 60.64;

-- Mini unidas · TERRABUSI CHOCOLATE · $53.640: $69.800 → $69.900
UPDATE "ProductoLocal" SET "precio_venta" = 69900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13697 AND "precio_venta" IS NOT DISTINCT FROM 69800 AND "precio_costo" IS NOT DISTINCT FROM 53640 AND "margen" IS NOT DISTINCT FROM 30.13;

-- Mini unidas · TERRABUSI VARIEDAD 390G · $44.700: $60.000 → $60.100
UPDATE "ProductoLocal" SET "precio_venta" = 60100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12569 AND "precio_venta" IS NOT DISTINCT FROM 60000 AND "precio_costo" IS NOT DISTINCT FROM 44700 AND "margen" IS NOT DISTINCT FROM 34.23;

-- Mini unidas · Tic tac citrus · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13685 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Tic tac frutilla · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12990 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Tic tac frutilla y crema · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13422 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Tic tac menta · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12615 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Tic tac menta fresca · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13430 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Tic tac mix de frutas · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12991 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Tic tac naranja · $9.850: $12.800 → $12.900
UPDATE "ProductoLocal" SET "precio_venta" = 12900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12996 AND "precio_venta" IS NOT DISTINCT FROM 12800 AND "precio_costo" IS NOT DISTINCT FROM 9850 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · TITA X19GR · $28.250: $36.800 → $36.900
UPDATE "ProductoLocal" SET "precio_venta" = 36900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13996 AND "precio_venta" IS NOT DISTINCT FROM 36800 AND "precio_costo" IS NOT DISTINCT FROM 28250 AND "margen" IS NOT DISTINCT FROM 30.27;

-- Mini unidas · TOP LINE MENTA FRESCA DEFENSE 6.u7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13173 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · Topline 7 ultra blueberry 24gr · $19.567,59: $23.300 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13417 AND "precio_venta" IS NOT DISTINCT FROM 23300 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · TOPLINE 7 ULTRA CLEAN MINT 24gr · $19.567,59: $23.300 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13416 AND "precio_venta" IS NOT DISTINCT FROM 23300 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · TOPLINE 7 ULTRA GREEN MINT 24gr · $19.567,59: $23.300 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13418 AND "precio_venta" IS NOT DISTINCT FROM 23300 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 30.15;

-- Mini unidas · TOPLINE 7 ULTRA RED BERRY 24gr · $19.567,59: $23.300 → $25.500
UPDATE "ProductoLocal" SET "precio_venta" = 25500, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13419 AND "precio_venta" IS NOT DISTINCT FROM 23300 AND "precio_costo" IS NOT DISTINCT FROM 19567.59 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · TOPLINE MENTA VERDE 6.7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12781 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · TOPLINE STRONG NEGRO 6.7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12782 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · TOPPLINE ROJO 6.7gr · $6.571: $8.500 → $8.600
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12770 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6571 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · TRIMACER ARROZ 500G · $6.982,20: $10.000 → $11.100
UPDATE "ProductoLocal" SET "precio_venta" = 11100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12147 AND "precio_venta" IS NOT DISTINCT FROM 10000 AND "precio_costo" IS NOT DISTINCT FROM 6982.2 AND "margen" IS NOT DISTINCT FROM 58.73;

-- Mini unidas · Turron arcor · $13.690,71: $15.600 → $17.800
UPDATE "ProductoLocal" SET "precio_venta" = 17800, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12661 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 13690.71 AND "margen" IS NOT DISTINCT FROM 30;

-- Mini unidas · VENADO TUERTO HARINA 000 · $8.991,70: $11.000 → $12.200
UPDATE "ProductoLocal" SET "precio_venta" = 12200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12340 AND "precio_venta" IS NOT DISTINCT FROM 11000 AND "precio_costo" IS NOT DISTINCT FROM 8991.7 AND "margen" IS NOT DISTINCT FROM 35.47;
