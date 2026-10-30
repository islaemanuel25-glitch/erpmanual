-- FILAS SIN MARGEN CON PRECIO VIEJO: A 30 %, O CON SU MARGEN ANCLADO.
--
-- Corrección pedida por Emanuel el 2026-10-30. Una fila sin margen —o con
-- margen ≤ 0— nunca se recalcula cuando sube el costo, y la venta se queda en un
-- precio viejo. Generada por
-- scripts/correcciones/generarCorreccionSinRegla20261030.mjs con la regla de
-- scripts/correcciones/preciosSinRegla.mjs (precioDesdeMargen, redondeo de la
-- ficha), sobre el costo del bulto tal como está:
--
--   · ganando menos de 30 % → margen 30 y la venta que da: 673 filas;
--   · ganando 30 % o más → mismo precio y el margen anclado a un entero que lo
--     conserva: 687 filas;
--   · de las 252 "de escala", las que SÍ tienen margen suben a lo que da el
--     suyo, sin tocarlo: 119 filas.
--
-- Regla MARGEN_PORCENTUAL en todas. Nunca baja un precio. Lo decidido aparte por
-- Emanuel —precios fijos, fiambres a 30, filas excluidas— está en el generador.
--
-- ── SEGURIDAD ─────────────────────────────────────────────────────────────
--
-- Cada UPDATE exige el precio, el costo, el margen, la regla y el monto fijo
-- exportados: si alguien los cambió, esa fila no se toca.
--
-- ── RESPALDO Y VUELTA ATRÁS ───────────────────────────────────────────────
--
-- Antes de cambiar nada, todas las filas activas con su ficha van a
-- respaldo.backup_precios_ubicacion_20261030_b. Para volver una fila:
--
--   UPDATE "ProductoLocal" pl SET "precio_venta" = r."precio_venta", "margen" = r."margen",
--          "reglaPrecio" = r."reglaPrecio"
--     FROM respaldo.backup_precios_ubicacion_20261030_b r WHERE r."id" = pl."id" AND pl."id" = <id>;
--
-- y en el depósito, lo mismo sobre "ProductoBase" con base_precio_venta y base_margen.

CREATE SCHEMA IF NOT EXISTS respaldo;

CREATE TABLE respaldo.backup_precios_ubicacion_20261030_b AS
SELECT pl."id", pl."localId", pl."baseId", pl."precio_costo", pl."precio_venta", pl."margen",
       pl."reglaPrecio", pl."recargoFijoUnidad",
       b."precio_costo" AS base_precio_costo, b."precio_venta" AS base_precio_venta, b."margen" AS base_margen,
       CURRENT_TIMESTAMP AS respaldado_en
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
 WHERE pl."activo";

-- depo · AZUFRE · $1.200: $500 → $1.600 · margen 33
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 664 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1600, "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 664 AND "precio_venta" = 500 AND "precio_costo" = 1200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BAGGIO 1L CHOCOLATADA X8 · $18.400: $19.300 → $24.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 167 AND "precio_venta" IS NOT DISTINCT FROM 19300 AND "precio_costo" IS NOT DISTINCT FROM 18400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 24000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 167 AND "precio_venta" = 19300 AND "precio_costo" = 18400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BAGGIO 200 ML MANZANA · $8.380: $10.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1203 AND "precio_venta" IS NOT DISTINCT FROM 10900 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1203 AND "precio_venta" = 10900 AND "precio_costo" = 8380 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BAGGIO 200 NARANJA · $8.380: $10.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1644 AND "precio_venta" IS NOT DISTINCT FROM 10900 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1644 AND "precio_venta" = 10900 AND "precio_costo" = 8380 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BAGGIO 200ML MULTIFRUTA · $8.380: $10.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 78 AND "precio_venta" IS NOT DISTINCT FROM 10900 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 78 AND "precio_venta" = 10900 AND "precio_costo" = 8380 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BAGGIO 7 DIAS 1L CHOCOLATADA · $13.105: $17.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1642 AND "precio_venta" IS NOT DISTINCT FROM 17100 AND "precio_costo" IS NOT DISTINCT FROM 13105 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1642 AND "precio_venta" = 17100 AND "precio_costo" = 13105 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BAGGIO DURAZNO 200 · $8.380: $10.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1191 AND "precio_venta" IS NOT DISTINCT FROM 10900 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1191 AND "precio_venta" = 10900 AND "precio_costo" = 8380 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BATATA ARCOR 500G · $2.063,52: $2.300 → $2.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 81 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 2063.52 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 81 AND "precio_venta" = 2300 AND "precio_costo" = 2063.52 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BENGALA X4 · $1.900: $2.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 68 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 68 AND "precio_venta" = 2500 AND "precio_costo" = 1900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · bengalas x2 · $2.000: $2.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1973 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1973 AND "precio_venta" = 2600 AND "precio_costo" = 2000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BIC ENCENDEDOR MAXI · $18.260: $23.600 → $23.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1206 AND "precio_venta" IS NOT DISTINCT FROM 23600 AND "precio_costo" IS NOT DISTINCT FROM 18260 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 23800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1206 AND "precio_venta" = 23600 AND "precio_costo" = 18260 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BIC ENCENDEDOR MINI · $12.575: $14.700 → $16.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 16400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 240 AND "precio_venta" IS NOT DISTINCT FROM 14700 AND "precio_costo" IS NOT DISTINCT FROM 12575 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 16400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 240 AND "precio_venta" = 14700 AND "precio_costo" = 12575 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BLENDERS WHISKY 75O ML · $42.259,05: $42.259,05 → $55.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 55000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1056 AND "precio_venta" IS NOT DISTINCT FROM 42259.05 AND "precio_costo" IS NOT DISTINCT FROM 42259.05 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 55000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1056 AND "precio_venta" = 42259.05 AND "precio_costo" = 42259.05 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · bolsa consorcio 90x120 · $1.500: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14423 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2847 AND "precio_venta" = 1500 AND "precio_costo" = 1500 AND "margen" IS NOT DISTINCT FROM 0;

-- depo · BOLSAS RERSIDUO 45X60 · $660: $900 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 71 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 71 AND "precio_venta" = 900 AND "precio_costo" = 660 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BROCHES X12u PLASCTICO NUVIA · $800: $1.100 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 73 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 37, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 73 AND "precio_venta" = 1100 AND "precio_costo" = 800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · BROCHES MADERA NUVIA X12 · $420: $600 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 74 AND "precio_venta" IS NOT DISTINCT FROM 600 AND "precio_costo" IS NOT DISTINCT FROM 420 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 42, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 74 AND "precio_venta" = 600 AND "precio_costo" = 420 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Budin elixir x6 · $6.000: $7.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 4030 AND "precio_venta" IS NOT DISTINCT FROM 7800 AND "precio_costo" IS NOT DISTINCT FROM 6000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2030 AND "precio_venta" = 7800 AND "precio_costo" = 6000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CABALLA EN ACEITE BAHIA X425 · $77.520: $4.200 → $100.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 100800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1871 AND "precio_venta" IS NOT DISTINCT FROM 4200 AND "precio_costo" IS NOT DISTINCT FROM 77520 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 100800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1871 AND "precio_venta" = 4200 AND "precio_costo" = 77520 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CABO MADERA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1303 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1303 AND "precio_venta" = 1600 AND "precio_costo" = 1200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Camel 20 box · $69.000: $72.000 → $89.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 89700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15577 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 89700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3557 AND "precio_venta" = 72000 AND "precio_costo" = 69000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CANDELA GLOBOS 50U · $2.900: $3.800 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1630 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 2900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1630 AND "precio_venta" = 3800 AND "precio_costo" = 2900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Carpano 950ml · $74.880: $8.200 → $97.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 97400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 155 AND "precio_venta" IS NOT DISTINCT FROM 8200 AND "precio_costo" IS NOT DISTINCT FROM 74880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 97400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 155 AND "precio_venta" = 8200 AND "precio_costo" = 74880 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CBSE YERBA 500G · $18.000: $23.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 653 AND "precio_venta" IS NOT DISTINCT FROM 23400 AND "precio_costo" IS NOT DISTINCT FROM 18000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 653 AND "precio_venta" = 23400 AND "precio_costo" = 18000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · celusal parrillera · $38.700: $1.700 → $50.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 50400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1778 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 38700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 50400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1778 AND "precio_venta" = 1700 AND "precio_costo" = 38700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Cepillo de Dientes Mr G · $6.600: $8.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 4001 AND "precio_venta" IS NOT DISTINCT FROM 8600 AND "precio_costo" IS NOT DISTINCT FROM 6600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2001 AND "precio_venta" = 8600 AND "precio_costo" = 6600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · cepillo de mano planchita · $1.385,45: $1.900 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1321 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1385.45 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 37, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1321 AND "precio_venta" = 1900 AND "precio_costo" = 1385.45 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CEPILLO MAPUCHE DE MANO · $1.321: $1.800 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 112 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1321 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 112 AND "precio_venta" = 1800 AND "precio_costo" = 1321 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CERVEZA 1890 1L · $26.000: $33.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2 AND "precio_venta" IS NOT DISTINCT FROM 33800 AND "precio_costo" IS NOT DISTINCT FROM 26000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2 AND "precio_venta" = 33800 AND "precio_costo" = 26000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CERVEZA 1890 LATA · $26.000: $33.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1371 AND "precio_venta" IS NOT DISTINCT FROM 33800 AND "precio_costo" IS NOT DISTINCT FROM 26000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1371 AND "precio_venta" = 33800 AND "precio_costo" = 26000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CERVEZA HEINEKEN 1L · $56.500: $73.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 304 AND "precio_venta" IS NOT DISTINCT FROM 73500 AND "precio_costo" IS NOT DISTINCT FROM 56500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 304 AND "precio_venta" = 73500 AND "precio_costo" = 56500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CHANDON APERITIF XCAJA · $90.000: $117.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 753 AND "precio_venta" IS NOT DISTINCT FROM 117000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 753 AND "precio_venta" = 117000 AND "precio_costo" = 90000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CHANDON DELICE XCAJA · $90.000: $117.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 163 AND "precio_venta" IS NOT DISTINCT FROM 117000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 163 AND "precio_venta" = 117000 AND "precio_costo" = 90000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CHANDON ROSÈ XCAJA · $90.000: $117.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1603 AND "precio_venta" IS NOT DISTINCT FROM 117000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1603 AND "precio_venta" = 117000 AND "precio_costo" = 90000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CHANITA ROLLO DE COCINA · $7.481: $9.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1049 AND "precio_venta" IS NOT DISTINCT FROM 9800 AND "precio_costo" IS NOT DISTINCT FROM 7481 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1049 AND "precio_venta" = 9800 AND "precio_costo" = 7481 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CHEETOS QUESO 43G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1107 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1107 AND "precio_venta" = 2000 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CHEETOS QUESO 85G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1020 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1020 AND "precio_venta" = 3300 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CHEETOS QUESO CREMA 85G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1335 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1335 AND "precio_venta" = 3300 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Chester 20 común · $49.980: $49.000 → $52.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 52000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6086 AND "precio_venta" IS NOT DISTINCT FROM 49000 AND "precio_costo" IS NOT DISTINCT FROM 49980 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Chester 20 mentolado box · $54.300: $54.000 → $57.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 57000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6084 AND "precio_venta" IS NOT DISTINCT FROM 54000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · chester 20 mentolado comun · $50.000: $49.000 → $52.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 52000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6479 AND "precio_venta" IS NOT DISTINCT FROM 49000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Chester 20 Purple motion 2 box · $55.380: $55.000 → $58.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 58000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6085 AND "precio_venta" IS NOT DISTINCT FROM 55000 AND "precio_costo" IS NOT DISTINCT FROM 55380 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · CHOCOLATIN BLANCO 20X8G · $5.694: $7.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1140 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 5694 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1140 AND "precio_venta" = 7500 AND "precio_costo" = 5694 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CITRIC X 1LTS · $46.400: $50.100 → $60.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 60400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 715 AND "precio_venta" IS NOT DISTINCT FROM 50100 AND "precio_costo" IS NOT DISTINCT FROM 46400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 60400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 715 AND "precio_venta" = 50100 AND "precio_costo" = 46400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CLIGHT POMELO · $8.066: $8.100 → $10.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 179 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 8066 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 10500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 179 AND "precio_venta" = 8100 AND "precio_costo" = 8066 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · COLGATE DENTRIFICO 70G X12 · $22.200: $28.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1341 AND "precio_venta" IS NOT DISTINCT FROM 28900 AND "precio_costo" IS NOT DISTINCT FROM 22200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1341 AND "precio_venta" = 28900 AND "precio_costo" = 22200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · COLIBRI POMADA NEGRO · $2.666: $3.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1252 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2666 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1252 AND "precio_venta" = 3500 AND "precio_costo" = 2666 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CONDIMENTO ARROZ 25G · $10.670,40: $12.400 → $13.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 138 AND "precio_venta" IS NOT DISTINCT FROM 12400 AND "precio_costo" IS NOT DISTINCT FROM 10670.4 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 13900, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 138 AND "precio_venta" = 12400 AND "precio_costo" = 10670.4 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CONDIMENTO PIZZA · $9.000: $11.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 677 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 9000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 677 AND "precio_venta" = 11700 AND "precio_costo" = 9000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CORDERO CON PIEL DE LOBO · $22.500: $27.300 → $29.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 29300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 200 AND "precio_venta" IS NOT DISTINCT FROM 27300 AND "precio_costo" IS NOT DISTINCT FROM 22500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 29300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 200 AND "precio_venta" = 27300 AND "precio_costo" = 22500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CORDON EL MOÑO X12U · $1.880: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 139 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 139 AND "precio_venta" = 2500 AND "precio_costo" = 1880 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · cordones negros · $1.881: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1322 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1881 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1322 AND "precio_venta" = 2500 AND "precio_costo" = 1881 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CORONA LATA 473ML · $36.000: $46.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1810 AND "precio_venta" IS NOT DISTINCT FROM 46800 AND "precio_costo" IS NOT DISTINCT FROM 36000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1810 AND "precio_venta" = 46800 AND "precio_costo" = 36000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CUSENIER 700ML CAFE AL COGNAC · $33.130,35: $33.130,35 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 140 AND "precio_venta" IS NOT DISTINCT FROM 33130.35 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 43100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 140 AND "precio_venta" = 33130.35 AND "precio_costo" = 33130.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CUSENIER 700ML CHOCOLATE · $33.130,35: $33.130,35 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 141 AND "precio_venta" IS NOT DISTINCT FROM 33130.35 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 43100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 141 AND "precio_venta" = 33130.35 AND "precio_costo" = 33130.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · CUSENIER 700ML DULCE DE LECHE · $33.130,35: $33.130,35 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 142 AND "precio_venta" IS NOT DISTINCT FROM 33130.35 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 43100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 142 AND "precio_venta" = 33130.35 AND "precio_costo" = 33130.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DERNA PETACA CAFE AL COGNAC XCAJA · $14.400: $17.500 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 455 AND "precio_venta" IS NOT DISTINCT FROM 17500 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 18800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 455 AND "precio_venta" = 17500 AND "precio_costo" = 14400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DERNA PETACA DULCE DE LECHE XCAJA · $15.600: $19.600 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1311 AND "precio_venta" IS NOT DISTINCT FROM 19600 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 20300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1311 AND "precio_venta" = 19600 AND "precio_costo" = 15600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DERNA PETACA VODKA XCAJA · $14.400: $17.500 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1312 AND "precio_venta" IS NOT DISTINCT FROM 17500 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 18800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1312 AND "precio_venta" = 17500 AND "precio_costo" = 14400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DERNA PETACA WHISKY XCAJA · $14.400: $17.500 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 456 AND "precio_venta" IS NOT DISTINCT FROM 17500 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 18800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 456 AND "precio_venta" = 17500 AND "precio_costo" = 14400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DINAMITA EXTRA FLAMIN HOT 82g · $1.965: $2.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1787 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 1965 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1787 AND "precio_venta" = 2600 AND "precio_costo" = 1965 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DOBLE-V WHISKY 1L · $4.817,92: $4.817,92 → $6.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 6300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 221 AND "precio_venta" IS NOT DISTINCT FROM 4817.92 AND "precio_costo" IS NOT DISTINCT FROM 4817.92 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 6300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 221 AND "precio_venta" = 4817.92 AND "precio_costo" = 4817.92 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DORITO SWEET CHILI 35G · $1.650: $1.900 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1874 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1874 AND "precio_venta" = 1900 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DORITO 82G EXRA FLAMIN HOT · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1872 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1872 AND "precio_venta" = 2500 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DORITO DINAMITA 45G · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1879 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1879 AND "precio_venta" = 1700 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DORITO FLAMINT HOT 45G · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1873 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1873 AND "precio_venta" = 1700 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Dorito Pizza 74g · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1950 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1950 AND "precio_venta" = 3300 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DORITOS 40g · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 226 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 226 AND "precio_venta" = 2000 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DORITOS 77G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 225 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 225 AND "precio_venta" = 3300 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DORITOS SWEET CHILI 74G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1561 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1561 AND "precio_venta" = 3300 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DOWNY 400ML BRISA INTENSO · $3.141: $4.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1722 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3141 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1722 AND "precio_venta" = 4100 AND "precio_costo" = 3141 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DOWNY BRISA DE VERANO · $2.650: $3.200 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1957 AND "precio_venta" IS NOT DISTINCT FROM 3200 AND "precio_costo" IS NOT DISTINCT FROM 2650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1957 AND "precio_venta" = 3200 AND "precio_costo" = 2650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DOWNY BRISA SUAVE · $2.650: $3.200 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1987 AND "precio_venta" IS NOT DISTINCT FROM 3200 AND "precio_costo" IS NOT DISTINCT FROM 2650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1987 AND "precio_venta" = 3200 AND "precio_costo" = 2650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DOWNY BRISA SUAVE 500ML · $3.400: $4.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 867 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 867 AND "precio_venta" = 4500 AND "precio_costo" = 3400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · DOWNYY CONCENTRADO 1L BRISA DE VERANO · $7.842: $10.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1449 AND "precio_venta" IS NOT DISTINCT FROM 10200 AND "precio_costo" IS NOT DISTINCT FROM 7842 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1449 AND "precio_venta" = 10200 AND "precio_costo" = 7842 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ELEMENTOS Malbec · $25.200: $25.000 → $32.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 32800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 231 AND "precio_venta" IS NOT DISTINCT FROM 25000 AND "precio_costo" IS NOT DISTINCT FROM 25200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 32800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 231 AND "precio_venta" = 25000 AND "precio_costo" = 25200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ELITE DISNEY X6 · $1.146: $1.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1207 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1146 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1207 AND "precio_venta" = 1500 AND "precio_costo" = 1146 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ELITE PAÑUELOS X6paq · $1.600: $2.100 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 232 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 232 AND "precio_venta" = 2100 AND "precio_costo" = 1600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ESCOBA EUROPA · $1.390: $1.900 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1261 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1390 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1261 AND "precio_venta" = 1900 AND "precio_costo" = 1390 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ESCOBILLON ECON · $1.411: $1.900 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 236 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1411 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 34, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 236 AND "precio_venta" = 1900 AND "precio_costo" = 1411 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ESCOBILLON KALPON GONDOLA · $1.880: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1394 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1394 AND "precio_venta" = 2500 AND "precio_costo" = 1880 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ESCOBILLON NEPTUNO DEA · $2.055: $2.700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1395 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2055 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1395 AND "precio_venta" = 2700 AND "precio_costo" = 2055 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ESCOLAZO NAIPES 50 · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1584 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1584 AND "precio_venta" = 1600 AND "precio_costo" = 1200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ESPIRAL RAID caja 12 x 4 · $9.375: $12.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 692 AND "precio_venta" IS NOT DISTINCT FROM 12200 AND "precio_costo" IS NOT DISTINCT FROM 9375 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 692 AND "precio_venta" = 12200 AND "precio_costo" = 9375 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ESPONJA AMARILLA BATUQUE · $220: $300 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1027 AND "precio_venta" IS NOT DISTINCT FROM 300 AND "precio_costo" IS NOT DISTINCT FROM 220 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1027 AND "precio_venta" = 300 AND "precio_costo" = 220 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ESPONJA DE BRONCE DEA · $505: $700 sin cambio · margen 38
UPDATE "ProductoLocal" SET "margen" = 38, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 721 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 505 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 38, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 721 AND "precio_venta" = 700 AND "precio_costo" = 505 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FANTOCHE ELIXIR ALFAJOR · $7.421: $9.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1548 AND "precio_venta" IS NOT DISTINCT FROM 9700 AND "precio_costo" IS NOT DISTINCT FROM 7421 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1548 AND "precio_venta" = 9700 AND "precio_costo" = 7421 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FERNET 1882 LATA · $40.800: $12.000 → $53.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 53100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 248 AND "precio_venta" IS NOT DISTINCT FROM 12000 AND "precio_costo" IS NOT DISTINCT FROM 40800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 53100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 248 AND "precio_venta" = 12000 AND "precio_costo" = 40800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Fernet 1lt Branca · $112.450: $142.000 → $146.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 146200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 262 AND "precio_venta" IS NOT DISTINCT FROM 142000 AND "precio_costo" IS NOT DISTINCT FROM 112450 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 146200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 262 AND "precio_venta" = 142000 AND "precio_costo" = 112450 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FERNET BRANCA 750ML · $166.860: $210.600 → $217.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 217000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 249 AND "precio_venta" IS NOT DISTINCT FROM 210600 AND "precio_costo" IS NOT DISTINCT FROM 166860 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 217000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 249 AND "precio_venta" = 210600 AND "precio_costo" = 166860 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FERNET BRANCA MENTA 750 · $162.000: $13.100 → $210.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 210600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1222 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 162000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 210600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1222 AND "precio_venta" = 13100 AND "precio_costo" = 162000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FERNET BUHERO MANDELO · $49.152,15: $49.152,15 → $63.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 63900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1876 AND "precio_venta" IS NOT DISTINCT FROM 49152.15 AND "precio_costo" IS NOT DISTINCT FROM 49152.15 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 63900, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1876 AND "precio_venta" = 49152.15 AND "precio_costo" = 49152.15 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FRANELA FIBRAN · $1.040: $1.400 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 254 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1040 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 34, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 254 AND "precio_venta" = 1400 AND "precio_costo" = 1040 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FRANELA NUVIA · $821: $1.100 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 255 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 821 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 255 AND "precio_venta" = 1100 AND "precio_costo" = 821 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · fresita farruca · $14.200: $18.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1864 AND "precio_venta" IS NOT DISTINCT FROM 18500 AND "precio_costo" IS NOT DISTINCT FROM 14200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1864 AND "precio_venta" = 18500 AND "precio_costo" = 14200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FRIZZE AZUL 1L · $15.000: $17.000 → $19.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 256 AND "precio_venta" IS NOT DISTINCT FROM 17000 AND "precio_costo" IS NOT DISTINCT FROM 15000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 19500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 256 AND "precio_venta" = 17000 AND "precio_costo" = 15000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FRIZZE LATA BLUE · $36.000: $11.400 → $46.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 46800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 272 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 36000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 46800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 272 AND "precio_venta" = 11400 AND "precio_costo" = 36000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FUYI AEROSOL 360CM3 · $3.510: $4.600 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 934 AND "precio_venta" IS NOT DISTINCT FROM 4600 AND "precio_costo" IS NOT DISTINCT FROM 3510 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 934 AND "precio_venta" = 4600 AND "precio_costo" = 3510 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · FUYI PASTILLA · $4.480: $5.900 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 876 AND "precio_venta" IS NOT DISTINCT FROM 5900 AND "precio_costo" IS NOT DISTINCT FROM 4480 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 876 AND "precio_venta" = 5900 AND "precio_costo" = 4480 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Fuyi TABLETA CAJA X12U · $3.100: $4.100 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 257 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 257 AND "precio_venta" = 4100 AND "precio_costo" = 3100 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GAMUZA HIGIENICO · $15.169,80: $15.100 → $19.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1050 AND "precio_venta" IS NOT DISTINCT FROM 15100 AND "precio_costo" IS NOT DISTINCT FROM 15169.8 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 19800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1050 AND "precio_venta" = 15100 AND "precio_costo" = 15169.8 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GANCIA 473ML · $12.000: $15.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 276 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 276 AND "precio_venta" = 15600 AND "precio_costo" = 12000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Gancia 950ml · $82.800: $107.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 288 AND "precio_venta" IS NOT DISTINCT FROM 107700 AND "precio_costo" IS NOT DISTINCT FROM 82800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 288 AND "precio_venta" = 107700 AND "precio_costo" = 82800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GANCIA SIN ALCOHOL · $48.000: $15.600 → $62.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 62400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1852 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 48000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 62400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1852 AND "precio_venta" = 15600 AND "precio_costo" = 48000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GATORADE ROJO 500ML · $6.720: $8.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 278 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 6720 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 278 AND "precio_venta" = 8800 AND "precio_costo" = 6720 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GATORADE AZUL 500ML · $6.720: $8.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 279 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 6720 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 279 AND "precio_venta" = 8800 AND "precio_costo" = 6720 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GAZA SUEZ CAJA · $2.672: $3.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 277 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2672 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 277 AND "precio_venta" = 3500 AND "precio_costo" = 2672 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GEL INTIMO TULIPAN · $2.993: $3.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1315 AND "precio_venta" IS NOT DISTINCT FROM 3900 AND "precio_costo" IS NOT DISTINCT FROM 2993 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1315 AND "precio_venta" = 3900 AND "precio_costo" = 2993 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GILLETTE PRESTOBARBA · $12.000: $15.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 280 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 280 AND "precio_venta" = 15600 AND "precio_costo" = 12000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GILLETTE PRESTOBARBA 3 FILOS x5 · $7.850: $9.800 → $10.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1459 AND "precio_venta" IS NOT DISTINCT FROM 9800 AND "precio_costo" IS NOT DISTINCT FROM 7850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 10300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1459 AND "precio_venta" = 9800 AND "precio_costo" = 7850 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GUANTES DEA CHICOS · $2.102: $2.800 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1390 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2102 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1390 AND "precio_venta" = 2800 AND "precio_costo" = 2102 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GUANTES DEA GRANDE · $1.960: $2.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1388 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 1960 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1388 AND "precio_venta" = 2600 AND "precio_costo" = 1960 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GUANTES NUVIA M · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1391 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1391 AND "precio_venta" = 1600 AND "precio_costo" = 1200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GUANTES NUVIA S · $1.125: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1389 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1125 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1389 AND "precio_venta" = 1500 AND "precio_costo" = 1125 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · GUMBALLS X18 · $3.394: $4.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1156 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3394 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1156 AND "precio_venta" = 4500 AND "precio_costo" = 3394 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Harina 0000 Venado Tuerto X10 · $10.396: $11.700 → $13.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 300 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 10396 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 13600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 300 AND "precio_venta" = 11700 AND "precio_costo" = 10396 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Harina Cañuelas 000 · $8.615,80: $8.400 → $11.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1941 AND "precio_venta" IS NOT DISTINCT FROM 8400 AND "precio_costo" IS NOT DISTINCT FROM 8615.8 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 11300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1941 AND "precio_venta" = 8400 AND "precio_costo" = 8615.8 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Harina Pizza Pureza · $16.667,40: $16.200 → $21.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 302 AND "precio_venta" IS NOT DISTINCT FROM 16200 AND "precio_costo" IS NOT DISTINCT FROM 16667.4 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 21700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 302 AND "precio_venta" = 16200 AND "precio_costo" = 16667.4 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Harina Venado Tuerto Leudante · $11.658,90: $11.400 → $15.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 15200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 303 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 11658.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 15200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 303 AND "precio_venta" = 11400 AND "precio_costo" = 11658.9 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · HEINEKEN LATA 473 · $56.000: $72.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 930 AND "precio_venta" IS NOT DISTINCT FROM 72800 AND "precio_costo" IS NOT DISTINCT FROM 56000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 930 AND "precio_venta" = 72800 AND "precio_costo" = 56000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · HIGIENOL FRESH · $18.600: $21.700 → $24.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 305 AND "precio_venta" IS NOT DISTINCT FROM 21700 AND "precio_costo" IS NOT DISTINCT FROM 18600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 24200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 305 AND "precio_venta" = 21700 AND "precio_costo" = 18600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · imperial 1lt · $44.136: $44.200 → $57.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 57400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14418 AND "precio_venta" IS NOT DISTINCT FROM 44200 AND "precio_costo" IS NOT DISTINCT FROM 44136 AND "margen" IS NOT DISTINCT FROM -0.05 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 57400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2846 AND "precio_venta" = 44200 AND "precio_costo" = 44136 AND "margen" IS NOT DISTINCT FROM -0.05;

-- depo · IODOPOVIDONA · $2.140: $2.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 665 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2140 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 665 AND "precio_venta" = 2800 AND "precio_costo" = 2140 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jaimitos X 10u · $1.120: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 316 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1120 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 316 AND "precio_venta" = 1500 AND "precio_costo" = 1120 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Anana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1920 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1920 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Frutilla Anana Banana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1924 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1924 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Frutilla X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1923 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1923 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Limonada X Caja · $5.962,16: $7.900 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1919 AND "precio_venta" IS NOT DISTINCT FROM 7900 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1919 AND "precio_venta" = 7900 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Manzana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1916 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1916 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Multi Furta X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1918 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1918 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Naranja Dulce X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1922 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1922 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Naranja Banana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1921 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1921 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Naranja Durzano X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1917 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1917 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Naranja X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1915 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1915 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Jugo Arcor Pomelo Rosado X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1925 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1925 AND "precio_venta" = 6600 AND "precio_costo" = 5962.16 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KIMBIES TOALLITAS HUMEDAS X48 · $1.790: $2.400 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1175 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 34, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1175 AND "precio_venta" = 2400 AND "precio_costo" = 1790 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KIT DINI · $1.080: $1.500 sin cambio · margen 38
UPDATE "ProductoLocal" SET "margen" = 38, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1185 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1080 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 38, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1185 AND "precio_venta" = 1500 AND "precio_costo" = 1080 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABOR VERDURAS VERDE · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1769 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1769 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES AJI COMINO Y PIMEN · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1773 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1773 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES BARBACOA AHUMADA · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1765 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1765 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES CARNE · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1772 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1772 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES CIBOUL Y PUERRO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1766 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1766 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES OREG TOM Y AJO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1771 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1771 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES POLLO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1770 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1770 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES TOMA CEBO Y MORRON · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1774 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1774 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES VERDURAS · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1767 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1767 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR MIX SABORES VERDURAS 0 SODIO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1768 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1768 AND "precio_venta" = 1400 AND "precio_costo" = 1050 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR SOPA CREMA CHOCLO 70G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1608 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1608 AND "precio_venta" = 2200 AND "precio_costo" = 1621 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR SOPA CREMA VEGETALES 60G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 325 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 325 AND "precio_venta" = 2200 AND "precio_costo" = 1621 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR SOPA CREMA ZAPALLO 70G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 579 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 579 AND "precio_venta" = 2200 AND "precio_costo" = 1621 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR SOPA DE LETRAS · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1615 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1615 AND "precio_venta" = 2200 AND "precio_costo" = 1621 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR SOPA POLLO CABELLO DE ANGEL · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1612 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1612 AND "precio_venta" = 2200 AND "precio_costo" = 1621 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR SOPA VEGETALES CARACOLITOS TRICOLOR · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1613 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1613 AND "precio_venta" = 2200 AND "precio_costo" = 1621 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KNORR SOPA VEGETALES MUNICIONES · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1614 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1614 AND "precio_venta" = 2200 AND "precio_costo" = 1621 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KOLYNOS 70g · $22.440: $2.500 → $29.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 29200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 320 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 22440 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 29200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 320 AND "precio_venta" = 2500 AND "precio_costo" = 22440 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KROMY x48unid · $6.427: $6.700 → $8.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 8400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1137 AND "precio_venta" IS NOT DISTINCT FROM 6700 AND "precio_costo" IS NOT DISTINCT FROM 6427 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 8400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1137 AND "precio_venta" = 6700 AND "precio_costo" = 6427 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · KROOMY X12 · $4.100: $4.500 → $5.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 834 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 4100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 5400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 834 AND "precio_venta" = 4500 AND "precio_costo" = 4100 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · kroomy 10g frutichox24u · $3.500: $4.500 → $4.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1887 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1887 AND "precio_venta" = 4500 AND "precio_costo" = 3500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LA GOTITA 2ML · $10.400: $12.500 → $13.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 718 AND "precio_venta" IS NOT DISTINCT FROM 12500 AND "precio_costo" IS NOT DISTINCT FROM 10400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 13600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 718 AND "precio_venta" = 12500 AND "precio_costo" = 10400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LA GOTITA GEL 3ML · $12.360,61: $15.700 → $16.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 16100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 717 AND "precio_venta" IS NOT DISTINCT FROM 15700 AND "precio_costo" IS NOT DISTINCT FROM 12360.61 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 16100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 717 AND "precio_venta" = 15700 AND "precio_costo" = 12360.61 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LA HOJA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1981 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1981 AND "precio_venta" = 1600 AND "precio_costo" = 1200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LA HOJA YERBA 500G · $13.363,20: $1.400 → $17.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1616 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 13363.2 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 17400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1616 AND "precio_venta" = 1400 AND "precio_costo" = 13363.2 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LA HUERTA CHICO 210G · $8.450: $9.900 → $11.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 842 AND "precio_venta" IS NOT DISTINCT FROM 9900 AND "precio_costo" IS NOT DISTINCT FROM 8450 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 11000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 842 AND "precio_venta" = 9900 AND "precio_costo" = 8450 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LA VIRGINIA TE TILO · $14.310: $18.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 609 AND "precio_venta" IS NOT DISTINCT FROM 18700 AND "precio_costo" IS NOT DISTINCT FROM 14310 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 609 AND "precio_venta" = 18700 AND "precio_costo" = 14310 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LADYSOFT NOCTURNA x16 · $2.505: $3.300 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1718 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2505 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1718 AND "precio_venta" = 3300 AND "precio_costo" = 2505 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAMPARA 7W · $4.340,85: $5.600 → $5.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1076 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4340.85 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 5700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1076 AND "precio_venta" = 5600 AND "precio_costo" = 4340.85 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAMPARA CANDELA 12W · $5.500: $7.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1217 AND "precio_venta" IS NOT DISTINCT FROM 7200 AND "precio_costo" IS NOT DISTINCT FROM 5500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1217 AND "precio_venta" = 7200 AND "precio_costo" = 5500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAMPARA CANDELA 15W · $5.750: $7.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1218 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 5750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1218 AND "precio_venta" = 7500 AND "precio_costo" = 5750 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · lamparita 12w · $750: $1.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 789 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 789 AND "precio_venta" = 1000 AND "precio_costo" = 750 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAMPARITAS 15W · $960: $1.300 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 790 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 960 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 790 AND "precio_venta" = 1300 AND "precio_costo" = 960 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Las Moras Malbec · $18.600: $23.100 → $24.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 264 AND "precio_venta" IS NOT DISTINCT FROM 23100 AND "precio_costo" IS NOT DISTINCT FROM 18600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 24200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 264 AND "precio_venta" = 23100 AND "precio_costo" = 18600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAVANDINA GIGANTE · $15.000: $1.300 → $19.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1985 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 15000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 19500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1985 AND "precio_venta" = 1300 AND "precio_costo" = 15000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAYS 40g QUESO CREMA · $1.650: $1.900 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1703 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1703 AND "precio_venta" = 1900 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAYS BARBACOA 77G · $2.500: $3.000 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1640 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1640 AND "precio_venta" = 3000 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAYS CLASICA 40G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 342 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 342 AND "precio_venta" = 2000 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAYS CLASICA 85g · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 343 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 343 AND "precio_venta" = 2500 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · lays flaming hot 30grs · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1021 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1021 AND "precio_venta" = 1700 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAYS HONDAS FH 70G · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 844 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 844 AND "precio_venta" = 2500 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAYS KETCHUP 77g · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1736 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1736 AND "precio_venta" = 2500 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAYS PANCETA 77G · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1641 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1641 AND "precio_venta" = 2500 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LAYS QUESO CREMA Y CEBOLLA 77g · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 345 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 345 AND "precio_venta" = 2500 AND "precio_costo" = 2500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LHERITIER 110G · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1815 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1815 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LIMZUL 800ML · $1.600: $2.100 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1986 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1986 AND "precio_venta" = 2100 AND "precio_costo" = 1600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · LINA TOALLITAS NOCTURNA · $86.400: $14.100 → $112.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 112400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 610 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 86400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 112400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 610 AND "precio_venta" = 14100 AND "precio_costo" = 86400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Liverpool azul · $13.200: $13.200 → $17.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6151 AND "precio_venta" IS NOT DISTINCT FROM 13200 AND "precio_costo" IS NOT DISTINCT FROM 13200 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 17200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2060 AND "precio_venta" = 13200 AND "precio_costo" = 13200 AND "margen" IS NOT DISTINCT FROM 0;

-- depo · Liverpool verde · $13.200: $13.200 → $17.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6147 AND "precio_venta" IS NOT DISTINCT FROM 13200 AND "precio_costo" IS NOT DISTINCT FROM 13200 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 17200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2064 AND "precio_venta" = 13200 AND "precio_costo" = 13200 AND "margen" IS NOT DISTINCT FROM 0;

-- depo · LOS ARBOLES MALBEC · $24.600: $26.600 → $32.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 335 AND "precio_venta" IS NOT DISTINCT FROM 26600 AND "precio_costo" IS NOT DISTINCT FROM 24600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 32000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 335 AND "precio_venta" = 26600 AND "precio_costo" = 24600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Lucky 10 origen convertible · $5.658.000: $5.658.000 → $7.355.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7355400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14520 AND "precio_venta" IS NOT DISTINCT FROM 5658000 AND "precio_costo" IS NOT DISTINCT FROM 5658000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7355400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2876 AND "precio_venta" = 5658000 AND "precio_costo" = 5658000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Lucky 20 box · $62.346: $62.000 → $65.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6143 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Lucky 20 común · $58.000: $57.000 → $60.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 60000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6148 AND "precio_venta" IS NOT DISTINCT FROM 57000 AND "precio_costo" IS NOT DISTINCT FROM 58000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Lucky 20 convertible xl · $62.346: $62.000 → $65.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6152 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Lucky 20 Menta Comun · $56.460: $56.000 → $59.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 59000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6403 AND "precio_venta" IS NOT DISTINCT FROM 56000 AND "precio_costo" IS NOT DISTINCT FROM 56460 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Lucky 20 Origen Menta Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6298 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Lucky 20 red · $29.460: $29.000 → $32.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6091 AND "precio_venta" IS NOT DISTINCT FROM 29000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Lucky 20 Silver · $54.300: $54.000 → $57.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 57000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6516 AND "precio_venta" IS NOT DISTINCT FROM 54000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Lucky origen 20 comun · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6280 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Lucky origen 20 común mentolado · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6149 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · LYSOFORM AEROSOL CITRICA · $2.300: $3.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1655 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 2300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1655 AND "precio_venta" = 3000 AND "precio_costo" = 2300 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Lysonform Aerosol 360cm · $27.600: $3.000 → $35.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 35900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 349 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 27600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 35900, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 349 AND "precio_venta" = 3000 AND "precio_costo" = 27600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGDALENA DON SATUR CHIP · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 882 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 23500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 882 AND "precio_venta" = 21500 AND "precio_costo" = 18059.9 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGDALENA DON SATUR DDL · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 350 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 23500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 350 AND "precio_venta" = 21500 AND "precio_costo" = 18059.9 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGDALENAS DON SATUR VAINILLA · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 351 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 23500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 351 AND "precio_venta" = 21500 AND "precio_costo" = 18059.9 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGISTRAL 300 LIMON CREMOSO · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1519 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1519 AND "precio_venta" = 2200 AND "precio_costo" = 1800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGISTRAL 300 PUREZA ACTIVE · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1518 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1518 AND "precio_venta" = 2200 AND "precio_costo" = 1800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGISTRAL 300ML LIMON · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 352 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 352 AND "precio_venta" = 2200 AND "precio_costo" = 1800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGISTRAL 300ml MARINA · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 353 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 353 AND "precio_venta" = 2200 AND "precio_costo" = 1800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGISTRAL 500ML MARINA · $3.200: $3.600 → $4.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 354 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 3200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 354 AND "precio_venta" = 3600 AND "precio_costo" = 3200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGISTRAL 5OOml LIMON · $2.750: $3.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 355 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 355 AND "precio_venta" = 3600 AND "precio_costo" = 2750 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAGNA 1.5L TONICA · $8.550: $8.000 → $11.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 357 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 8550 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 11200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 357 AND "precio_venta" = 8000 AND "precio_costo" = 8550 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAIZ PISINGALLO ELIO · $630: $900 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 800 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 630 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 42, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 800 AND "precio_venta" = 900 AND "precio_costo" = 630 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAÑANITA YERBA 500G · $16.500: $20.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 646 AND "precio_venta" IS NOT DISTINCT FROM 20200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 21500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 646 AND "precio_venta" = 20200 AND "precio_costo" = 16500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MAQUINA DE AFEITAR MINORA X10 · $8.000: $10.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1899 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 8000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1899 AND "precio_venta" = 10400 AND "precio_costo" = 8000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Marlboro 20 Box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6156 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · marlboro 20 comun · $64.000: $63.000 → $66.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 66000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6470 AND "precio_venta" IS NOT DISTINCT FROM 63000 AND "precio_costo" IS NOT DISTINCT FROM 64000 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 coral XL · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6155 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 Crafted Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6290 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 crafted común · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6089 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 crafted coral box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6088 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 Crafted menta box · $42.420: $42.000 → $45.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 45000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6093 AND "precio_venta" IS NOT DISTINCT FROM 42000 AND "precio_costo" IS NOT DISTINCT FROM 42420 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 crafted mentolado común · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6090 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 Crafted Uva Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6287 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 gold · $64.020: $64.000 → $67.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 67000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6614 AND "precio_venta" IS NOT DISTINCT FROM 64000 AND "precio_costo" IS NOT DISTINCT FROM 64020 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 menta box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6154 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 titanio · $74.000: $72.000 → $76.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 76000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6142 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 74000 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Marlboro 20 uva box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6153 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · MATECOCIDO TARAGUI XPACK 10 · $9.510: $12.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 898 AND "precio_venta" IS NOT DISTINCT FROM 12400 AND "precio_costo" IS NOT DISTINCT FROM 9510 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 898 AND "precio_venta" = 12400 AND "precio_costo" = 9510 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · mega hamblet mani xunidad · $1.495: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1594 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1495 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1594 AND "precio_venta" = 2000 AND "precio_costo" = 1495 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MIEL DECFA 250G · $887,66: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 933 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 887.66 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 933 AND "precio_venta" = 1000 AND "precio_costo" = 887.66 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · miller rubia 710cc · $78.800: $71.800 → $102.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 102500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14479 AND "precio_venta" IS NOT DISTINCT FROM 71800 AND "precio_costo" IS NOT DISTINCT FROM 78800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 102500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2863 AND "precio_venta" = 71800 AND "precio_costo" = 78800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MOCOVI ARROZ 500G · $4.900: $6.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 861 AND "precio_venta" IS NOT DISTINCT FROM 6400 AND "precio_costo" IS NOT DISTINCT FROM 4900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 861 AND "precio_venta" = 6400 AND "precio_costo" = 4900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MOCOVI ARROZ CAJA 500G · $870: $1.200 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 33 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 870 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 37, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 33 AND "precio_venta" = 1200 AND "precio_costo" = 870 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MOGUL GELATINA FRUTILLA 25g · $6.080: $8.000 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1752 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 6080 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1752 AND "precio_venta" = 8000 AND "precio_costo" = 6080 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MOGUL RODAJAS ACIDAS 50G · $8.236: $7.900 → $10.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1145 AND "precio_venta" IS NOT DISTINCT FROM 7900 AND "precio_costo" IS NOT DISTINCT FROM 8236 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 10800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1145 AND "precio_venta" = 7900 AND "precio_costo" = 8236 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MOLTO DURAZNO LATA · $19.200: $2.100 → $25.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 25000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1728 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 19200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 25000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1728 AND "precio_venta" = 2100 AND "precio_costo" = 19200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MOÑO SOL PAMPEANO · $15.069,45: $19.500 → $19.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 368 AND "precio_venta" IS NOT DISTINCT FROM 19500 AND "precio_costo" IS NOT DISTINCT FROM 15069.45 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 19600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 368 AND "precio_venta" = 19500 AND "precio_costo" = 15069.45 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · MR. POPS CHUPETIN YOGUS 625G · $4.197: $5.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1569 AND "precio_venta" IS NOT DISTINCT FROM 5500 AND "precio_costo" IS NOT DISTINCT FROM 4197 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1569 AND "precio_venta" = 5500 AND "precio_costo" = 4197 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · mumm extrabrut caja x6 · $39.300: $51.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1861 AND "precio_venta" IS NOT DISTINCT FROM 51100 AND "precio_costo" IS NOT DISTINCT FROM 39300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1861 AND "precio_venta" = 51100 AND "precio_costo" = 39300 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · mym chocolate · $1.792: $2.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1418 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1792 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1418 AND "precio_venta" = 2400 AND "precio_costo" = 1792 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · mym mani · $1.792: $2.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1419 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1792 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1419 AND "precio_venta" = 2400 AND "precio_costo" = 1792 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Nacho Picante 80g · $1.400: $1.900 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 416 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 416 AND "precio_venta" = 1900 AND "precio_costo" = 1400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NAIPES BLANCAS x50 · $750: $1.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1404 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1404 AND "precio_venta" = 1000 AND "precio_costo" = 750 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NOBLEZA GAUCHA 500 G · $13.900: $1.900 → $18.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1290 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 13900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 18100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1290 AND "precio_venta" = 1900 AND "precio_costo" = 13900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NORTON COS TARDIA BLANCO · $5.270: $6.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 792 AND "precio_venta" IS NOT DISTINCT FROM 6900 AND "precio_costo" IS NOT DISTINCT FROM 5270 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 792 AND "precio_venta" = 6900 AND "precio_costo" = 5270 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NUGATON 177G · $8.930: $11.700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1960 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 8930 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1960 AND "precio_venta" = 11700 AND "precio_costo" = 8930 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NUVIA BOLSA 45x60 · $520: $700 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1531 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 520 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 34, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1531 AND "precio_venta" = 700 AND "precio_costo" = 520 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NUVIA BOLSA 60x90 · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1532 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1532 AND "precio_venta" = 1500 AND "precio_costo" = 1100 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NUVIA ESPONJA ACERO · $295: $400 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1574 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 295 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 35, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1574 AND "precio_venta" = 400 AND "precio_costo" = 295 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NUVIA LANA ACERO · $531: $700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1576 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 531 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1576 AND "precio_venta" = 700 AND "precio_costo" = 531 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NUVIA PABILO · $280: $400 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1622 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 280 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 42, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1622 AND "precio_venta" = 400 AND "precio_costo" = 280 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · NUVIA SECADOR DE PISO Nº40 · $850: $1.200 sin cambio · margen 41
UPDATE "ProductoLocal" SET "margen" = 41, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1578 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 41, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1578 AND "precio_venta" = 1200 AND "precio_costo" = 850 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · OCB Negro · $17.400: $22.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 752 AND "precio_venta" IS NOT DISTINCT FROM 22700 AND "precio_costo" IS NOT DISTINCT FROM 17400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 752 AND "precio_venta" = 22700 AND "precio_costo" = 17400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ODOL 90g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 417 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 417 AND "precio_venta" = 2000 AND "precio_costo" = 1500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ODOLITO 50g · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1302 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1302 AND "precio_venta" = 1500 AND "precio_costo" = 1100 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ODOLITO 50G · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 927 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 927 AND "precio_venta" = 1500 AND "precio_costo" = 1100 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · OFF CREMA 196g · $4.000: $5.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1749 AND "precio_venta" IS NOT DISTINCT FROM 5200 AND "precio_costo" IS NOT DISTINCT FROM 4000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1749 AND "precio_venta" = 5200 AND "precio_costo" = 4000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · OFF CREMA 60G · $33.600: $43.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 765 AND "precio_venta" IS NOT DISTINCT FROM 43700 AND "precio_costo" IS NOT DISTINCT FROM 33600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 765 AND "precio_venta" = 43700 AND "precio_costo" = 33600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · OKEBON CHOCOLATADA 273G · $1.065: $1.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1550 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1065 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1550 AND "precio_venta" = 1400 AND "precio_costo" = 1065 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · OKEBON LECHE 273G · $1.065: $1.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1556 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1065 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1556 AND "precio_venta" = 1400 AND "precio_costo" = 1065 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ORIETA DURAZNO · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 4007 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2007 AND "precio_venta" = 1600 AND "precio_costo" = 1200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ORIETA MERMELADA FRUTILLA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1790 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1790 AND "precio_venta" = 1600 AND "precio_costo" = 1200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Otro Loco Mas XCAJA · $21.000: $27.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 426 AND "precio_venta" IS NOT DISTINCT FROM 27300 AND "precio_costo" IS NOT DISTINCT FROM 21000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 426 AND "precio_venta" = 27300 AND "precio_costo" = 21000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · palito de la selva caja anana · $4.097: $5.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 994 AND "precio_venta" IS NOT DISTINCT FROM 5400 AND "precio_costo" IS NOT DISTINCT FROM 4097 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 994 AND "precio_venta" = 5400 AND "precio_costo" = 4097 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · palito de la selva caja blueberry · $4.097: $5.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 995 AND "precio_venta" IS NOT DISTINCT FROM 5400 AND "precio_costo" IS NOT DISTINCT FROM 4097 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 995 AND "precio_venta" = 5400 AND "precio_costo" = 4097 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PALITO DE LA SELVA CAJA COMUN · $4.261: $5.600 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1192 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4261 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1192 AND "precio_venta" = 5600 AND "precio_costo" = 4261 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PALO MADERA · $621: $900 sin cambio · margen 44
UPDATE "ProductoLocal" SET "margen" = 44, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 427 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 44, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 427 AND "precio_venta" = 900 AND "precio_costo" = 621 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · pan congelado xkg · $3.000: $3.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1721 AND "precio_venta" IS NOT DISTINCT FROM 3900 AND "precio_costo" IS NOT DISTINCT FROM 3000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1721 AND "precio_venta" = 3900 AND "precio_costo" = 3000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PAÑO AMARILLO · $375: $500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 430 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 375 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 430 AND "precio_venta" = 500 AND "precio_costo" = 375 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PANTENE ACONDICIONADOR LISO EXTREMO 10ML · $4.300: $5.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1233 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1233 AND "precio_venta" = 5600 AND "precio_costo" = 4300 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PAPA CONGELADA SIPOLOT 700G · $3.150: $4.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 757 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3150 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 757 AND "precio_venta" = 4100 AND "precio_costo" = 3150 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PARCHE N°3 · $2.545: $3.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 886 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2545 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 886 AND "precio_venta" = 3400 AND "precio_costo" = 2545 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PARCHE N°5 · $4.420: $5.800 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 885 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 4420 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 885 AND "precio_venta" = 5800 AND "precio_costo" = 4420 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PATRICH AEROSOL 230ml grand prix · $2.700: $3.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1711 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1711 AND "precio_venta" = 3600 AND "precio_costo" = 2700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PATRICHS AVIATOR 150ML CELESTE · $2.600: $3.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 428 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 428 AND "precio_venta" = 3400 AND "precio_costo" = 2600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PATRICHS BLACK LABEL NEGRO 150ML · $2.600: $3.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 873 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 873 AND "precio_venta" = 3400 AND "precio_costo" = 2600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PBT JYQ · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 747 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 747 AND "precio_venta" = 1700 AND "precio_costo" = 1300 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PELEADOR ARROZ 1Kg · $12.000: $15.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 452 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 452 AND "precio_venta" = 15600 AND "precio_costo" = 12000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PELEADOR ARROZ 500G · $6.500: $8.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 453 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 453 AND "precio_venta" = 8500 AND "precio_costo" = 6500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · pep palito panceta 84g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1324 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1324 AND "precio_venta" = 2000 AND "precio_costo" = 1500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · pep ramita queso 84g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 4020 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2020 AND "precio_venta" = 2000 AND "precio_costo" = 1500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · pep ramitas queso 40g · $790: $1.100 sin cambio · margen 39
UPDATE "ProductoLocal" SET "margen" = 39, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 4019 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 39, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2019 AND "precio_venta" = 1100 AND "precio_costo" = 790 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PEP RUEDITAS PIZZA 74G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 454 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 2200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 454 AND "precio_venta" = 2000 AND "precio_costo" = 1650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PERFUMINA DEA 900ML CHERRY · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1012 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1012 AND "precio_venta" = 1200 AND "precio_costo" = 10800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PERFUMINA DEA 900ML COLONIA · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1030 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1030 AND "precio_venta" = 1200 AND "precio_costo" = 10800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PERFUMINA DEA 900ML LAVANDA · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1013 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1013 AND "precio_venta" = 1200 AND "precio_costo" = 10800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PERFUMINA DEA 900ML MARINA · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1014 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1014 AND "precio_venta" = 1200 AND "precio_costo" = 10800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PERFUMINA DEA 900ML MIL FLORES · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1015 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1015 AND "precio_venta" = 1200 AND "precio_costo" = 10800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PERFUMINA DEA 900ML PINO · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1184 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1184 AND "precio_venta" = 1200 AND "precio_costo" = 10800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PETACA CHOCOLATE · $15.600: $19.600 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1310 AND "precio_venta" IS NOT DISTINCT FROM 19600 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 20300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1310 AND "precio_venta" = 19600 AND "precio_costo" = 15600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PETACA CREMA AL WHISKY · $15.600: $19.600 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1309 AND "precio_venta" IS NOT DISTINCT FROM 19600 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 20300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1309 AND "precio_venta" = 19600 AND "precio_costo" = 15600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PHILCO PILAS AA x8 · $7.000: $9.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1383 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 7000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1383 AND "precio_venta" = 9100 AND "precio_costo" = 7000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PHILCO PILAS AAA x8 · $7.000: $9.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1382 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 7000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1382 AND "precio_venta" = 9100 AND "precio_costo" = 7000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Philips 20 bluw select · $29.460: $29.460 → $38.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 38300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14510 AND "precio_venta" IS NOT DISTINCT FROM 29460 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 38300, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2874 AND "precio_venta" = 29460 AND "precio_costo" = 29460 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Philips 20 box · $61.266: $61.000 → $64.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 64000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6083 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 61266 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Philips 20 común · $59.500: $59.000 → $62.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 62000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6082 AND "precio_venta" IS NOT DISTINCT FROM 59000 AND "precio_costo" IS NOT DISTINCT FROM 59500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · philips 20 mentolado box · $61.320: $61.000 → $64.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 64000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6477 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 61320 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · Philips 20 red común · $29.460: $29.000 → $32.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6150 AND "precio_venta" IS NOT DISTINCT FROM 29000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- depo · picadores marihuana x12 · $13.800: $18.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1196 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 13800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1196 AND "precio_venta" = 18000 AND "precio_costo" = 13800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PICNIC 38g · $375,35: $400 → $500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 771 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 375.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 771 AND "precio_venta" = 400 AND "precio_costo" = 375.35 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Pier rojo · $13.200: $13.200 → $17.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6157 AND "precio_venta" IS NOT DISTINCT FROM 13200 AND "precio_costo" IS NOT DISTINCT FROM 13200 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 17200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2054 AND "precio_venta" = 13200 AND "precio_costo" = 13200 AND "margen" IS NOT DISTINCT FROM 0;

-- depo · Pier Verde · $11.200: $14.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 457 AND "precio_venta" IS NOT DISTINCT FROM 14600 AND "precio_costo" IS NOT DISTINCT FROM 11200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 457 AND "precio_venta" = 14600 AND "precio_costo" = 11200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PILA EVEREADY AAA X24 · $10.800: $14.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 238 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 238 AND "precio_venta" = 14100 AND "precio_costo" = 10800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PILAS AAA ENERGIZER X4 · $3.482: $4.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 877 AND "precio_venta" IS NOT DISTINCT FROM 4600 AND "precio_costo" IS NOT DISTINCT FROM 3482 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 877 AND "precio_venta" = 4600 AND "precio_costo" = 3482 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE JABON x3 HUMENTACION · $2.000: $2.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1521 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1521 AND "precio_venta" = 2600 AND "precio_costo" = 2000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE x1 BALANCE · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1354 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1354 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE X1 COCO Y VAINILLA · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1747 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1747 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE X1 FLORES ROSAS · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1746 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1746 AND "precio_venta" = 1100 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE x1 HUMENTACION · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1350 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1350 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE x1 JAZMIN INTENSO · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1695 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1695 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE x1 LAVANDA · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1719 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1719 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE x1 NUTRICION · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1352 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1352 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE x1 RADIANTE · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1351 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1351 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PLUSBELLE x1 RECONEXION · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1353 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1353 AND "precio_venta" = 1000 AND "precio_costo" = 900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PORTEÑITAS 139G · $825: $1.100 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1566 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 825 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1566 AND "precio_venta" = 1100 AND "precio_costo" = 825 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · POXIPOL · $4.370: $5.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 698 AND "precio_venta" IS NOT DISTINCT FROM 5700 AND "precio_costo" IS NOT DISTINCT FROM 4370 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 698 AND "precio_venta" = 5700 AND "precio_costo" = 4370 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · prepizza cebolla · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1457 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1457 AND "precio_venta" = 1700 AND "precio_costo" = 1300 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · prepizza mixta · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1539 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1539 AND "precio_venta" = 1700 AND "precio_costo" = 1300 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PRESERVATIVO TULIPAN CLASICO x16U · $28.680: $37.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 667 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 28680 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 667 AND "precio_venta" = 37300 AND "precio_costo" = 28680 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PULVERIZADOR1L · $1.120: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1393 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1120 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1393 AND "precio_venta" = 1500 AND "precio_costo" = 1120 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Pure de tomate molto 520g X24 · $16.000: $18.500 → $20.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1972 AND "precio_venta" IS NOT DISTINCT FROM 18500 AND "precio_costo" IS NOT DISTINCT FROM 16000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 20800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1972 AND "precio_venta" = 18500 AND "precio_costo" = 16000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PURE HUERTA PULPA 205G X18 · $6.850: $9.000 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 441 AND "precio_venta" IS NOT DISTINCT FROM 9000 AND "precio_costo" IS NOT DISTINCT FROM 6850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 31, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 441 AND "precio_venta" = 9000 AND "precio_costo" = 6850 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · PURE LA HUERTA 530G X12 · $9.660: $12.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 443 AND "precio_venta" IS NOT DISTINCT FROM 12600 AND "precio_costo" IS NOT DISTINCT FROM 9660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 443 AND "precio_venta" = 12600 AND "precio_costo" = 9660 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · QUAKER AVENA TRADICIONAL · $1.790: $2.400 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1656 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 34, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1656 AND "precio_venta" = 2400 AND "precio_costo" = 1790 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · QUENTO ARROZ 92G · $1.320: $1.800 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1894 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1320 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1894 AND "precio_venta" = 1800 AND "precio_costo" = 1320 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · QUITA ESMALTE CUTEX · $1.361: $1.800 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 929 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1361 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 929 AND "precio_venta" = 1800 AND "precio_costo" = 1361 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · QUITA ESMALTE CUTEX VIOLETA · $1.361: $1.800 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 928 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1361 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 928 AND "precio_venta" = 1800 AND "precio_costo" = 1361 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · QUITAESMALTE NEPTUS 60CM · $600: $800 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1473 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1473 AND "precio_venta" = 800 AND "precio_costo" = 600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RAFFAELLO 90G · $4.453: $5.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1165 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 4453 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1165 AND "precio_venta" = 5800 AND "precio_costo" = 4453 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RAFTING 3L NARANJA · $9.460: $12.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 501 AND "precio_venta" IS NOT DISTINCT FROM 12300 AND "precio_costo" IS NOT DISTINCT FROM 9460 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 501 AND "precio_venta" = 12300 AND "precio_costo" = 9460 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RAID AEROSOL SIN OLOR · $4.590: $6.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1581 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 4590 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1581 AND "precio_venta" = 6000 AND "precio_costo" = 4590 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RAID ESPIRAL 12U · $2.545: $3.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1529 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2545 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1529 AND "precio_venta" = 3400 AND "precio_costo" = 2545 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RAID ESPIRAL X12 LAVANDA · $2.700: $3.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1740 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1740 AND "precio_venta" = 3600 AND "precio_costo" = 2700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · raid lavanda x24 · $48.000: $62.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1860 AND "precio_venta" IS NOT DISTINCT FROM 62400 AND "precio_costo" IS NOT DISTINCT FROM 48000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1860 AND "precio_venta" = 62400 AND "precio_costo" = 48000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · raid x 24 · $50.000: $65.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1859 AND "precio_venta" IS NOT DISTINCT FROM 65000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1859 AND "precio_venta" = 65000 AND "precio_costo" = 50000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RAMOLAC DULCE DE LECHE 200ML · $880: $1.200 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1664 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 36, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1664 AND "precio_venta" = 1200 AND "precio_costo" = 880 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RAVIOLES VILLAD AGRI carne y verdura · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1337 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1337 AND "precio_venta" = 2000 AND "precio_costo" = 1500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RAYOVAC AAA X 5U · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1009 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1009 AND "precio_venta" = 1600 AND "precio_costo" = 1200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RED LABEL WHISKY 1L · $22.945: $29.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1636 AND "precio_venta" IS NOT DISTINCT FROM 29900 AND "precio_costo" IS NOT DISTINCT FROM 22945 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1636 AND "precio_venta" = 29900 AND "precio_costo" = 22945 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · RED LABEL WHISKY 750ML · $19.296: $25.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1635 AND "precio_venta" IS NOT DISTINCT FROM 25100 AND "precio_costo" IS NOT DISTINCT FROM 19296 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1635 AND "precio_venta" = 25100 AND "precio_costo" = 19296 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REJILLA NUVIA 32X42CM · $300: $400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 482 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 33, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 482 AND "precio_venta" = 400 AND "precio_costo" = 300 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REJILLA SUPER AUTO · $671: $900 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1392 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 671 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 34, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1392 AND "precio_venta" = 900 AND "precio_costo" = 671 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REX 250g · $2.006: $2.700 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1456 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2006 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 34, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1456 AND "precio_venta" = 2700 AND "precio_costo" = 2006 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA AERESOL BAMBOO · $3.140,99: $4.900 sin cambio · margen 56
UPDATE "ProductoLocal" SET "margen" = 56, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 483 AND "precio_venta" IS NOT DISTINCT FROM 4900 AND "precio_costo" IS NOT DISTINCT FROM 3140.99 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 56, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 483 AND "precio_venta" = 4900 AND "precio_costo" = 3140.99 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA AEROSOL ACTIVE MOTION 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 484 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 484 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · rexona aerosol antibacterial · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1136 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1136 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA AEROSOL ANTIBACTERIAL · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 910 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 910 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA AEROSOL COTTON DRY 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 485 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 485 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · rexona aerosol futbol fanatic · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1135 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1135 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · rexona aerosol futbol fanaticas · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1201 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1201 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA AEROSOL MEN INVISIBLE · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 783 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 783 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA AEROSOL MEN SENSITIVE 150ML · $3.650: $4.200 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 487 AND "precio_venta" IS NOT DISTINCT FROM 4200 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 487 AND "precio_venta" = 4200 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA AEROSOL NUTRITIVE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 486 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 486 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA BOLILLA ACTIVE EMOTION · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1174 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1174 AND "precio_venta" = 2800 AND "precio_costo" = 2638.95 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA BOLILLA BAMBOO & ALOE VERA X50ML · $2.700: $2.800 → $3.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1069 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1069 AND "precio_venta" = 2800 AND "precio_costo" = 2700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA BOLILLA INVISIBLE 50ML · $2.639,07: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 488 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2639.07 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 488 AND "precio_venta" = 2800 AND "precio_costo" = 2639.07 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA BOLILLA NUTRITIVE 50ML · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 489 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 489 AND "precio_venta" = 2800 AND "precio_costo" = 2638.95 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA BOLILLA POWDER DRY · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1173 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1173 AND "precio_venta" = 2800 AND "precio_costo" = 2638.95 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA BOLILLA V8 50ML · $2.639,07: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 490 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2639.07 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 3500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 490 AND "precio_venta" = 2800 AND "precio_costo" = 2639.07 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · rexona invisible mujer aerosol · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1042 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1042 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA JABON 125Fgr NUTRITIVE · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 491 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 491 AND "precio_venta" = 1100 AND "precio_costo" = 1090 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA JABON TOCADOR x1 BAMBOO · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 493 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 493 AND "precio_venta" = 1100 AND "precio_costo" = 1090 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA JABON TOCADOR X1 FUTBOL FANATICS · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1095 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1095 AND "precio_venta" = 1100 AND "precio_costo" = 1090 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA JABON TOCADOR x1 SENSIBLE FRESH · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 492 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 1500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 492 AND "precio_venta" = 1100 AND "precio_costo" = 1090 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA MEN AEROSOL HOMBRE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 782 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 782 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA MEN AEROSOL V8 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 497 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 497 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · REXONA MEN XTRACOOL 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 498 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 4800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 498 AND "precio_venta" = 3700 AND "precio_costo" = 3650 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · ROSAMONTE YERBA 500G · $15.000: $18.000 → $19.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 648 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 15000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 19500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 648 AND "precio_venta" = 18000 AND "precio_costo" = 15000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SALUTE ALCOHOL 500ML · $1.580: $2.100 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 666 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1580 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 32, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 666 AND "precio_venta" = 2100 AND "precio_costo" = 1580 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SCHNEIDER 473 · $34.000: $44.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 895 AND "precio_venta" IS NOT DISTINCT FROM 44200 AND "precio_costo" IS NOT DISTINCT FROM 34000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 895 AND "precio_venta" = 44200 AND "precio_costo" = 34000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SCHNEIDER 710ML · $53.500: $69.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 852 AND "precio_venta" IS NOT DISTINCT FROM 69600 AND "precio_costo" IS NOT DISTINCT FROM 53500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 852 AND "precio_venta" = 69600 AND "precio_costo" = 53500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SECCO 3L COLA · $9.700: $11.400 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 561 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 12700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 561 AND "precio_venta" = 11400 AND "precio_costo" = 9700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SECCO 3L LIMA LIMON · $9.700: $11.400 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 562 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 12700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 562 AND "precio_venta" = 11400 AND "precio_costo" = 9700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SECCO 3L LIMON INTENSO · $9.700: $11.400 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 563 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 12700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 563 AND "precio_venta" = 11400 AND "precio_costo" = 9700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SECCO 3L NARANJA · $9.700: $11.400 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 686 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 12700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 686 AND "precio_venta" = 11400 AND "precio_costo" = 9700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SECCO 3L POMELO · $9.700: $11.400 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 564 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 12700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 564 AND "precio_venta" = 11400 AND "precio_costo" = 9700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · sedal acondicionador liso 190 · $32.004,36: $2.900 → $41.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 41700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1998 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 41700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1998 AND "precio_venta" = 2900 AND "precio_costo" = 32004.36 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SEDAL ACONDICIONADOR x10ML BALANCE · $5.373,36: $5.600 → $7.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1362 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 5373.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 7000, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1362 AND "precio_venta" = 5600 AND "precio_costo" = 5373.36 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SEDAL SHAMPOO x190ml BALANCE · $32.004,36: $2.900 → $41.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 41700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1369 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 41700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1369 AND "precio_venta" = 2900 AND "precio_costo" = 32004.36 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · Skyy Coconut X CAJA · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 568 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 568 AND "precio_venta" = 132600 AND "precio_costo" = 102000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SKYY VODKA APRICOT X CAJA · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1204 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1204 AND "precio_venta" = 132600 AND "precio_costo" = 102000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SKYY VODKA BLOOD ORANGE X CAJA · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1593 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1593 AND "precio_venta" = 132600 AND "precio_costo" = 102000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SKYY VODKA COSMIC X CAJA · $102.000: $171.600 sin cambio · margen 69
UPDATE "ProductoLocal" SET "margen" = 69, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1549 AND "precio_venta" IS NOT DISTINCT FROM 171600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 69, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1549 AND "precio_venta" = 171600 AND "precio_costo" = 102000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SKYY VODKA RASBERRY X CAJA 12U · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 571 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 571 AND "precio_venta" = 132600 AND "precio_costo" = 102000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SMIRNOFF VODKA CLASICO · $87.600: $107.700 → $113.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 113900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 572 AND "precio_venta" IS NOT DISTINCT FROM 107700 AND "precio_costo" IS NOT DISTINCT FROM 87600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 113900, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 572 AND "precio_venta" = 107700 AND "precio_costo" = 87600 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SOL MAYOR ROLLO DE COCINA · $13.500: $15.900 → $17.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1617 AND "precio_venta" IS NOT DISTINCT FROM 15900 AND "precio_costo" IS NOT DISTINCT FROM 13500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 17600, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1617 AND "precio_venta" = 15900 AND "precio_costo" = 13500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SOL PAMPEANO MOSTACHOL · $10.800: $12.300 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 367 AND "precio_venta" IS NOT DISTINCT FROM 12300 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 14100, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 367 AND "precio_venta" = 12300 AND "precio_costo" = 10800 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SOL PAMPEANO TALLARIN · $14.400: $15.800 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 802 AND "precio_venta" IS NOT DISTINCT FROM 15800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 18800, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 802 AND "precio_venta" = 15800 AND "precio_costo" = 14400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SPEED CHICO · $33.320: $40.800 → $43.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 758 AND "precio_venta" IS NOT DISTINCT FROM 40800 AND "precio_costo" IS NOT DISTINCT FROM 33320 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 43400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 758 AND "precio_venta" = 40800 AND "precio_costo" = 33320 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · SPEED XL · $23.500: $30.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 580 AND "precio_venta" IS NOT DISTINCT FROM 30600 AND "precio_costo" IS NOT DISTINCT FROM 23500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 580 AND "precio_venta" = 30600 AND "precio_costo" = 23500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · speed zero · $18.900: $24.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 846 AND "precio_venta" IS NOT DISTINCT FROM 24600 AND "precio_costo" IS NOT DISTINCT FROM 18900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 846 AND "precio_venta" = 24600 AND "precio_costo" = 18900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · STELLA 473ML · $52.160: $67.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 535 AND "precio_venta" IS NOT DISTINCT FROM 67900 AND "precio_costo" IS NOT DISTINCT FROM 52160 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 535 AND "precio_venta" = 67900 AND "precio_costo" = 52160 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · TARAGUI YERBA 500G · $16.500: $20.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 649 AND "precio_venta" IS NOT DISTINCT FROM 20200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 21500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 649 AND "precio_venta" = 20200 AND "precio_costo" = 16500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · TERRABUSI VARIEDAD 390G · $44.700: $17.500 → $58.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 58200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 635 AND "precio_venta" IS NOT DISTINCT FROM 17500 AND "precio_costo" IS NOT DISTINCT FROM 44700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 58200, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 635 AND "precio_venta" = 17500 AND "precio_costo" = 44700 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · TORO AMARRILLA 700ML PACK X 6 · $8.400: $11.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 594 AND "precio_venta" IS NOT DISTINCT FROM 11000 AND "precio_costo" IS NOT DISTINCT FROM 8400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 594 AND "precio_venta" = 11000 AND "precio_costo" = 8400 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · TORO AMARILLA BOTELLON 1L · $11.000: $14.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 595 AND "precio_venta" IS NOT DISTINCT FROM 14300 AND "precio_costo" IS NOT DISTINCT FROM 11000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 595 AND "precio_venta" = 14300 AND "precio_costo" = 11000 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · toro ETIQ BLANCA 750ML · $11.900: $15.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1856 AND "precio_venta" IS NOT DISTINCT FROM 15500 AND "precio_costo" IS NOT DISTINCT FROM 11900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1856 AND "precio_venta" = 15500 AND "precio_costo" = 11900 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · TRAVIATA CRACK PORTEÑITA 96g · $802: $1.700 sin cambio · margen 111
UPDATE "ProductoLocal" SET "margen" = 111, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1794 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 802 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 111, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 1794 AND "precio_venta" = 1700 AND "precio_costo" = 802 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · UNION YERBA 500G · $16.500: $20.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 654 AND "precio_venta" IS NOT DISTINCT FROM 20200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 21500, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 654 AND "precio_venta" = 20200 AND "precio_costo" = 16500 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · VENADO TUERTO HARINA 000 · $8.991,70: $9.900 → $11.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 299 AND "precio_venta" IS NOT DISTINCT FROM 9900 AND "precio_costo" IS NOT DISTINCT FROM 8991.7 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 11700, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 299 AND "precio_venta" = 9900 AND "precio_costo" = 8991.7 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · VENUS 3 FILOS · $7.200: $8.800 → $9.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 640 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 7200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "precio_venta" = 9400, "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 640 AND "precio_venta" = 8800 AND "precio_costo" = 7200 AND "margen" IS NOT DISTINCT FROM NULL;

-- depo · VINO TORO ETIQUETA BLANCA 1.125L · $15.200: $19.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 596 AND "precio_venta" IS NOT DISTINCT FROM 19800 AND "precio_costo" IS NOT DISTINCT FROM 15200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
UPDATE "ProductoBase" SET "margen" = 30, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 596 AND "precio_venta" = 19800 AND "precio_costo" = 15200 AND "margen" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Aceitunas negras · $14.580: $19.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8976 AND "precio_venta" IS NOT DISTINCT FROM 0 AND "precio_costo" IS NOT DISTINCT FROM 14580 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · adesivo candela · $400: $400 → $600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14434 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 400 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · arcor masiso 80grs chocolate crispy · $28.402,67: $18.200 → $39.900 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 39900, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3706 AND "precio_venta" IS NOT DISTINCT FROM 18200 AND "precio_costo" IS NOT DISTINCT FROM 28402.67 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · AZUFRE · $1.200: $300 → $1.600 · margen 33
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2680 AND "precio_venta" IS NOT DISTINCT FROM 300 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAGGIO 1L CHOCOLATADA X8 · $18.400: $15.200 → $24.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2167 AND "precio_venta" IS NOT DISTINCT FROM 15200 AND "precio_costo" IS NOT DISTINCT FROM 18400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAGGIO 200 ML MANZANA · $8.380: $8.400 → $10.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3215 AND "precio_venta" IS NOT DISTINCT FROM 8400 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAGGIO 200 NARANJA · $8.380: $8.400 → $10.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3680 AND "precio_venta" IS NOT DISTINCT FROM 8400 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAGGIO 200ML MULTIFRUTA · $8.380: $8.400 → $10.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2078 AND "precio_venta" IS NOT DISTINCT FROM 8400 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAGGIO 7 DIAS 1L CHOCOLATADA · $13.105: $13.100 → $17.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3678 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 13105 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BAGGIO DURAZNO 200 · $8.380: $8.400 → $10.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3203 AND "precio_venta" IS NOT DISTINCT FROM 8400 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BENGALA X4 · $1.900: $1.900 → $2.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2068 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · bengalas x2 · $2.000: $2.000 → $2.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3542 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BIC ENCENDEDOR MAXI · $18.260: $18.300 → $23.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3218 AND "precio_venta" IS NOT DISTINCT FROM 18300 AND "precio_costo" IS NOT DISTINCT FROM 18260 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BIC ENCENDEDOR MINI · $12.575: $12.600 → $16.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 16400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2240 AND "precio_venta" IS NOT DISTINCT FROM 12600 AND "precio_costo" IS NOT DISTINCT FROM 12575 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BLENDERS WHISKY 75O ML · $42.259,05: $40.800 → $55.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 55000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3072 AND "precio_venta" IS NOT DISTINCT FROM 40800 AND "precio_costo" IS NOT DISTINCT FROM 42259.05 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · bolsa consorcio 90x120 · $1.500: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14424 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BOLSAS RERSIDUO 45X60 · $660: $700 → $900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2071 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · BROCHES X12u PLASCTICO NUVIA · $800: $800 → $1.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2073 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Budin elixir x6 · $6.000: $6.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6060 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 6000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CABALLA EN ACEITE BAHIA X425 · $77.520: $77.500 → $100.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 100800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3907 AND "precio_venta" IS NOT DISTINCT FROM 77500 AND "precio_costo" IS NOT DISTINCT FROM 77520 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CABO MADERA · $1.200: $1.200 → $1.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3315 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Camel 20 box · $69.000: $72.000 → $89.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 89700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15578 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CANDELA GLOBOS 50U · $2.900: $2.900 → $3.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3666 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 2900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CBSE YERBA 500G · $18.000: $18.000 → $23.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2669 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 18000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · celusal parrillera · $38.700: $38.700 → $50.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 50400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3814 AND "precio_venta" IS NOT DISTINCT FROM 38700 AND "precio_costo" IS NOT DISTINCT FROM 38700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Cepillo de Dientes Mr G · $6.600: $6.600 → $8.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 8600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6031 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 6600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · cepillo de mano planchita · $1.385,45: $1.400 → $1.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3333 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1385.45 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CERVEZA 1890 1L · $26.000: $26.000 → $33.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 33800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2002 AND "precio_venta" IS NOT DISTINCT FROM 26000 AND "precio_costo" IS NOT DISTINCT FROM 26000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CERVEZA 1890 LATA · $26.000: $26.000 → $33.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 33800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3383 AND "precio_venta" IS NOT DISTINCT FROM 26000 AND "precio_costo" IS NOT DISTINCT FROM 26000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CERVEZA HEINEKEN 1L · $56.500: $56.500 → $73.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 73500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2304 AND "precio_venta" IS NOT DISTINCT FROM 56500 AND "precio_costo" IS NOT DISTINCT FROM 56500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHANDON APERITIF XCAJA · $90.000: $90.000 → $117.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 117000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2769 AND "precio_venta" IS NOT DISTINCT FROM 90000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHANDON DELICE XCAJA · $90.000: $90.000 → $117.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 117000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2163 AND "precio_venta" IS NOT DISTINCT FROM 90000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHANDON ROSÈ XCAJA · $90.000: $90.000 → $117.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 117000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3639 AND "precio_venta" IS NOT DISTINCT FROM 90000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHANITA ROLLO DE COCINA · $7.481: $7.500 → $9.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3065 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 7481 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHEETOS QUESO 85G · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3036 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CHEETOS QUESO CREMA 85G · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3347 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Chester 20 común · $49.980: $49.000 → $52.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 52000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6067 AND "precio_venta" IS NOT DISTINCT FROM 49000 AND "precio_costo" IS NOT DISTINCT FROM 49980 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Chester 20 mentolado box · $54.300: $54.000 → $57.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 57000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6069 AND "precio_venta" IS NOT DISTINCT FROM 54000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · chester 20 mentolado comun · $50.000: $49.000 → $52.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 52000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6475 AND "precio_venta" IS NOT DISTINCT FROM 49000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Chester 20 Purple motion 2 box · $55.380: $55.000 → $58.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 58000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6068 AND "precio_venta" IS NOT DISTINCT FROM 55000 AND "precio_costo" IS NOT DISTINCT FROM 55380 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · CHOCOLATIN BLANCO 20X8G · $5.694: $7.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3152 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 5694 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CITRIC X 1LTS · $46.400: $46.400 → $60.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 60400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2731 AND "precio_venta" IS NOT DISTINCT FROM 46400 AND "precio_costo" IS NOT DISTINCT FROM 46400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CLIGHT POMELO · $8.066: $8.100 → $10.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2179 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 8066 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · COLGATE DENTRIFICO 70G X12 · $22.200: $22.200 → $28.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 28900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3353 AND "precio_venta" IS NOT DISTINCT FROM 22200 AND "precio_costo" IS NOT DISTINCT FROM 22200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · COLIBRI POMADA NEGRO · $2.666: $2.700 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3264 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2666 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CONDIMENTO ARROZ 25G · $10.670,40: $9.500 → $13.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2138 AND "precio_venta" IS NOT DISTINCT FROM 9500 AND "precio_costo" IS NOT DISTINCT FROM 10670.4 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CONDIMENTO PIZZA · $9.000: $9.000 → $11.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2693 AND "precio_venta" IS NOT DISTINCT FROM 9000 AND "precio_costo" IS NOT DISTINCT FROM 9000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CORDERO CON PIEL DE LOBO · $22.500: $21.000 → $29.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 29300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2200 AND "precio_venta" IS NOT DISTINCT FROM 21000 AND "precio_costo" IS NOT DISTINCT FROM 22500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CORDON EL MOÑO X12U · $1.880: $1.900 → $2.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2139 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · cordones negros · $1.881: $1.900 → $2.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3334 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1881 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CORONA LATA 473ML · $36.000: $36.000 → $46.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 46800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3846 AND "precio_venta" IS NOT DISTINCT FROM 36000 AND "precio_costo" IS NOT DISTINCT FROM 36000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CUSENIER 700ML CAFE AL COGNAC · $33.130,35: $32.000 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2140 AND "precio_venta" IS NOT DISTINCT FROM 32000 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CUSENIER 700ML CHOCOLATE · $33.130,35: $32.000 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2141 AND "precio_venta" IS NOT DISTINCT FROM 32000 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · CUSENIER 700ML DULCE DE LECHE · $33.130,35: $32.000 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2142 AND "precio_venta" IS NOT DISTINCT FROM 32000 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DERNA PETACA CAFE AL COGNAC XCAJA · $14.400: $14.000 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2455 AND "precio_venta" IS NOT DISTINCT FROM 14000 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DERNA PETACA DULCE DE LECHE XCAJA · $15.600: $15.000 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3323 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DERNA PETACA VODKA XCAJA · $14.400: $14.000 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3324 AND "precio_venta" IS NOT DISTINCT FROM 14000 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DERNA PETACA WHISKY XCAJA · $14.400: $14.000 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2456 AND "precio_venta" IS NOT DISTINCT FROM 14000 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DINAMITA EXTRA FLAMIN HOT 82g · $1.965: $2.000 → $2.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3823 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1965 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Dorito Pizza 74g · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3984 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DORITOS 77G · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2225 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DORITOS SWEET CHILI 74G · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3597 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Dover suelto · $43: $100 sin cambio · margen 133
UPDATE "ProductoLocal" SET "margen" = 133, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13948 AND "precio_venta" IS NOT DISTINCT FROM 100 AND "precio_costo" IS NOT DISTINCT FROM 43 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOWNY BRISA DE VERANO · $2.650: $2.700 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3991 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOWNY BRISA SUAVE · $2.650: $2.700 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3556 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · DOWNY BRISA SUAVE 500ML · $3.400: $3.400 → $4.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2883 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 3400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ELEMENTOS Malbec · $25.200: $22.300 → $32.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 32800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2231 AND "precio_venta" IS NOT DISTINCT FROM 22300 AND "precio_costo" IS NOT DISTINCT FROM 25200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ELITE PAÑUELOS X6paq · $1.600: $1.600 → $2.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2232 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESCOBA EUROPA · $1.390: $1.400 → $1.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3273 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1390 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESCOBILLON KALPON GONDOLA · $1.880: $1.900 → $2.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3406 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESCOBILLON NEPTUNO DEA · $2.055: $2.100 → $2.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3407 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2055 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESCOLAZO NAIPES 50 · $1.200: $1.200 → $1.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3620 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ESPIRAL RAID caja 12 x 4 · $9.375: $9.400 → $12.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2708 AND "precio_venta" IS NOT DISTINCT FROM 9400 AND "precio_costo" IS NOT DISTINCT FROM 9375 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FANTOCHE ELIXIR ALFAJOR · $7.421: $7.400 → $9.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3584 AND "precio_venta" IS NOT DISTINCT FROM 7400 AND "precio_costo" IS NOT DISTINCT FROM 7421 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FERNET 1882 LATA · $40.800: $40.800 → $53.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 53100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2248 AND "precio_venta" IS NOT DISTINCT FROM 40800 AND "precio_costo" IS NOT DISTINCT FROM 40800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Fernet 1lt Branca · $109.200: $109.200 → $142.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 142000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2262 AND "precio_venta" IS NOT DISTINCT FROM 109200 AND "precio_costo" IS NOT DISTINCT FROM 109200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FERNET BRANCA 750ML · $162.000: $162.000 → $210.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 210600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2249 AND "precio_venta" IS NOT DISTINCT FROM 162000 AND "precio_costo" IS NOT DISTINCT FROM 162000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FERNET BRANCA MENTA 750 · $162.000: $162.000 → $210.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 210600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3234 AND "precio_venta" IS NOT DISTINCT FROM 162000 AND "precio_costo" IS NOT DISTINCT FROM 162000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FERNET BUHERO MANDELO · $49.152,15: $47.500 → $63.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 63900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3912 AND "precio_venta" IS NOT DISTINCT FROM 47500 AND "precio_costo" IS NOT DISTINCT FROM 49152.15 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · fresita farruca · $14.200: $14.200 → $18.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3900 AND "precio_venta" IS NOT DISTINCT FROM 14200 AND "precio_costo" IS NOT DISTINCT FROM 14200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FRIZZE AZUL 1L · $15.000: $13.100 → $19.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2256 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 15000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FRIZZE LATA BLUE · $36.000: $8.700 → $46.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 46800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2272 AND "precio_venta" IS NOT DISTINCT FROM 8700 AND "precio_costo" IS NOT DISTINCT FROM 36000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · full sport tropicales 500cc · $7.073: $7.100 → $9.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14475 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 7073 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · FUYI PASTILLA · $4.480: $5.900 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2892 AND "precio_venta" IS NOT DISTINCT FROM 5900 AND "precio_costo" IS NOT DISTINCT FROM 4480 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Fuyi TABLETA CAJA X12U · $3.100: $3.100 → $4.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2257 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 3100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GAMUZA HIGIENICO · $15.169,80: $11.600 → $19.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3066 AND "precio_venta" IS NOT DISTINCT FROM 11600 AND "precio_costo" IS NOT DISTINCT FROM 15169.8 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GANCIA 473ML · $12.000: $12.000 → $15.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 15600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2276 AND "precio_venta" IS NOT DISTINCT FROM 12000 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Gancia 950ml · $82.800: $82.800 → $107.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 107700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2288 AND "precio_venta" IS NOT DISTINCT FROM 82800 AND "precio_costo" IS NOT DISTINCT FROM 82800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GANCIA SIN ALCOHOL · $48.000: $48.000 → $62.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 62400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3888 AND "precio_venta" IS NOT DISTINCT FROM 48000 AND "precio_costo" IS NOT DISTINCT FROM 48000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GATORADE ROJO 500ML · $6.720: $6.700 → $8.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 8800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2278 AND "precio_venta" IS NOT DISTINCT FROM 6700 AND "precio_costo" IS NOT DISTINCT FROM 6720 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GATORADE AZUL 500ML · $6.720: $6.700 → $8.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 8800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2279 AND "precio_venta" IS NOT DISTINCT FROM 6700 AND "precio_costo" IS NOT DISTINCT FROM 6720 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GAZA SUEZ CAJA · $2.672: $2.700 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2277 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2672 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GEL INTIMO TULIPAN · $2.993: $3.000 → $3.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3327 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 2993 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GILLETTE PRESTOBARBA · $12.000: $12.000 → $15.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 15600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2280 AND "precio_venta" IS NOT DISTINCT FROM 12000 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GILLETTE PRESTOBARBA 3 FILOS x5 · $7.850: $7.900 → $10.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3449 AND "precio_venta" IS NOT DISTINCT FROM 7900 AND "precio_costo" IS NOT DISTINCT FROM 7850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GUANTES DEA GRANDE · $1.960: $2.000 → $2.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3400 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1960 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GUANTES NUVIA M · $1.200: $1.200 → $1.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3403 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · GUMBALLS X18 · $3.394: $4.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3168 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3394 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Harina 0000 Venado Tuerto X10 · $8.971: $9.000 → $11.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2300 AND "precio_venta" IS NOT DISTINCT FROM 9000 AND "precio_costo" IS NOT DISTINCT FROM 8971 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Harina Cañuelas 000 · $8.615,80: $6.500 → $11.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3977 AND "precio_venta" IS NOT DISTINCT FROM 6500 AND "precio_costo" IS NOT DISTINCT FROM 8615.8 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Harina Pizza Pureza · $16.667,40: $15.300 → $21.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2302 AND "precio_venta" IS NOT DISTINCT FROM 15300 AND "precio_costo" IS NOT DISTINCT FROM 16667.4 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Harina Venado Tuerto Leudante · $11.658,90: $11.200 → $15.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 15200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2303 AND "precio_venta" IS NOT DISTINCT FROM 11200 AND "precio_costo" IS NOT DISTINCT FROM 11658.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · HEINEKEN LATA 473 · $56.000: $56.000 → $72.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 72800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2946 AND "precio_venta" IS NOT DISTINCT FROM 56000 AND "precio_costo" IS NOT DISTINCT FROM 56000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · HIGIENOL FRESH · $18.600: $17.800 → $24.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2305 AND "precio_venta" IS NOT DISTINCT FROM 17800 AND "precio_costo" IS NOT DISTINCT FROM 18600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · imperial 1lt · $44.136: $44.200 → $57.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 57400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14419 AND "precio_venta" IS NOT DISTINCT FROM 44200 AND "precio_costo" IS NOT DISTINCT FROM 44136 AND "margen" IS NOT DISTINCT FROM -0.05 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Anana X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3956 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Frutilla Anana Banana X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3960 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Frutilla X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3959 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Limonada X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3955 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Manzana X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3952 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Multi Furta X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3954 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Naranja Dulce X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3958 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Naranja Banana X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3957 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Naranja Durzano X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3953 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Naranja X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3951 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Jugo Arcor Pomelo Rosado X Caja · $5.962,16: $5.000 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3961 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KIMBIES TOALLITAS HUMEDAS X48 · $1.790: $85.900 sin cambio · margen 4698
UPDATE "ProductoLocal" SET "margen" = 4698, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3187 AND "precio_venta" IS NOT DISTINCT FROM 85900 AND "precio_costo" IS NOT DISTINCT FROM 1790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KIT DINI · $1.080: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3197 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1080 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABOR VERDURAS VERDE · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3805 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES AJI COMINO Y PIMEN · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3809 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES BARBACOA AHUMADA · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3801 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES CARNE · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3808 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES CIBOUL Y PUERRO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3802 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES OREG TOM Y AJO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3807 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES POLLO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3806 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES TOMA CEBO Y MORRON · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3810 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES VERDURAS · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3803 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR MIX SABORES VERDURAS 0 SODIO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3804 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR SOPA CREMA CHOCLO 70G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3644 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR SOPA CREMA VEGETALES 60G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2325 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR SOPA CREMA ZAPALLO 70G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2607 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR SOPA DE LETRAS · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3651 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR SOPA POLLO CABELLO DE ANGEL · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3648 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR SOPA VEGETALES CARACOLITOS TRICOLOR · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3649 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KNORR SOPA VEGETALES MUNICIONES · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3650 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KOLYNOS 70g · $22.440: $22.400 → $29.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 29200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2320 AND "precio_venta" IS NOT DISTINCT FROM 22400 AND "precio_costo" IS NOT DISTINCT FROM 22440 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KROMY x48unid · $6.427: $6.700 → $8.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 8400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3149 AND "precio_venta" IS NOT DISTINCT FROM 6700 AND "precio_costo" IS NOT DISTINCT FROM 6427 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · KROOMY X12 · $4.100: $4.500 → $5.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2850 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 4100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · kroomy 10g frutichox24u · $3.500: $4.500 → $4.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3923 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA GOTITA 2ML · $10.400: $10.400 → $13.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2734 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 10400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA GOTITA GEL 3ML · $12.360,61: $12.000 → $16.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 16100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2733 AND "precio_venta" IS NOT DISTINCT FROM 12000 AND "precio_costo" IS NOT DISTINCT FROM 12360.61 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA HOJA · $1.200: $1.200 → $1.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3550 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA HOJA YERBA 500G · $13.363,20: $12.600 → $17.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3652 AND "precio_venta" IS NOT DISTINCT FROM 12600 AND "precio_costo" IS NOT DISTINCT FROM 13363.2 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA HUERTA CHICO 210G · $8.450: $7.500 → $11.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2858 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 8450 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LA VIRGINIA TE TILO · $14.310: $14.300 → $18.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2465 AND "precio_venta" IS NOT DISTINCT FROM 14300 AND "precio_costo" IS NOT DISTINCT FROM 14310 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAMPARA 7W · $4.340,85: $4.300 → $5.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3092 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4340.85 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAMPARA CANDELA 12W · $5.500: $5.500 → $7.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3229 AND "precio_venta" IS NOT DISTINCT FROM 5500 AND "precio_costo" IS NOT DISTINCT FROM 5500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAMPARA CANDELA 15W · $5.750: $5.800 → $7.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3230 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 5750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · lamparita 12w · $750: $800 → $1.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2805 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAMPARITAS 15W · $960: $1.000 → $1.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2806 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 960 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Las Moras Malbec · $18.600: $17.700 → $24.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2264 AND "precio_venta" IS NOT DISTINCT FROM 17700 AND "precio_costo" IS NOT DISTINCT FROM 18600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAVANDINA GIGANTE · $15.000: $15.000 → $19.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3554 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 15000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LAYS BARBACOA 77G · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3676 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LHERITIER 110G · $900: $900 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3851 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LIMZUL 800ML · $1.600: $1.600 → $2.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3555 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LINA TOALLITAS NOCTURNA · $86.400: $86.400 → $112.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 112400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2466 AND "precio_venta" IS NOT DISTINCT FROM 86400 AND "precio_costo" IS NOT DISTINCT FROM 86400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Liverpool azul · $13.200: $13.200 → $17.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6108 AND "precio_venta" IS NOT DISTINCT FROM 13200 AND "precio_costo" IS NOT DISTINCT FROM 13200 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Liverpool verde · $13.200: $13.200 → $17.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6112 AND "precio_venta" IS NOT DISTINCT FROM 13200 AND "precio_costo" IS NOT DISTINCT FROM 13200 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · LOS ARBOLES MALBEC · $24.600: $20.400 → $32.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2335 AND "precio_venta" IS NOT DISTINCT FROM 20400 AND "precio_costo" IS NOT DISTINCT FROM 24600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Lucky 10 origen convertible · $5.658.000: $5.658.000 → $7.355.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7355400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14521 AND "precio_venta" IS NOT DISTINCT FROM 5658000 AND "precio_costo" IS NOT DISTINCT FROM 5658000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Lucky 20 box · $62.346: $62.000 → $65.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6116 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Lucky 20 común · $58.000: $57.000 → $60.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 60000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6111 AND "precio_venta" IS NOT DISTINCT FROM 57000 AND "precio_costo" IS NOT DISTINCT FROM 58000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Lucky 20 convertible xl · $62.346: $62.000 → $65.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6107 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Lucky 20 Menta Comun · $56.460: $56.000 → $59.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 59000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6402 AND "precio_venta" IS NOT DISTINCT FROM 56000 AND "precio_costo" IS NOT DISTINCT FROM 56460 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Lucky 20 Origen Menta Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6297 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Lucky 20 red · $29.460: $29.000 → $32.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6063 AND "precio_venta" IS NOT DISTINCT FROM 29000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Lucky 20 Silver · $54.300: $54.000 → $57.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 57000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6515 AND "precio_venta" IS NOT DISTINCT FROM 54000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Lucky origen 20 comun · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6279 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Lucky origen 20 común mentolado · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6110 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · LYSOFORM AEROSOL CITRICA · $2.300: $2.300 → $3.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3691 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 2300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Lysonform Aerosol 360cm · $27.600: $27.600 → $35.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 35900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2349 AND "precio_venta" IS NOT DISTINCT FROM 27600 AND "precio_costo" IS NOT DISTINCT FROM 27600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGDALENA DON SATUR CHIP · $18.059,90: $16.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2898 AND "precio_venta" IS NOT DISTINCT FROM 16500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGDALENA DON SATUR DDL · $18.059,90: $16.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2350 AND "precio_venta" IS NOT DISTINCT FROM 16500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGDALENAS DON SATUR VAINILLA · $18.059,90: $16.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2351 AND "precio_venta" IS NOT DISTINCT FROM 16500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGISTRAL 5OOml LIMON · $2.750: $2.800 → $3.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2355 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAGNA 1.5L TONICA · $8.550: $7.700 → $11.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2357 AND "precio_venta" IS NOT DISTINCT FROM 7700 AND "precio_costo" IS NOT DISTINCT FROM 8550 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAÑANITA YERBA 500G · $16.500: $15.500 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2662 AND "precio_venta" IS NOT DISTINCT FROM 15500 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MAQUINA DE AFEITAR MINORA X10 · $8.000: $8.000 → $10.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3935 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 8000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Marlboro 20 Box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6103 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · marlboro 20 comun · $64.000: $63.000 → $66.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 66000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6469 AND "precio_venta" IS NOT DISTINCT FROM 63000 AND "precio_costo" IS NOT DISTINCT FROM 64000 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 coral XL · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6104 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 Crafted Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6289 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 crafted común · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6065 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 crafted coral box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6066 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 Crafted menta box · $42.420: $42.000 → $45.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 45000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6061 AND "precio_venta" IS NOT DISTINCT FROM 42000 AND "precio_costo" IS NOT DISTINCT FROM 42420 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 crafted mentolado común · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6064 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 Crafted Uva Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6286 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 gold · $64.020: $64.000 → $67.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 67000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6610 AND "precio_venta" IS NOT DISTINCT FROM 64000 AND "precio_costo" IS NOT DISTINCT FROM 64020 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 menta box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6105 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 titanio · $74.000: $72.000 → $76.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 76000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6117 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 74000 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Marlboro 20 uva box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6106 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · MATECOCIDO TARAGUI XPACK 10 · $9.510: $9.500 → $12.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2914 AND "precio_venta" IS NOT DISTINCT FROM 9500 AND "precio_costo" IS NOT DISTINCT FROM 9510 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · mega hamblet mani xunidad · $1.495: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3630 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1495 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MIEL DECFA 250G · $887,66: $900 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2949 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 887.66 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOCOVI ARROZ 500G · $4.900: $4.900 → $6.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 6400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2877 AND "precio_venta" IS NOT DISTINCT FROM 4900 AND "precio_costo" IS NOT DISTINCT FROM 4900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOCOVI ARROZ CAJA 500G · $870: $900 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2033 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 870 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL GELATINA FRUTILLA 25g · $6.080: $8.000 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3788 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 6080 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Mogul masti extreme 30gr · $14.296,72: $8.700 → $20.100 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 20100, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6314 AND "precio_venta" IS NOT DISTINCT FROM 8700 AND "precio_costo" IS NOT DISTINCT FROM 14296.72 AND "margen" IS NOT DISTINCT FROM 40 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOGUL RODAJAS ACIDAS 50G · $8.236: $7.900 → $10.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3157 AND "precio_venta" IS NOT DISTINCT FROM 7900 AND "precio_costo" IS NOT DISTINCT FROM 8236 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOLTO DURAZNO LATA · $19.200: $19.200 → $25.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 25000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3764 AND "precio_venta" IS NOT DISTINCT FROM 19200 AND "precio_costo" IS NOT DISTINCT FROM 19200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MOÑO SOL PAMPEANO · $15.069,45: $15.000 → $19.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2368 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 15069.45 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · MR. POPS CHUPETIN YOGUS 625G · $4.197: $5.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3605 AND "precio_venta" IS NOT DISTINCT FROM 5500 AND "precio_costo" IS NOT DISTINCT FROM 4197 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · mumm extrabrut caja x6 · $39.300: $51.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3897 AND "precio_venta" IS NOT DISTINCT FROM 51100 AND "precio_costo" IS NOT DISTINCT FROM 39300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · mym chocolate · $1.792: $2.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3430 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1792 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · mym mani · $1.792: $2.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3431 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1792 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Nacho Picante 80g · $1.400: $1.900 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2416 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NAIPES BLANCAS x50 · $750: $1.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3416 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NOBLEZA GAUCHA 500 G · $13.900: $1.900 → $18.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3302 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 13900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NORTON COS TARDIA BLANCO · $5.270: $6.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2808 AND "precio_venta" IS NOT DISTINCT FROM 6900 AND "precio_costo" IS NOT DISTINCT FROM 5270 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NUGATON 177G · $8.930: $11.700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3994 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 8930 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NUVIA BOLSA 45x60 · $520: $700 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3512 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 520 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NUVIA BOLSA 60x90 · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3568 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NUVIA ESPONJA ACERO · $295: $400 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3610 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 295 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NUVIA LANA ACERO · $531: $700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3612 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 531 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NUVIA PABILO · $280: $400 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3658 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 280 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · NUVIA SECADOR DE PISO Nº40 · $850: $1.200 sin cambio · margen 41
UPDATE "ProductoLocal" SET "margen" = 41, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3614 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · OCB Negro · $17.400: $17.400 → $22.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 22700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2768 AND "precio_venta" IS NOT DISTINCT FROM 17400 AND "precio_costo" IS NOT DISTINCT FROM 17400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ODOL 90g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2417 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ODOLITO 50g · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3314 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ODOLITO 50G · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2943 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · OFF CREMA 196g · $4.000: $5.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3785 AND "precio_venta" IS NOT DISTINCT FROM 5200 AND "precio_costo" IS NOT DISTINCT FROM 4000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · OFF CREMA 60G · $33.600: $43.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2781 AND "precio_venta" IS NOT DISTINCT FROM 43700 AND "precio_costo" IS NOT DISTINCT FROM 33600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · OKEBON CHOCOLATADA 273G · $1.065: $1.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3586 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1065 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · OKEBON LECHE 273G · $1.065: $1.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3592 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1065 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ORIETA DURAZNO · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6037 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ORIETA MERMELADA FRUTILLA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3826 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Otro Loco Mas XCAJA · $21.000: $21.000 → $27.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 27300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2426 AND "precio_venta" IS NOT DISTINCT FROM 21000 AND "precio_costo" IS NOT DISTINCT FROM 21000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · palito de la selva caja anana · $4.097: $5.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3010 AND "precio_venta" IS NOT DISTINCT FROM 5400 AND "precio_costo" IS NOT DISTINCT FROM 4097 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · palito de la selva caja blueberry · $4.097: $5.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3011 AND "precio_venta" IS NOT DISTINCT FROM 5400 AND "precio_costo" IS NOT DISTINCT FROM 4097 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PALITO DE LA SELVA CAJA COMUN · $4.261: $5.600 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3204 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4261 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PALO MADERA · $621: $900 sin cambio · margen 44
UPDATE "ProductoLocal" SET "margen" = 44, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2427 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · pan congelado xkg · $3.000: $3.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3757 AND "precio_venta" IS NOT DISTINCT FROM 3900 AND "precio_costo" IS NOT DISTINCT FROM 3000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PAÑO AMARILLO · $375: $500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2430 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 375 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PANTENE ACONDICIONADOR LISO EXTREMO 10ML · $4.300: $5.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3245 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PAPA CONGELADA SIPOLOT 700G · $3.150: $4.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2773 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3150 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PARCHE N°3 · $2.545: $3.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2902 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2545 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PARCHE N°5 · $4.420: $4.400 → $5.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2901 AND "precio_venta" IS NOT DISTINCT FROM 4400 AND "precio_costo" IS NOT DISTINCT FROM 4420 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PATRICH AEROSOL 230ml grand prix · $2.700: $3.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3747 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PATRICHS AVIATOR 150ML CELESTE · $2.600: $3.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2428 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PATRICHS BLACK LABEL NEGRO 150ML · $2.600: $3.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2889 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PBT JYQ · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2763 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PELEADOR ARROZ 1Kg · $12.000: $12.000 → $15.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 15600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2452 AND "precio_venta" IS NOT DISTINCT FROM 12000 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PELEADOR ARROZ 500G · $6.500: $6.500 → $8.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 8500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2453 AND "precio_venta" IS NOT DISTINCT FROM 6500 AND "precio_costo" IS NOT DISTINCT FROM 6500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · pep palito panceta 84g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3336 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · pep ramita queso 84g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6050 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · pep ramitas queso 40g · $790: $1.100 sin cambio · margen 39
UPDATE "ProductoLocal" SET "margen" = 39, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6049 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PERFUMINA DEA 900ML CHERRY · $10.800: $10.800 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3028 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PERFUMINA DEA 900ML COLONIA · $10.800: $10.800 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3046 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PERFUMINA DEA 900ML LAVANDA · $10.800: $10.800 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3029 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PERFUMINA DEA 900ML MARINA · $10.800: $10.800 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3030 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PERFUMINA DEA 900ML MIL FLORES · $10.800: $10.800 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3031 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PERFUMINA DEA 900ML PINO · $10.800: $10.800 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3196 AND "precio_venta" IS NOT DISTINCT FROM 10800 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PETACA CHOCOLATE · $15.600: $15.000 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3322 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PETACA CREMA AL WHISKY · $15.600: $15.000 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3321 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PHILCO PILAS AA x8 · $7.000: $9.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3395 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 7000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PHILCO PILAS AAA x8 · $7.000: $9.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3394 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 7000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Philips 20 bluw select · $29.460: $29.460 → $38.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 38300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14511 AND "precio_venta" IS NOT DISTINCT FROM 29460 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Philips 20 box · $61.266: $61.000 → $64.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 64000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6070 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 61266 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Philips 20 común · $59.500: $59.000 → $62.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 62000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6071 AND "precio_venta" IS NOT DISTINCT FROM 59000 AND "precio_costo" IS NOT DISTINCT FROM 59500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · philips 20 mentolado box · $61.320: $61.000 → $64.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 64000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6476 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 61320 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · Philips 20 red común · $29.460: $29.000 → $32.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6109 AND "precio_venta" IS NOT DISTINCT FROM 29000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- mini el 7 · picadores marihuana x12 · $13.800: $18.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3208 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 13800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PICNIC 38g · $375,35: $400 → $500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2787 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 375.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Pier rojo · $13.200: $13.200 → $17.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 6102 AND "precio_venta" IS NOT DISTINCT FROM 13200 AND "precio_costo" IS NOT DISTINCT FROM 13200 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Pier Verde · $11.200: $14.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2457 AND "precio_venta" IS NOT DISTINCT FROM 14600 AND "precio_costo" IS NOT DISTINCT FROM 11200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PILA EVEREADY AAA X24 · $10.800: $14.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2238 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PILAS AAA ENERGIZER X4 · $3.482: $4.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2893 AND "precio_venta" IS NOT DISTINCT FROM 4600 AND "precio_costo" IS NOT DISTINCT FROM 3482 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE JABON x3 HUMENTACION · $2.000: $2.000 → $2.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3502 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE X1 FLORES ROSAS · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3782 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE x1 JAZMIN INTENSO · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3731 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE x1 LAVANDA · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3755 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE x1 NUTRICION · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3364 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE x1 RADIANTE · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3363 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PLUSBELLE x1 RECONEXION · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3365 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PORTEÑITAS 139G · $825: $1.100 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3602 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 825 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · POXIPOL · $4.370: $5.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2714 AND "precio_venta" IS NOT DISTINCT FROM 5700 AND "precio_costo" IS NOT DISTINCT FROM 4370 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · prepizza cebolla · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3447 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · prepizza mixta · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3575 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PRESERVATIVO TULIPAN CLASICO x16U · $28.680: $28.700 → $37.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 37300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2683 AND "precio_venta" IS NOT DISTINCT FROM 28700 AND "precio_costo" IS NOT DISTINCT FROM 28680 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PULVERIZADOR1L · $1.120: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3405 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1120 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Pure de tomate molto 520g X24 · $14.200: $14.200 → $18.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3541 AND "precio_venta" IS NOT DISTINCT FROM 14200 AND "precio_costo" IS NOT DISTINCT FROM 14200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PURE HUERTA PULPA 205G X18 · $6.850: $9.000 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2441 AND "precio_venta" IS NOT DISTINCT FROM 9000 AND "precio_costo" IS NOT DISTINCT FROM 6850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · PURE LA HUERTA 530G X12 · $9.660: $9.700 → $12.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2443 AND "precio_venta" IS NOT DISTINCT FROM 9700 AND "precio_costo" IS NOT DISTINCT FROM 9660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · QUAKER AVENA TRADICIONAL · $1.790: $2.400 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3692 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · QUITA ESMALTE CUTEX · $1.361: $1.400 → $1.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2945 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1361 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · QUITA ESMALTE CUTEX VIOLETA · $1.361: $1.800 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2944 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1361 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · QUITAESMALTE NEPTUS 60CM · $600: $800 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3516 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAFFAELLO 90G · $4.453: $5.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3177 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 4453 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAFTING 3L NARANJA · $9.460: $12.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2529 AND "precio_venta" IS NOT DISTINCT FROM 12300 AND "precio_costo" IS NOT DISTINCT FROM 9460 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAID AEROSOL SIN OLOR · $4.590: $6.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3617 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 4590 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAID ESPIRAL 12U · $2.545: $3.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3510 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2545 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAID ESPIRAL X12 LAVANDA · $2.700: $3.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3776 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · raid lavanda x24 · $48.000: $62.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3896 AND "precio_venta" IS NOT DISTINCT FROM 62400 AND "precio_costo" IS NOT DISTINCT FROM 48000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · raid x 24 · $50.000: $65.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3895 AND "precio_venta" IS NOT DISTINCT FROM 65000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAMOLAC DULCE DE LECHE 200ML · $880: $1.200 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3700 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAVIOLES VILLAD AGRI carne y verdura · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3349 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RAYOVAC AAA X 5U · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3025 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RED LABEL WHISKY 1L · $22.945: $29.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3672 AND "precio_venta" IS NOT DISTINCT FROM 29900 AND "precio_costo" IS NOT DISTINCT FROM 22945 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · RED LABEL WHISKY 750ML · $19.296: $25.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3671 AND "precio_venta" IS NOT DISTINCT FROM 25100 AND "precio_costo" IS NOT DISTINCT FROM 19296 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REJILLA NUVIA 32X42CM · $300: $400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2510 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REJILLA SUPER AUTO · $671: $900 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3404 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 671 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REX 250g · $2.006: $2.700 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3446 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2006 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA AERESOL BAMBOO · $3.140,99: $3.700 → $4.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2511 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3140.99 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA AEROSOL ACTIVE MOTION 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2512 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · rexona aerosol antibacterial · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3148 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA AEROSOL ANTIBACTERIAL · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2926 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA AEROSOL COTTON DRY 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2513 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · rexona aerosol futbol fanatic · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3147 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · rexona aerosol futbol fanaticas · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3213 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA AEROSOL MEN INVISIBLE · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2799 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA AEROSOL MEN SENSITIVE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2515 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA AEROSOL NUTRITIVE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2514 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA BOLILLA BAMBOO & ALOE VERA X50ML · $2.100: $2.100 → $2.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3085 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 2100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · rexona invisible mujer aerosol · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3058 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA JABON 125Fgr NUTRITIVE · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2519 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA JABON TOCADOR x1 BAMBOO · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2521 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA JABON TOCADOR X1 FUTBOL FANATICS · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3111 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA JABON TOCADOR x1 SENSIBLE FRESH · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2520 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA MEN AEROSOL HOMBRE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2798 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA MEN AEROSOL V8 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2525 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA MEN XTRACOOL 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2526 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · REXONA x1 ANTIBACTERIAL · $1.298,57: $700 → $1.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3743 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 1298.57 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · ROSAMONTE YERBA 500G · $13.800: $13.800 → $18.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2664 AND "precio_venta" IS NOT DISTINCT FROM 13800 AND "precio_costo" IS NOT DISTINCT FROM 13800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SALUTE ALCOHOL 500ML · $1.580: $2.100 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2682 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1580 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SCHNEIDER 473 · $34.000: $34.000 → $44.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 44200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2911 AND "precio_venta" IS NOT DISTINCT FROM 34000 AND "precio_costo" IS NOT DISTINCT FROM 34000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SCHNEIDER 710ML · $53.500: $53.500 → $69.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 69600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2868 AND "precio_venta" IS NOT DISTINCT FROM 53500 AND "precio_costo" IS NOT DISTINCT FROM 53500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SECCO 3L COLA · $9.700: $8.800 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2589 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SECCO 3L LIMA LIMON · $9.700: $8.800 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2590 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SECCO 3L LIMON INTENSO · $9.700: $8.800 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2591 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SECCO 3L NARANJA · $9.700: $9.400 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2702 AND "precio_venta" IS NOT DISTINCT FROM 9400 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SECCO 3L POMELO · $9.700: $8.800 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2592 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · sedal acondicionador liso 190 · $32.004,36: $29.400 → $41.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 41700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3567 AND "precio_venta" IS NOT DISTINCT FROM 29400 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SEDAL ACONDICIONADOR x10ML BALANCE · $5.373,36: $5.000 → $7.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3374 AND "precio_venta" IS NOT DISTINCT FROM 5000 AND "precio_costo" IS NOT DISTINCT FROM 5373.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SEDAL SHAMPOO x190ml BALANCE · $32.004,36: $29.400 → $41.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 41700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3381 AND "precio_venta" IS NOT DISTINCT FROM 29400 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · Skyy Coconut X CAJA · $102.000: $102.000 → $132.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 132600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2596 AND "precio_venta" IS NOT DISTINCT FROM 102000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SKYY VODKA APRICOT X CAJA · $102.000: $102.000 → $132.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 132600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3216 AND "precio_venta" IS NOT DISTINCT FROM 102000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SKYY VODKA BLOOD ORANGE X CAJA · $102.000: $102.000 → $132.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 132600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3629 AND "precio_venta" IS NOT DISTINCT FROM 102000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SKYY VODKA COSMIC X CAJA · $102.000: $132.000 → $132.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 132600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3585 AND "precio_venta" IS NOT DISTINCT FROM 132000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SKYY VODKA RASBERRY X CAJA 12U · $102.000: $102.000 → $132.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 132600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2599 AND "precio_venta" IS NOT DISTINCT FROM 102000 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SMIRNOFF VODKA CLASICO · $87.600: $82.800 → $113.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 113900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2600 AND "precio_venta" IS NOT DISTINCT FROM 82800 AND "precio_costo" IS NOT DISTINCT FROM 87600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SOL MAYOR ROLLO DE COCINA · $13.500: $12.200 → $17.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3653 AND "precio_venta" IS NOT DISTINCT FROM 12200 AND "precio_costo" IS NOT DISTINCT FROM 13500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SOL PAMPEANO MOSTACHOL · $10.800: $9.500 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2367 AND "precio_venta" IS NOT DISTINCT FROM 9500 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SOL PAMPEANO TALLARIN · $14.400: $12.700 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2818 AND "precio_venta" IS NOT DISTINCT FROM 12700 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SPEED CHICO · $33.315: $33.300 → $43.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2774 AND "precio_venta" IS NOT DISTINCT FROM 33300 AND "precio_costo" IS NOT DISTINCT FROM 33315 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · SPEED XL · $23.500: $23.500 → $30.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 30600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2608 AND "precio_venta" IS NOT DISTINCT FROM 23500 AND "precio_costo" IS NOT DISTINCT FROM 23500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · speed zero · $18.900: $18.900 → $24.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2862 AND "precio_venta" IS NOT DISTINCT FROM 18900 AND "precio_costo" IS NOT DISTINCT FROM 18900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · STELLA 473ML · $52.160: $52.200 → $67.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 67900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2563 AND "precio_venta" IS NOT DISTINCT FROM 52200 AND "precio_costo" IS NOT DISTINCT FROM 52160 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TARAGUI YERBA 500G · $16.500: $15.500 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2665 AND "precio_venta" IS NOT DISTINCT FROM 15500 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TERRABUSI VARIEDAD 390G · $44.700: $44.700 → $58.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 58200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2651 AND "precio_venta" IS NOT DISTINCT FROM 44700 AND "precio_costo" IS NOT DISTINCT FROM 44700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TORO AMARRILLA 700ML PACK X 6 · $8.400: $8.400 → $11.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2622 AND "precio_venta" IS NOT DISTINCT FROM 8400 AND "precio_costo" IS NOT DISTINCT FROM 8400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TORO AMARILLA BOTELLON 1L · $11.000: $11.000 → $14.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2623 AND "precio_venta" IS NOT DISTINCT FROM 11000 AND "precio_costo" IS NOT DISTINCT FROM 11000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · toro ETIQ BLANCA 750ML · $11.900: $11.900 → $15.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 15500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3892 AND "precio_venta" IS NOT DISTINCT FROM 11900 AND "precio_costo" IS NOT DISTINCT FROM 11900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · TRAVIATA CRACK PORTEÑITA 96g · $802: $1.300 sin cambio · margen 62
UPDATE "ProductoLocal" SET "margen" = 62, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 3830 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 802 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · UNION YERBA 500G · $16.500: $15.500 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2670 AND "precio_venta" IS NOT DISTINCT FROM 15500 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · VENADO TUERTO HARINA 000 · $7.540: $7.500 → $9.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2299 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 7540 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · VENUS 3 FILOS · $7.200: $6.700 → $9.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2656 AND "precio_venta" IS NOT DISTINCT FROM 6700 AND "precio_costo" IS NOT DISTINCT FROM 7200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- mini el 7 · VINO TORO ETIQUETA BLANCA 1.125L · $15.200: $15.200 → $19.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 2624 AND "precio_venta" IS NOT DISTINCT FROM 15200 AND "precio_costo" IS NOT DISTINCT FROM 15200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · 361 x2 · $1.500: $3.500 sin cambio · margen 134
UPDATE "ProductoLocal" SET "margen" = 134, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15070 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Aceitunas negras · $14.580: $1.400 → $19.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9363 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 14580 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · adesivo candela · $400: $400 → $600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14436 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 400 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · AZUFRE · $1.200: $500 → $1.600 · margen 33
UPDATE "ProductoLocal" SET "precio_venta" = 1600, "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10396 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BAGGIO 1L CHOCOLATADA X8 · $18.400: $19.300 → $24.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10012 AND "precio_venta" IS NOT DISTINCT FROM 19300 AND "precio_costo" IS NOT DISTINCT FROM 18400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BAGGIO 200 ML MANZANA · $8.380: $10.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10875 AND "precio_venta" IS NOT DISTINCT FROM 10900 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BAGGIO 200 NARANJA · $8.380: $10.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11245 AND "precio_venta" IS NOT DISTINCT FROM 10900 AND "precio_costo" IS NOT DISTINCT FROM 8380 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BAGGIO 7 DIAS 1L CHOCOLATADA · $13.105: $17.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11246 AND "precio_venta" IS NOT DISTINCT FROM 17100 AND "precio_costo" IS NOT DISTINCT FROM 13105 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · barra cremac · $9.500: $1.500 → $12.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9424 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 9500 AND "margen" IS NOT DISTINCT FROM -84.21 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BARRA TREMBLAY · $11.018,49: $1.500 → $14.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9551 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 11018.49 AND "margen" IS NOT DISTINCT FROM -86.39 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BATATA ARCOR 500G · $2.063,52: $2.300 → $2.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9896 AND "precio_venta" IS NOT DISTINCT FROM 2300 AND "precio_costo" IS NOT DISTINCT FROM 2063.52 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BENGALA X4 · $1.900: $2.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9914 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · bengalas x2 · $2.000: $2.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11502 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BIC ENCENDEDOR MAXI · $18.260: $23.600 → $23.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10862 AND "precio_venta" IS NOT DISTINCT FROM 23600 AND "precio_costo" IS NOT DISTINCT FROM 18260 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BIC ENCENDEDOR MINI · $12.575: $14.700 → $16.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 16400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10015 AND "precio_venta" IS NOT DISTINCT FROM 14700 AND "precio_costo" IS NOT DISTINCT FROM 12575 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BLENDERS WHISKY 75O ML · $42.259,05: $42.259,05 → $55.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 55000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10723 AND "precio_venta" IS NOT DISTINCT FROM 42259.05 AND "precio_costo" IS NOT DISTINCT FROM 42259.05 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · bolsa consorcio 90x120 · $1.500: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14426 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BOLSAS RERSIDUO 45X60 · $660: $900 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9884 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BROCHES X12u PLASCTICO NUVIA · $800: $1.100 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9882 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · BROCHES MADERA NUVIA X12 · $420: $600 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9881 AND "precio_venta" IS NOT DISTINCT FROM 600 AND "precio_costo" IS NOT DISTINCT FROM 420 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Budin elixir x6 · $6.000: $7.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11567 AND "precio_venta" IS NOT DISTINCT FROM 7800 AND "precio_costo" IS NOT DISTINCT FROM 6000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CABALLA EN ACEITE BAHIA X425 · $77.520: $4.200 → $100.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 100800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11401 AND "precio_venta" IS NOT DISTINCT FROM 4200 AND "precio_costo" IS NOT DISTINCT FROM 77520 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CABO MADERA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10962 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Camel 20 box · $69.000: $72.000 → $89.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 89700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15580 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CANDELA GLOBOS 50U · $2.900: $3.800 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11252 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 2900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Carpano 950ml · $74.880: $8.200 → $97.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 97400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9984 AND "precio_venta" IS NOT DISTINCT FROM 8200 AND "precio_costo" IS NOT DISTINCT FROM 74880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CBSE YERBA 500G · $18.000: $23.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10390 AND "precio_venta" IS NOT DISTINCT FROM 23400 AND "precio_costo" IS NOT DISTINCT FROM 18000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · celusal parrillera · $38.700: $1.700 → $50.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 50400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11381 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 38700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Cepillo de Dientes Mr G · $6.600: $8.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11548 AND "precio_venta" IS NOT DISTINCT FROM 8600 AND "precio_costo" IS NOT DISTINCT FROM 6600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · cepillo de mano planchita · $1.385,45: $1.900 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10930 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1385.45 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CEPILLO MAPUCHE DE MANO · $1.321: $1.800 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9968 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1321 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CERVEZA 1890 1L · $26.000: $33.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9867 AND "precio_venta" IS NOT DISTINCT FROM 33800 AND "precio_costo" IS NOT DISTINCT FROM 26000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CERVEZA 1890 LATA · $26.000: $33.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11020 AND "precio_venta" IS NOT DISTINCT FROM 33800 AND "precio_costo" IS NOT DISTINCT FROM 26000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CERVEZA HEINEKEN 1L · $56.500: $73.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10087 AND "precio_venta" IS NOT DISTINCT FROM 73500 AND "precio_costo" IS NOT DISTINCT FROM 56500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CHANDON APERITIF XCAJA · $90.000: $117.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10431 AND "precio_venta" IS NOT DISTINCT FROM 117000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CHANDON DELICE XCAJA · $90.000: $117.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9978 AND "precio_venta" IS NOT DISTINCT FROM 117000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CHANDON ROSÈ XCAJA · $90.000: $117.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11176 AND "precio_venta" IS NOT DISTINCT FROM 117000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CHANITA ROLLO DE COCINA · $7.481: $9.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10741 AND "precio_venta" IS NOT DISTINCT FROM 9800 AND "precio_costo" IS NOT DISTINCT FROM 7481 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CHEETOS QUESO 43G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10758 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CHEETOS QUESO 85G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10687 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CHEETOS QUESO CREMA 85G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10952 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Chester 20 común · $49.980: $49.000 → $52.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 52000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9431 AND "precio_venta" IS NOT DISTINCT FROM 49000 AND "precio_costo" IS NOT DISTINCT FROM 49980 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Chester 20 mentolado box · $54.300: $54.000 → $57.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 57000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9446 AND "precio_venta" IS NOT DISTINCT FROM 54000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · chester 20 mentolado comun · $50.000: $49.000 → $52.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 52000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10391 AND "precio_venta" IS NOT DISTINCT FROM 49000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Chester 20 Purple motion 2 box · $55.380: $55.000 → $58.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 58000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9430 AND "precio_venta" IS NOT DISTINCT FROM 55000 AND "precio_costo" IS NOT DISTINCT FROM 55380 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · CHOCOLATIN BLANCO 20X8G · $5.694: $7.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10803 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 5694 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CITRIC X 1LTS · $46.400: $50.100 → $60.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 60400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10447 AND "precio_venta" IS NOT DISTINCT FROM 50100 AND "precio_costo" IS NOT DISTINCT FROM 46400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CLIGHT POMELO · $8.066: $8.100 → $10.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9980 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 8066 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · COLGATE DENTRIFICO 70G X12 · $22.200: $28.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10950 AND "precio_venta" IS NOT DISTINCT FROM 28900 AND "precio_costo" IS NOT DISTINCT FROM 22200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · COLIBRI POMADA NEGRO · $2.666: $3.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10902 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2666 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · combo pancho · $3.016,67: $3.100 → $3.921,67 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3921.67, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15055 AND "precio_venta" IS NOT DISTINCT FROM 3100 AND "precio_costo" IS NOT DISTINCT FROM 3016.67 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CONDIMENTO ARROZ 25G · $10.670,40: $12.400 → $13.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9613 AND "precio_venta" IS NOT DISTINCT FROM 12400 AND "precio_costo" IS NOT DISTINCT FROM 10670.4 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CONDIMENTO PIZZA · $9.000: $11.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9611 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 9000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CORDERO CON PIEL DE LOBO · $22.500: $27.300 → $29.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 29300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9972 AND "precio_venta" IS NOT DISTINCT FROM 27300 AND "precio_costo" IS NOT DISTINCT FROM 22500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CORDON EL MOÑO X12U · $1.880: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9967 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · cordones negros · $1.881: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10966 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1881 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CORONA LATA 473ML · $36.000: $46.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11380 AND "precio_venta" IS NOT DISTINCT FROM 46800 AND "precio_costo" IS NOT DISTINCT FROM 36000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CUSENIER 700ML CAFE AL COGNAC · $33.130,35: $33.130,35 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9946 AND "precio_venta" IS NOT DISTINCT FROM 33130.35 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CUSENIER 700ML CHOCOLATE · $33.130,35: $33.130,35 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9948 AND "precio_venta" IS NOT DISTINCT FROM 33130.35 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · CUSENIER 700ML DULCE DE LECHE · $33.130,35: $33.130,35 → $43.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9774 AND "precio_venta" IS NOT DISTINCT FROM 33130.35 AND "precio_costo" IS NOT DISTINCT FROM 33130.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DERNA PETACA CAFE AL COGNAC XCAJA · $14.400: $17.500 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10223 AND "precio_venta" IS NOT DISTINCT FROM 17500 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DERNA PETACA DULCE DE LECHE XCAJA · $15.600: $19.600 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10951 AND "precio_venta" IS NOT DISTINCT FROM 19600 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DERNA PETACA WHISKY XCAJA · $14.400: $17.500 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10233 AND "precio_venta" IS NOT DISTINCT FROM 17500 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DINAMITA EXTRA FLAMIN HOT 82g · $1.965: $2.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11382 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 1965 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DOBLE-V WHISKY 1L · $4.817,92: $4.817,92 → $6.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 6300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10043 AND "precio_venta" IS NOT DISTINCT FROM 4817.92 AND "precio_costo" IS NOT DISTINCT FROM 4817.92 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DORITO SWEET CHILI 35G · $1.650: $1.900 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11429 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DORITO 82G EXRA FLAMIN HOT · $2.500: $2.500 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11436 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DORITO DINAMITA 45G · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11415 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DORITO FLAMINT HOT 45G · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11422 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Dorito Pizza 74g · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11499 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DORITOS 77G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10055 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DORITOS SWEET CHILI 74G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11154 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · dover suelto · $88: $100 → $114,40 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 114.4, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14952 AND "precio_venta" IS NOT DISTINCT FROM 100 AND "precio_costo" IS NOT DISTINCT FROM 88 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DOWNY 400ML BRISA INTENSO · $3.141: $4.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11265 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3141 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DOWNY BRISA DE VERANO · $2.650: $3.200 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11500 AND "precio_venta" IS NOT DISTINCT FROM 3200 AND "precio_costo" IS NOT DISTINCT FROM 2650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DOWNY BRISA SUAVE · $2.650: $3.200 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11496 AND "precio_venta" IS NOT DISTINCT FROM 3200 AND "precio_costo" IS NOT DISTINCT FROM 2650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DOWNY BRISA SUAVE 500ML · $3.400: $4.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10582 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · DOWNYY CONCENTRADO 1L BRISA DE VERANO · $7.842: $10.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11024 AND "precio_venta" IS NOT DISTINCT FROM 10200 AND "precio_costo" IS NOT DISTINCT FROM 7842 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ELEMENTOS Malbec · $25.200: $25.000 → $32.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 32800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10178 AND "precio_venta" IS NOT DISTINCT FROM 25000 AND "precio_costo" IS NOT DISTINCT FROM 25200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ELITE DISNEY X6 · $1.146: $1.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10848 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1146 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ELITE PAÑUELOS X6paq · $1.600: $2.100 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10030 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ESCOBA EUROPA · $1.390: $1.900 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10909 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1390 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ESCOBILLON ECON · $1.411: $1.900 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10052 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1411 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ESCOBILLON KALPON GONDOLA · $1.880: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10991 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ESCOBILLON NEPTUNO DEA · $2.055: $2.700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10992 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2055 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ESCOLAZO NAIPES 50 · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11213 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ESPIRAL RAID caja 12 x 4 · $9.375: $12.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10384 AND "precio_venta" IS NOT DISTINCT FROM 12200 AND "precio_costo" IS NOT DISTINCT FROM 9375 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ESPONJA AMARILLA BATUQUE · $220: $300 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10725 AND "precio_venta" IS NOT DISTINCT FROM 300 AND "precio_costo" IS NOT DISTINCT FROM 220 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ESPONJA DE BRONCE DEA · $505: $700 sin cambio · margen 38
UPDATE "ProductoLocal" SET "margen" = 38, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9474 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 505 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FANTOCHE ELIXIR ALFAJOR · $7.421: $9.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11140 AND "precio_venta" IS NOT DISTINCT FROM 9700 AND "precio_costo" IS NOT DISTINCT FROM 7421 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FERNET 1882 LATA · $40.800: $12.000 → $53.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 53100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10058 AND "precio_venta" IS NOT DISTINCT FROM 12000 AND "precio_costo" IS NOT DISTINCT FROM 40800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Fernet 1lt Branca · $112.450: $142.000 → $146.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 146200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10056 AND "precio_venta" IS NOT DISTINCT FROM 142000 AND "precio_costo" IS NOT DISTINCT FROM 112450 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FERNET BRANCA 750ML · $166.860: $210.600 → $217.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 217000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10057 AND "precio_venta" IS NOT DISTINCT FROM 210600 AND "precio_costo" IS NOT DISTINCT FROM 166860 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FERNET BRANCA MENTA 750 · $162.000: $13.100 → $210.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 210600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10843 AND "precio_venta" IS NOT DISTINCT FROM 13100 AND "precio_costo" IS NOT DISTINCT FROM 162000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FERNET BUHERO MANDELO · $49.152,15: $49.152,15 → $63.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 63900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9777 AND "precio_venta" IS NOT DISTINCT FROM 49152.15 AND "precio_costo" IS NOT DISTINCT FROM 49152.15 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FRANELA FIBRAN · $1.040: $1.400 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10042 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1040 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FRANELA NUVIA · $821: $1.100 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10021 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 821 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · fresita farruca · $14.200: $18.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11408 AND "precio_venta" IS NOT DISTINCT FROM 18500 AND "precio_costo" IS NOT DISTINCT FROM 14200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FRIZZE AZUL 1L · $15.000: $17.000 → $19.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10044 AND "precio_venta" IS NOT DISTINCT FROM 17000 AND "precio_costo" IS NOT DISTINCT FROM 15000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FRIZZE LATA BLUE · $36.000: $11.400 → $46.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 46800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10086 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 36000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FULBITO X2 · $227,50: $500 sin cambio · margen 120
UPDATE "ProductoLocal" SET "margen" = 120, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15316 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 227.5 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · full sport tropicales 500cc · $7.073: $7.100 → $9.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14477 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 7073 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FUYI AEROSOL 360CM3 · $3.510: $4.600 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10612 AND "precio_venta" IS NOT DISTINCT FROM 4600 AND "precio_costo" IS NOT DISTINCT FROM 3510 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · FUYI PASTILLA · $4.480: $5.900 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10573 AND "precio_venta" IS NOT DISTINCT FROM 5900 AND "precio_costo" IS NOT DISTINCT FROM 4480 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Fuyi TABLETA CAJA X12U · $3.100: $4.100 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10014 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GAMUZA HIGIENICO · $15.169,80: $15.100 → $19.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10744 AND "precio_venta" IS NOT DISTINCT FROM 15100 AND "precio_costo" IS NOT DISTINCT FROM 15169.8 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GANCIA 473ML · $12.000: $15.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10088 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Gancia 950ml · $82.800: $107.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10089 AND "precio_venta" IS NOT DISTINCT FROM 107700 AND "precio_costo" IS NOT DISTINCT FROM 82800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GATORADE ROJO 500ML · $6.720: $8.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10072 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 6720 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GATORADE AZUL 500ML · $6.720: $8.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10071 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 6720 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GAZA SUEZ CAJA · $2.672: $3.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10073 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2672 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GEL INTIMO TULIPAN · $2.993: $3.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10932 AND "precio_venta" IS NOT DISTINCT FROM 3900 AND "precio_costo" IS NOT DISTINCT FROM 2993 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GILLETTE PRESTOBARBA · $12.000: $15.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10093 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GILLETTE PRESTOBARBA 3 FILOS x5 · $7.850: $9.800 → $10.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11115 AND "precio_venta" IS NOT DISTINCT FROM 9800 AND "precio_costo" IS NOT DISTINCT FROM 7850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GUANTES DEA CHICOS · $2.102: $2.800 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10978 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2102 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GUANTES DEA GRANDE · $1.960: $2.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10979 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 1960 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GUANTES NUVIA M · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10980 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GUANTES NUVIA S · $1.125: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10981 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1125 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · GUMBALLS X18 · $3.394: $4.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10813 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3394 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · HAMBUR XL PANES X10 · $6.520,80: $8.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15091 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6520.8 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · HAMBUR XL PANES X6 · $3.912,48: $5.100 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15090 AND "precio_venta" IS NOT DISTINCT FROM 5100 AND "precio_costo" IS NOT DISTINCT FROM 3912.48 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Harina 0000 Venado Tuerto X10 · $10.396: $11.700 → $13.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10104 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 10396 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · HEINEKEN LATA 473 · $56.000: $72.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10644 AND "precio_venta" IS NOT DISTINCT FROM 72800 AND "precio_costo" IS NOT DISTINCT FROM 56000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · imperial 1lt · $44.136: $44.200 → $57.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 57400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14421 AND "precio_venta" IS NOT DISTINCT FROM 44200 AND "precio_costo" IS NOT DISTINCT FROM 44136 AND "margen" IS NOT DISTINCT FROM -0.05 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · IODOPOVIDONA · $2.140: $2.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10381 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2140 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jaimitos X 10u · $1.120: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10085 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1120 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Anana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11473 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Frutilla Anana Banana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11484 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Frutilla X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11477 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Limonada X Caja · $5.962,16: $7.900 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11481 AND "precio_venta" IS NOT DISTINCT FROM 7900 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Manzana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11482 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Multi Furta X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11485 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Naranja Dulce X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11487 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Naranja Banana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11486 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Naranja Durzano X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11489 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Naranja X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11490 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Jugo Arcor Pomelo Rosado X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11474 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KIT DINI · $1.080: $1.500 sin cambio · margen 38
UPDATE "ProductoLocal" SET "margen" = 38, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10799 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1080 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABOR VERDURAS VERDE · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11335 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES AJI COMINO Y PIMEN · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11339 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES BARBACOA AHUMADA · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11331 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES CARNE · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11338 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES CIBOUL Y PUERRO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11332 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES OREG TOM Y AJO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11337 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES POLLO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11336 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES TOMA CEBO Y MORRON · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11340 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES VERDURAS · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11333 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR MIX SABORES VERDURAS 0 SODIO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11334 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR SOPA CREMA CHOCLO 70G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11198 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR SOPA CREMA VEGETALES 60G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10111 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR SOPA CREMA ZAPALLO 70G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10312 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR SOPA DE LETRAS · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11204 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR SOPA POLLO CABELLO DE ANGEL · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11201 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR SOPA VEGETALES CARACOLITOS TRICOLOR · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11202 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KNORR SOPA VEGETALES MUNICIONES · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11203 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KROMY x48unid · $6.427: $6.700 → $8.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 8400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10801 AND "precio_venta" IS NOT DISTINCT FROM 6700 AND "precio_costo" IS NOT DISTINCT FROM 6427 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · KROOMY X12 · $4.100: $4.500 → $5.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10528 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 4100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · kroomy 10g frutichox24u · $3.500: $4.500 → $4.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11444 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LA GOTITA 2ML · $10.400: $12.500 → $13.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10469 AND "precio_venta" IS NOT DISTINCT FROM 12500 AND "precio_costo" IS NOT DISTINCT FROM 10400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LA GOTITA GEL 3ML · $12.360,61: $15.700 → $16.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 16100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10441 AND "precio_venta" IS NOT DISTINCT FROM 15700 AND "precio_costo" IS NOT DISTINCT FROM 12360.61 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LA HOJA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11531 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LA HUERTA CHICO 210G · $8.450: $9.900 → $11.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9426 AND "precio_venta" IS NOT DISTINCT FROM 9900 AND "precio_costo" IS NOT DISTINCT FROM 8450 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LA VIRGINIA TE TILO · $14.310: $18.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10370 AND "precio_venta" IS NOT DISTINCT FROM 18700 AND "precio_costo" IS NOT DISTINCT FROM 14310 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LADYSOFT NOCTURNA x16 · $2.505: $3.300 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11272 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2505 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LAMPARA 7W · $4.340,85: $5.600 → $5.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10718 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4340.85 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LAMPARA CANDELA 12W · $5.500: $7.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10865 AND "precio_venta" IS NOT DISTINCT FROM 7200 AND "precio_costo" IS NOT DISTINCT FROM 5500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LAMPARA CANDELA 15W · $5.750: $7.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9442 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 5750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · lamparita 12w · $750: $1.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10494 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LAMPARITAS 15W · $960: $1.300 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10498 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 960 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Las Moras Malbec · $18.600: $23.100 → $24.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10079 AND "precio_venta" IS NOT DISTINCT FROM 23100 AND "precio_costo" IS NOT DISTINCT FROM 18600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LAYS 40g QUESO CREMA · $1.650: $1.900 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11295 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LAYS BARBACOA 77G · $2.500: $3.000 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11229 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LAYS CLASICA 40G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10126 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · lays flaming hot 30grs · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10674 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LHERITIER 110G · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11385 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LIMZUL 800ML · $1.600: $2.100 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11492 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · LOS ARBOLES MALBEC · $24.600: $26.600 → $32.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10119 AND "precio_venta" IS NOT DISTINCT FROM 26600 AND "precio_costo" IS NOT DISTINCT FROM 24600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Lucky 20 box · $62.346: $62.000 → $65.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9663 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Lucky 20 común · $58.000: $57.000 → $60.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 60000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9647 AND "precio_venta" IS NOT DISTINCT FROM 57000 AND "precio_costo" IS NOT DISTINCT FROM 58000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Lucky 20 convertible xl · $62.346: $62.000 → $65.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9623 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Lucky 20 Origen Menta Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9599 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Lucky 20 red · $29.460: $29.000 → $32.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9384 AND "precio_venta" IS NOT DISTINCT FROM 29000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Lucky 20 Silver · $54.300: $54.000 → $57.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 57000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10703 AND "precio_venta" IS NOT DISTINCT FROM 54000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Lucky origen 20 comun · $40.260: $39.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9461 AND "precio_venta" IS NOT DISTINCT FROM 39000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 4.67 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Lucky origen 20 común mentolado · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9640 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 4.67 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · LYSOFORM AEROSOL CITRICA · $2.300: $3.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11217 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 2300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Lysonform Aerosol 360cm · $27.600: $3.000 → $35.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 35900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10121 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 27600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGDALENA DON SATUR CHIP · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10565 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGDALENA DON SATUR DDL · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10141 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGDALENAS DON SATUR VAINILLA · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10146 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGISTRAL 300 LIMON CREMOSO · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11123 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGISTRAL 300 PUREZA ACTIVE · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11124 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGISTRAL 300ml MARINA · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10147 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGISTRAL 500ML MARINA · $3.200: $3.600 → $4.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10129 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 3200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGISTRAL 5OOml LIMON · $2.750: $3.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10130 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAGNA 1.5L TONICA · $8.550: $7.922,92 → $11.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10148 AND "precio_venta" IS NOT DISTINCT FROM 7922.92 AND "precio_costo" IS NOT DISTINCT FROM 8550 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAIZ PISINGALLO ELIO · $630: $900 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10499 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 630 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MAQUINA DE AFEITAR MINORA X10 · $8.000: $10.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11465 AND "precio_venta" IS NOT DISTINCT FROM 10400 AND "precio_costo" IS NOT DISTINCT FROM 8000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Marlboro 20 Box · $69.000: $66.000 → $69.200 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 69200, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9617 AND "precio_venta" IS NOT DISTINCT FROM 66000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0.18 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM -5958;

-- Minimarket ayala · marlboro 20 comun · $64.000: $63.000 → $66.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 66000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9824 AND "precio_venta" IS NOT DISTINCT FROM 63000 AND "precio_costo" IS NOT DISTINCT FROM 64000 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 coral XL · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9630 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 Crafted Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9515 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 3.7 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 crafted común · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9386 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 4.67 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 crafted coral box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9418 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 Crafted menta box · $42.420: $42.000 → $45.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 45000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9359 AND "precio_venta" IS NOT DISTINCT FROM 42000 AND "precio_costo" IS NOT DISTINCT FROM 42420 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 crafted mentolado común · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9401 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 4.67 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 Crafted Uva Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9496 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 3.7 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 gold · $64.020: $64.000 → $67.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 67000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9650 AND "precio_venta" IS NOT DISTINCT FROM 64000 AND "precio_costo" IS NOT DISTINCT FROM 64020 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 menta box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9622 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 titanio · $74.000: $72.000 → $76.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 76000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9677 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 74000 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Marlboro 20 uva box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9616 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · MATECOCIDO TARAGUI XPACK 10 · $9.510: $12.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10606 AND "precio_venta" IS NOT DISTINCT FROM 12400 AND "precio_costo" IS NOT DISTINCT FROM 9510 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · mega hamblet mani xunidad · $1.495: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11189 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1495 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MIEL DECFA 250G · $887,66: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10626 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 887.66 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MOCOVI ARROZ 500G · $4.900: $6.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10555 AND "precio_venta" IS NOT DISTINCT FROM 6400 AND "precio_costo" IS NOT DISTINCT FROM 4900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MOCOVI ARROZ CAJA 500G · $870: $1.200 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9839 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 870 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MOGUL GELATINA FRUTILLA 25g · $6.080: $8.000 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11324 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 6080 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MOGUL RODAJAS ACIDAS 50G · $8.236: $7.900 → $10.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10807 AND "precio_venta" IS NOT DISTINCT FROM 7900 AND "precio_costo" IS NOT DISTINCT FROM 8236 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MOLTO DURAZNO LATA · $19.200: $2.100 → $25.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 25000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11311 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 19200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MOÑO SOL PAMPEANO · $15.069,45: $19.500 → $19.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9725 AND "precio_venta" IS NOT DISTINCT FROM 19500 AND "precio_costo" IS NOT DISTINCT FROM 15069.45 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Mortadela Paladini · $8.888,89: $1.200 → $11.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9537 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 8888.89 AND "margen" IS NOT DISTINCT FROM -86.5 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · MR. POPS CHUPETIN YOGUS 625G · $4.197: $5.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11170 AND "precio_venta" IS NOT DISTINCT FROM 5500 AND "precio_costo" IS NOT DISTINCT FROM 4197 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · mumm extrabrut caja x6 · $39.300: $51.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11419 AND "precio_venta" IS NOT DISTINCT FROM 51100 AND "precio_costo" IS NOT DISTINCT FROM 39300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · mym chocolate · $1.792: $2.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11033 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1792 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · mym mani · $1.792: $2.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11034 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1792 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Nacho Picante 80g · $1.400: $1.900 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10177 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NAIPES BLANCAS x50 · $750: $1.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11022 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NOBLEZA GAUCHA 500 G · $13.900: $1.900 → $18.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10919 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 13900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NORTON COS TARDIA BLANCO · $5.270: $6.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10489 AND "precio_venta" IS NOT DISTINCT FROM 6900 AND "precio_costo" IS NOT DISTINCT FROM 5270 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NUGATON 177G · $8.930: $11.700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11504 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 8930 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NUVIA BOLSA 45x60 · $520: $700 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11131 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 520 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NUVIA BOLSA 60x90 · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11132 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NUVIA ESPONJA ACERO · $295: $400 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11173 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 295 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NUVIA LANA ACERO · $531: $700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11175 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 531 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NUVIA PABILO · $280: $400 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11216 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 280 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · NUVIA SECADOR DE PISO Nº40 · $850: $1.200 sin cambio · margen 41
UPDATE "ProductoLocal" SET "margen" = 41, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11177 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · OCB Negro · $17.400: $22.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10435 AND "precio_venta" IS NOT DISTINCT FROM 22700 AND "precio_costo" IS NOT DISTINCT FROM 17400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ODOL 90g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9470 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ODOLITO 50g · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10928 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ODOLITO 50G · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10615 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · OFF CREMA 196g · $4.000: $5.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11323 AND "precio_venta" IS NOT DISTINCT FROM 5200 AND "precio_costo" IS NOT DISTINCT FROM 4000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · OFF CREMA 60G · $33.600: $43.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10475 AND "precio_venta" IS NOT DISTINCT FROM 43700 AND "precio_costo" IS NOT DISTINCT FROM 33600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · OKEBON CHOCOLATADA 273G · $1.065: $1.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11141 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1065 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · OKEBON LECHE 273G · $1.065: $1.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11144 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1065 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ORIETA DURAZNO · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11546 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · ORIETA MERMELADA FRUTILLA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11362 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Otro Loco Mas XCAJA · $21.000: $27.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10170 AND "precio_venta" IS NOT DISTINCT FROM 27300 AND "precio_costo" IS NOT DISTINCT FROM 21000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Paleta Fela · $5.150: $800 → $6.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 6700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9531 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 5150 AND "margen" IS NOT DISTINCT FROM -84.47 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Paleta sadia · $9.700: $1.300 → $12.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 12700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9800 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 9700 AND "margen" IS NOT DISTINCT FROM -86.6 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · palito de la selva caja anana · $4.097: $5.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10669 AND "precio_venta" IS NOT DISTINCT FROM 5400 AND "precio_costo" IS NOT DISTINCT FROM 4097 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · palito de la selva caja blueberry · $4.097: $5.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10670 AND "precio_venta" IS NOT DISTINCT FROM 5400 AND "precio_costo" IS NOT DISTINCT FROM 4097 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PALITO DE LA SELVA CAJA COMUN · $4.261: $5.600 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10844 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4261 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PALO MADERA · $621: $900 sin cambio · margen 44
UPDATE "ProductoLocal" SET "margen" = 44, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10183 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · pan congelado xkg · $3.000: $3.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11291 AND "precio_venta" IS NOT DISTINCT FROM 3900 AND "precio_costo" IS NOT DISTINCT FROM 3000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PAÑO AMARILLO · $375: $500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10200 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 375 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PANTENE ACONDICIONADOR LISO EXTREMO 10ML · $4.300: $5.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10866 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PAPA CONGELADA SIPOLOT 700G · $3.150: $4.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10470 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3150 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PARCHE N°3 · $2.545: $3.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10579 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2545 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PARCHE N°5 · $4.420: $4.400 → $5.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10578 AND "precio_venta" IS NOT DISTINCT FROM 4400 AND "precio_costo" IS NOT DISTINCT FROM 4420 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PATRICH AEROSOL 230ml grand prix · $2.700: $3.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11284 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PATRICHS AVIATOR 150ML CELESTE · $2.600: $3.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10199 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PATRICHS BLACK LABEL NEGRO 150ML · $2.600: $3.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10571 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PBT JYQ · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10454 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PELEADOR ARROZ 1Kg · $12.000: $15.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10242 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PELEADOR ARROZ 500G · $6.500: $8.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10243 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · pep palito panceta 84g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10942 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · pep ramita queso 84g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11558 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · pep ramitas queso 40g · $790: $1.100 sin cambio · margen 39
UPDATE "ProductoLocal" SET "margen" = 39, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11557 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PEP RUEDITAS PIZZA 74G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10230 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PERFUMINA DEA 900ML CHERRY · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10675 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PERFUMINA DEA 900ML LAVANDA · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10685 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PERFUMINA DEA 900ML MARINA · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10686 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PERFUMINA DEA 900ML MIL FLORES · $10.800: $1.200 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10688 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PETACA CHOCOLATE · $15.600: $19.600 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10955 AND "precio_venta" IS NOT DISTINCT FROM 19600 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PETACA CREMA AL WHISKY · $15.600: $19.600 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9767 AND "precio_venta" IS NOT DISTINCT FROM 19600 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PHILCO PILAS AA x8 · $7.000: $9.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11006 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 7000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PHILCO PILAS AAA x8 · $7.000: $9.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11005 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 7000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Philips 20 box · $61.266: $61.000 → $64.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 64000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9448 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 61266 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Philips 20 común · $59.500: $59.000 → $62.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 62000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9462 AND "precio_venta" IS NOT DISTINCT FROM 59000 AND "precio_costo" IS NOT DISTINCT FROM 59500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · philips 20 mentolado box · $61.320: $61.000 → $64.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 64000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9907 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 61320 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · Philips 20 red común · $29.460: $29.000 → $32.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9641 AND "precio_venta" IS NOT DISTINCT FROM 29000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 13.38 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Minimarket ayala · picadores marihuana x12 · $13.800: $18.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10846 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 13800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PICNIC 38g · $375,35: $400 → $500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10479 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 375.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PILA EVEREADY AAA X24 · $10.800: $14.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10028 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PILAS AAA ENERGIZER X4 · $3.482: $4.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10574 AND "precio_venta" IS NOT DISTINCT FROM 4600 AND "precio_costo" IS NOT DISTINCT FROM 3482 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE JABON x3 HUMENTACION · $2.000: $2.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9409 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE x1 BALANCE · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11011 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE X1 COCO Y VAINILLA · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11342 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE X1 FLORES ROSAS · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11328 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE x1 HUMENTACION · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11014 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE x1 JAZMIN INTENSO · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11296 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE x1 LAVANDA · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11297 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE x1 NUTRICION · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11015 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE x1 RADIANTE · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11003 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PLUSBELLE x1 RECONEXION · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11004 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PORTEÑITAS 139G · $825: $1.100 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11168 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 825 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · POXIPOL · $4.370: $5.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10321 AND "precio_venta" IS NOT DISTINCT FROM 5700 AND "precio_costo" IS NOT DISTINCT FROM 4370 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · prepizza cebolla · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11071 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · prepizza mixta · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11133 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PRESERVATIVO TULIPAN CLASICO x16U · $28.680: $37.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10392 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 28680 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PRESTO PRONTA POLENTA 490G · $46.065,72: $33.000 → $59.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 59900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10215 AND "precio_venta" IS NOT DISTINCT FROM 33000 AND "precio_costo" IS NOT DISTINCT FROM 46065.72 AND "margen" IS NOT DISTINCT FROM -28.36 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PULVERIZADOR1L · $1.120: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11013 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1120 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Pure de tomate molto 520g X24 · $16.000: $18.500 → $20.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11534 AND "precio_venta" IS NOT DISTINCT FROM 18500 AND "precio_costo" IS NOT DISTINCT FROM 16000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PURE HUERTA PULPA 205G X18 · $6.850: $9.000 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10207 AND "precio_venta" IS NOT DISTINCT FROM 9000 AND "precio_costo" IS NOT DISTINCT FROM 6850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · PURE LA HUERTA 530G X12 · $9.660: $12.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10206 AND "precio_venta" IS NOT DISTINCT FROM 12600 AND "precio_costo" IS NOT DISTINCT FROM 9660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · QUAKER AVENA TRADICIONAL · $1.790: $2.400 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11234 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · QUENTO ARROZ 92G · $1.320: $1.800 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11476 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1320 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Queso Cremoso Cremac · $8.400: $1.300 → $11.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9366 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 8400 AND "margen" IS NOT DISTINCT FROM -84.52 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · quilmes x2 · $5.666,66: $6.000 → $7.366,66 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7366.66, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14951 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 5666.66 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · QUIÑLMES · $5.666,66: $6.000 → $7.366,66 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7366.66, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15388 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 5666.66 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · QUITA ESMALTE CUTEX · $1.361: $1.800 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10613 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1361 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · QUITA ESMALTE CUTEX VIOLETA · $1.361: $1.800 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10616 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1361 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · QUITAESMALTE NEPTUS 60CM · $600: $800 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11074 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RAFFAELLO 90G · $4.453: $5.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10818 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 4453 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RAFTING 3L NARANJA · $9.460: $12.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10255 AND "precio_venta" IS NOT DISTINCT FROM 12300 AND "precio_costo" IS NOT DISTINCT FROM 9460 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RAID AEROSOL SIN OLOR · $4.590: $6.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11180 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 4590 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RAID ESPIRAL 12U · $2.545: $3.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11129 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2545 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RAID ESPIRAL X12 LAVANDA · $2.700: $3.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11315 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · raid lavanda x24 · $48.000: $62.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11418 AND "precio_venta" IS NOT DISTINCT FROM 62400 AND "precio_costo" IS NOT DISTINCT FROM 48000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · raid x 24 · $50.000: $65.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11417 AND "precio_venta" IS NOT DISTINCT FROM 65000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RAMOLAC DULCE DE LECHE 200ML · $880: $1.200 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11241 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RAVIOLES VILLAD AGRI carne y verdura · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10946 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RAYOVAC AAA X 5U · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10680 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RED LABEL WHISKY 1L · $22.945: $29.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11225 AND "precio_venta" IS NOT DISTINCT FROM 29900 AND "precio_costo" IS NOT DISTINCT FROM 22945 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · RED LABEL WHISKY 750ML · $19.296: $25.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11224 AND "precio_venta" IS NOT DISTINCT FROM 25100 AND "precio_costo" IS NOT DISTINCT FROM 19296 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REJILLA NUVIA 32X42CM · $300: $400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10245 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REJILLA SUPER AUTO · $671: $900 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11012 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 671 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REX 250g · $2.006: $2.700 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11070 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2006 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA AERESOL BAMBOO · $3.140,99: $4.900 sin cambio · margen 56
UPDATE "ProductoLocal" SET "margen" = 56, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10274 AND "precio_venta" IS NOT DISTINCT FROM 4900 AND "precio_costo" IS NOT DISTINCT FROM 3140.99 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA AEROSOL ACTIVE MOTION 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9449 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · rexona aerosol antibacterial · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10827 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA AEROSOL ANTIBACTERIAL · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10569 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA AEROSOL COTTON DRY 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10275 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · rexona aerosol futbol fanatic · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10819 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · rexona aerosol futbol fanaticas · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10858 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA AEROSOL MEN INVISIBLE · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9565 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA AEROSOL MEN SENSITIVE 150ML · $3.650: $4.200 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9490 AND "precio_venta" IS NOT DISTINCT FROM 4200 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA AEROSOL NUTRITIVE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9567 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA BOLILLA ACTIVE EMOTION · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10841 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA BOLILLA BAMBOO & ALOE VERA X50ML · $2.700: $2.800 → $3.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10714 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA BOLILLA INVISIBLE 50ML · $2.639,07: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10248 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2639.07 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA BOLILLA NUTRITIVE 50ML · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10283 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA BOLILLA POWDER DRY · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10809 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA BOLILLA V8 50ML · $2.639,07: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10277 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2639.07 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · rexona invisible mujer aerosol · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9570 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA JABON 125Fgr NUTRITIVE · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10287 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA JABON TOCADOR x1 BAMBOO · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10279 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA JABON TOCADOR X1 FUTBOL FANATICS · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10797 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA JABON TOCADOR x1 SENSIBLE FRESH · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10251 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA MEN AEROSOL HOMBRE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10480 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA MEN AEROSOL V8 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9571 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · REXONA MEN XTRACOOL 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9572 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Salame Fela · $14.000: $1.700 → $18.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9587 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 14000 AND "margen" IS NOT DISTINCT FROM -87.86 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Salame Fox · $16.500: $2.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9356 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM -86.67 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SALUTE ALCOHOL 500ML · $1.580: $2.100 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10387 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1580 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · sedal acondicionador liso 190 · $32.004,36: $2.900 → $41.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 41700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11543 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SEDAL ACONDICIONADOR x10ML BALANCE · $5.373,36: $5.600 → $7.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10997 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 5373.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SEDAL SHAMPOO x190ml BALANCE · $32.004,36: $2.900 → $41.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 41700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11000 AND "precio_venta" IS NOT DISTINCT FROM 2900 AND "precio_costo" IS NOT DISTINCT FROM 32004.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SERTAL PERLA · $700: $700 → $1.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15096 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 700 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · Skyy Coconut X CAJA · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10327 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SKYY VODKA APRICOT X CAJA · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10877 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SKYY VODKA BLOOD ORANGE X CAJA · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11206 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SKYY VODKA COSMIC X CAJA · $102.000: $171.600 sin cambio · margen 69
UPDATE "ProductoLocal" SET "margen" = 69, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11160 AND "precio_venta" IS NOT DISTINCT FROM 171600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SKYY VODKA RASBERRY X CAJA 12U · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10309 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SMIRNOFF VODKA CLASICO · $87.600: $107.700 → $113.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 113900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10329 AND "precio_venta" IS NOT DISTINCT FROM 107700 AND "precio_costo" IS NOT DISTINCT FROM 87600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SOL PAMPEANO MOSTACHOL · $10.800: $12.300 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10133 AND "precio_venta" IS NOT DISTINCT FROM 12300 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SOL PAMPEANO TALLARIN · $14.400: $15.800 → $18.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 18800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10507 AND "precio_venta" IS NOT DISTINCT FROM 15800 AND "precio_costo" IS NOT DISTINCT FROM 14400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · SPEED CHICO · $33.320: $40.800 → $43.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 43400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10477 AND "precio_venta" IS NOT DISTINCT FROM 40800 AND "precio_costo" IS NOT DISTINCT FROM 33320 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · speed zero · $18.900: $24.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10539 AND "precio_venta" IS NOT DISTINCT FROM 24600 AND "precio_costo" IS NOT DISTINCT FROM 18900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · STELLA 473ML · $52.160: $67.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10256 AND "precio_venta" IS NOT DISTINCT FROM 67900 AND "precio_costo" IS NOT DISTINCT FROM 52160 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · TARAGUI YERBA 500G · $16.500: $20.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9794 AND "precio_venta" IS NOT DISTINCT FROM 20200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · TERRABUSI VARIEDAD 390G · $44.700: $17.500 → $58.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 58200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10334 AND "precio_venta" IS NOT DISTINCT FROM 17500 AND "precio_costo" IS NOT DISTINCT FROM 44700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · TORO AMARRILLA 700ML PACK X 6 · $8.400: $11.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10361 AND "precio_venta" IS NOT DISTINCT FROM 11000 AND "precio_costo" IS NOT DISTINCT FROM 8400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · TORO AMARILLA BOTELLON 1L · $11.000: $14.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10360 AND "precio_venta" IS NOT DISTINCT FROM 14300 AND "precio_costo" IS NOT DISTINCT FROM 11000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · toro ETIQ BLANCA 750ML · $11.900: $15.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11435 AND "precio_venta" IS NOT DISTINCT FROM 15500 AND "precio_costo" IS NOT DISTINCT FROM 11900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · TRAVIATA CRACK PORTEÑITA 96g · $802: $1.700 sin cambio · margen 111
UPDATE "ProductoLocal" SET "margen" = 111, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11370 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 802 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · UNION YERBA 500G · $16.500: $20.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 9793 AND "precio_venta" IS NOT DISTINCT FROM 20200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · VENADO TUERTO HARINA 000 · $8.991,70: $9.900 → $11.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10105 AND "precio_venta" IS NOT DISTINCT FROM 9900 AND "precio_costo" IS NOT DISTINCT FROM 8991.7 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · VENUS 3 FILOS · $7.200: $8.800 → $9.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10336 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 7200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Minimarket ayala · VINO TORO ETIQUETA BLANCA 1.125L · $15.200: $19.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 10362 AND "precio_venta" IS NOT DISTINCT FROM 19800 AND "precio_costo" IS NOT DISTINCT FROM 15200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Aceitunas negras · $14.580: $15.000 → $19.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8977 AND "precio_venta" IS NOT DISTINCT FROM 15000 AND "precio_costo" IS NOT DISTINCT FROM 14580 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · BOLSAS RERSIDUO 45X60 · $660: $900 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7302 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Camel 20 box · $69.000: $72.000 → $89.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 89700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15579 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Carcasa 2x $1500 · $1.430: $1.500 → $1.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14784 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1430 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Chisito Queth 65g · $999,75: $1.000 → $1.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14094 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 999.75 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · CLOSE UP HORTELA 70g · $47.925,86: $40.900 → $116.400 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 116400, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8725 AND "precio_venta" IS NOT DISTINCT FROM 40900 AND "precio_costo" IS NOT DISTINCT FROM 47925.86 AND "margen" IS NOT DISTINCT FROM 142.86 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · full sport tropicales 500cc · $7.073: $7.100 → $9.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14476 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 7073 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · imperial 1lt · $44.136: $44.200 → $57.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 57400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14420 AND "precio_venta" IS NOT DISTINCT FROM 44200 AND "precio_costo" IS NOT DISTINCT FROM 44136 AND "margen" IS NOT DISTINCT FROM -0.05 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Lucky 10 origen convertible · $5.658.000: $5.658.000 → $7.355.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7355400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14522 AND "precio_venta" IS NOT DISTINCT FROM 5658000 AND "precio_costo" IS NOT DISTINCT FROM 5658000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Marlboro 20 titanio · $74.000: $73.000 → $77.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 77000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 7114 AND "precio_venta" IS NOT DISTINCT FROM 73000 AND "precio_costo" IS NOT DISTINCT FROM 74000 AND "margen" IS NOT DISTINCT FROM 4.4 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 300;

-- Casiano casas · Philips 20 bluw select · $29.460: $29.460 → $38.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 38300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14512 AND "precio_venta" IS NOT DISTINCT FROM 29460 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Picada · $1.681,60: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14348 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1681.6 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · Rexona AEROSOL Active Emotion · $3.360: $4.800 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13832 AND "precio_venta" IS NOT DISTINCT FROM 4800 AND "precio_costo" IS NOT DISTINCT FROM 3360 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Casiano casas · TRAVIATA CRACK PORTEÑITA 96g · $802: $1.700 sin cambio · margen 111
UPDATE "ProductoLocal" SET "margen" = 111, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 8749 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 802 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Aceitunas negras · $14.580: $19.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11598 AND "precio_venta" IS NOT DISTINCT FROM 0 AND "precio_costo" IS NOT DISTINCT FROM 14580 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Amoxicilina 500g · $300: $300 → $400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14928 AND "precio_venta" IS NOT DISTINCT FROM 300 AND "precio_costo" IS NOT DISTINCT FROM 300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · BENGALA X4 · $1.900: $2.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12149 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · BIC ENCENDEDOR MAXI · $18.260: $23.600 → $23.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13097 AND "precio_venta" IS NOT DISTINCT FROM 23600 AND "precio_costo" IS NOT DISTINCT FROM 18260 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · BIC ENCENDEDOR MINI · $12.575: $14.700 → $16.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 16400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12250 AND "precio_venta" IS NOT DISTINCT FROM 14700 AND "precio_costo" IS NOT DISTINCT FROM 12575 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · BOLSAS RERSIDUO 45X60 · $660: $900 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12119 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · BROCHES X12u PLASCTICO NUVIA · $800: $1.100 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12117 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · BROCHES MADERA NUVIA X12 · $420: $600 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12116 AND "precio_venta" IS NOT DISTINCT FROM 600 AND "precio_costo" IS NOT DISTINCT FROM 420 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Budin elixir x6 · $6.000: $7.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13802 AND "precio_venta" IS NOT DISTINCT FROM 7800 AND "precio_costo" IS NOT DISTINCT FROM 6000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CABO MADERA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13197 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Camel 10 · $40.380: $39.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12658 AND "precio_venta" IS NOT DISTINCT FROM 39000 AND "precio_costo" IS NOT DISTINCT FROM 40380 AND "margen" IS NOT DISTINCT FROM 0.31 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Camel 20 box · $69.000: $72.000 → $89.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 89700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15581 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CANDELA GLOBOS 50U · $2.900: $3.800 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13487 AND "precio_venta" IS NOT DISTINCT FROM 3800 AND "precio_costo" IS NOT DISTINCT FROM 2900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Cepillo de Dientes Mr G · $6.600: $8.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13783 AND "precio_venta" IS NOT DISTINCT FROM 8600 AND "precio_costo" IS NOT DISTINCT FROM 6600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · cepillo de mano planchita · $1.385,45: $1.900 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13165 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1385.45 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CEPILLO MAPUCHE DE MANO · $1.321: $1.800 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12203 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1321 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CERVEZA 1890 1L · $26.000: $33.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12102 AND "precio_venta" IS NOT DISTINCT FROM 33800 AND "precio_costo" IS NOT DISTINCT FROM 26000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CERVEZA 1890 LATA · $26.000: $33.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13255 AND "precio_venta" IS NOT DISTINCT FROM 33800 AND "precio_costo" IS NOT DISTINCT FROM 26000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CERVEZA HEINEKEN 1L · $56.500: $73.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12322 AND "precio_venta" IS NOT DISTINCT FROM 73500 AND "precio_costo" IS NOT DISTINCT FROM 56500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CHANDON APERITIF XCAJA · $90.000: $117.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12666 AND "precio_venta" IS NOT DISTINCT FROM 117000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CHANDON DELICE XCAJA · $90.000: $117.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12213 AND "precio_venta" IS NOT DISTINCT FROM 117000 AND "precio_costo" IS NOT DISTINCT FROM 90000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CHANITA ROLLO DE COCINA · $7.481: $9.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12976 AND "precio_venta" IS NOT DISTINCT FROM 9800 AND "precio_costo" IS NOT DISTINCT FROM 7481 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CHEETOS QUESO 43G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12993 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CHEETOS QUESO CREMA 85G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13187 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Chester 20 común · $49.980: $49.000 → $52.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 52000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11666 AND "precio_venta" IS NOT DISTINCT FROM 49000 AND "precio_costo" IS NOT DISTINCT FROM 49980 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · chester 20 mentolado comun · $50.000: $49.000 → $52.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 52000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12626 AND "precio_venta" IS NOT DISTINCT FROM 49000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Chester 20 Purple motion 2 box · $55.380: $55.000 → $58.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 58000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11665 AND "precio_venta" IS NOT DISTINCT FROM 55000 AND "precio_costo" IS NOT DISTINCT FROM 55380 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Chocolatada Cindor · $5.200: $5.200 → $6.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 6800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15172 AND "precio_venta" IS NOT DISTINCT FROM 5200 AND "precio_costo" IS NOT DISTINCT FROM 5200 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Chocolatada cindor 200ml · $1.700: $1.700 → $2.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15173 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1700 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Chocolate Arcor Chocolinas · $29.595,99: $28.000 → $38.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 38500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11916 AND "precio_venta" IS NOT DISTINCT FROM 28000 AND "precio_costo" IS NOT DISTINCT FROM 29595.99 AND "margen" IS NOT DISTINCT FROM -5.39 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CHOCOLATIN BLANCO 20X8G · $5.694: $7.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13038 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 5694 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CLIGHT POMELO · $8.066: $8.100 → $10.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 10500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12215 AND "precio_venta" IS NOT DISTINCT FROM 8100 AND "precio_costo" IS NOT DISTINCT FROM 8066 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · COCA COLA 2.25L · $28.500: $27.600 → $37.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 37100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12176 AND "precio_venta" IS NOT DISTINCT FROM 27600 AND "precio_costo" IS NOT DISTINCT FROM 28500 AND "margen" IS NOT DISTINCT FROM -3.16 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · COLGATE DENTRIFICO 70G X12 · $22.200: $28.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13185 AND "precio_venta" IS NOT DISTINCT FROM 28900 AND "precio_costo" IS NOT DISTINCT FROM 22200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · COLIBRI POMADA NEGRO · $2.666: $3.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13137 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2666 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CONDIMENTO ARROZ 25G · $10.670,40: $12.400 → $13.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11848 AND "precio_venta" IS NOT DISTINCT FROM 12400 AND "precio_costo" IS NOT DISTINCT FROM 10670.4 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CONDIMENTO PIZZA · $9.000: $11.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11846 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 9000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CORDON EL MOÑO X12U · $1.880: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12202 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · cordones negros · $1.881: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13201 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1881 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · CORONA LATA 473ML · $36.000: $46.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13615 AND "precio_venta" IS NOT DISTINCT FROM 46800 AND "precio_costo" IS NOT DISTINCT FROM 36000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DINAMITA EXTRA FLAMIN HOT 82g · $1.965: $2.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13617 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 1965 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Disco empanada casero x1 · $1.490: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14996 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1490 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Disco empanada casero x3 · $1.400: $3.500 sin cambio · margen 150
UPDATE "ProductoLocal" SET "margen" = 150, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14997 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 1400 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DORITO SWEET CHILI 35G · $1.650: $1.900 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13664 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DORITO DINAMITA 45G · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13650 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DORITO FLAMINT HOT 45G · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13657 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DORITOS 77G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12290 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DORITOS SWEET CHILI 74G · $2.500: $3.300 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13389 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Dover QR · $1.300: $1.300 → $1.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15267 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DOWNY 400ML BRISA INTENSO · $3.141: $4.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13500 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3141 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DOWNY BRISA DE VERANO · $2.650: $3.200 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13735 AND "precio_venta" IS NOT DISTINCT FROM 3200 AND "precio_costo" IS NOT DISTINCT FROM 2650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DOWNY BRISA SUAVE · $2.650: $3.200 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13731 AND "precio_venta" IS NOT DISTINCT FROM 3200 AND "precio_costo" IS NOT DISTINCT FROM 2650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DOWNY BRISA SUAVE 500ML · $3.400: $4.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12817 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · DOWNYY CONCENTRADO 1L BRISA DE VERANO · $7.842: $10.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13259 AND "precio_venta" IS NOT DISTINCT FROM 10200 AND "precio_costo" IS NOT DISTINCT FROM 7842 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ELEMENTOS Malbec · $25.200: $25.000 → $32.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 32800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12413 AND "precio_venta" IS NOT DISTINCT FROM 25000 AND "precio_costo" IS NOT DISTINCT FROM 25200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ELITE DISNEY X6 · $1.146: $1.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13083 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1146 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Encendedor personalizado · $500: $1.000 sin cambio · margen 100
UPDATE "ProductoLocal" SET "margen" = 100, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14644 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ESCOBA EUROPA · $1.390: $1.900 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13144 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1390 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ESCOBILLON ECON · $1.411: $1.900 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12287 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1411 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ESCOBILLON KALPON GONDOLA · $1.880: $2.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13226 AND "precio_venta" IS NOT DISTINCT FROM 2500 AND "precio_costo" IS NOT DISTINCT FROM 1880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ESCOBILLON NEPTUNO DEA · $2.055: $2.700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13227 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2055 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ESCOLAZO NAIPES 50 · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13448 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ESPIRAL RAID caja 12 x 4 · $9.375: $12.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12619 AND "precio_venta" IS NOT DISTINCT FROM 12200 AND "precio_costo" IS NOT DISTINCT FROM 9375 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ESPONJA AMARILLA BATUQUE · $220: $300 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12960 AND "precio_venta" IS NOT DISTINCT FROM 300 AND "precio_costo" IS NOT DISTINCT FROM 220 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ESPONJA DE BRONCE DEA · $505: $700 sin cambio · margen 38
UPDATE "ProductoLocal" SET "margen" = 38, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11709 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 505 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FANTOCHE ELIXIR ALFAJOR · $7.421: $9.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13375 AND "precio_venta" IS NOT DISTINCT FROM 9700 AND "precio_costo" IS NOT DISTINCT FROM 7421 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FRANELA FIBRAN · $1.040: $1.400 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12277 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1040 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FRANELA NUVIA · $821: $1.100 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12256 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 821 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FRESH LIMONE · $1.500: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15175 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FRESH MANZANA · $1.500: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15177 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Fresh naranja 1500ml · $1.500: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15174 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FRESH PERA · $1.500: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15179 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FRESH POMELO · $1.500: $1.500 → $2.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15176 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · fresita farruca · $14.200: $18.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13643 AND "precio_venta" IS NOT DISTINCT FROM 18500 AND "precio_costo" IS NOT DISTINCT FROM 14200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FRIZZE LATA BLUE · $36.000: $11.400 → $46.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 46800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12321 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 36000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · full sport tropicales 500cc · $7.073: $7.100 → $9.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 9200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14478 AND "precio_venta" IS NOT DISTINCT FROM 7100 AND "precio_costo" IS NOT DISTINCT FROM 7073 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FUYI AEROSOL 360CM3 · $3.510: $4.600 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12847 AND "precio_venta" IS NOT DISTINCT FROM 4600 AND "precio_costo" IS NOT DISTINCT FROM 3510 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · FUYI PASTILLA · $4.480: $5.900 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12808 AND "precio_venta" IS NOT DISTINCT FROM 5900 AND "precio_costo" IS NOT DISTINCT FROM 4480 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Fuyi TABLETA CAJA X12U · $3.100: $4.100 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12249 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GAMUZA HIGIENICO · $15.169,80: $15.100 → $19.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 19800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12979 AND "precio_venta" IS NOT DISTINCT FROM 15100 AND "precio_costo" IS NOT DISTINCT FROM 15169.8 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GANCIA 473ML · $12.000: $15.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12323 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Gancia 950ml · $82.800: $107.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12324 AND "precio_venta" IS NOT DISTINCT FROM 107700 AND "precio_costo" IS NOT DISTINCT FROM 82800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GATORADE ROJO 500ML · $6.720: $8.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12307 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 6720 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GATORADE AZUL 500ML · $6.720: $8.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12306 AND "precio_venta" IS NOT DISTINCT FROM 8800 AND "precio_costo" IS NOT DISTINCT FROM 6720 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GAZA SUEZ CAJA · $2.672: $3.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12308 AND "precio_venta" IS NOT DISTINCT FROM 3500 AND "precio_costo" IS NOT DISTINCT FROM 2672 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GEL INTIMO TULIPAN · $2.993: $3.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13167 AND "precio_venta" IS NOT DISTINCT FROM 3900 AND "precio_costo" IS NOT DISTINCT FROM 2993 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GUANTES DEA CHICOS · $2.102: $2.800 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13213 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2102 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GUANTES DEA GRANDE · $1.960: $2.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13214 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 1960 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GUANTES NUVIA M · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13215 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GUANTES NUVIA S · $1.125: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13216 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1125 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · GUMBALLS X18 · $3.394: $4.500 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13048 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3394 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Harina Cañuelas 000 · $8.615,80: $8.400 → $11.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13759 AND "precio_venta" IS NOT DISTINCT FROM 8400 AND "precio_costo" IS NOT DISTINCT FROM 8615.8 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Harina Venado Tuerto Leudante · $11.658,90: $11.400 → $15.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 15200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12303 AND "precio_venta" IS NOT DISTINCT FROM 11400 AND "precio_costo" IS NOT DISTINCT FROM 11658.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · HEINEKEN LATA 473 · $56.000: $72.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12879 AND "precio_venta" IS NOT DISTINCT FROM 72800 AND "precio_costo" IS NOT DISTINCT FROM 56000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Helado bon o bon · $3.000: $3.000 → $3.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15269 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 3000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · imperial 1lt · $44.136: $44.200 → $57.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 57400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14422 AND "precio_venta" IS NOT DISTINCT FROM 44200 AND "precio_costo" IS NOT DISTINCT FROM 44136 AND "margen" IS NOT DISTINCT FROM -0.05 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · IODOPOVIDONA · $2.140: $2.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12616 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2140 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jaimitos X 10u · $1.120: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12320 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1120 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Anana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13708 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Frutilla Anana Banana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13719 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Frutilla X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13712 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Limonada X Caja · $5.962,16: $7.900 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13716 AND "precio_venta" IS NOT DISTINCT FROM 7900 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Manzana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13717 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Multi Furta X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13720 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Naranja Dulce X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13722 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Naranja Banana X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13721 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Naranja Durzano X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13724 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Naranja X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13725 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Jugo Arcor Pomelo Rosado X Caja · $5.962,16: $6.600 → $7.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13709 AND "precio_venta" IS NOT DISTINCT FROM 6600 AND "precio_costo" IS NOT DISTINCT FROM 5962.16 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KIT DINI · $1.080: $1.500 sin cambio · margen 38
UPDATE "ProductoLocal" SET "margen" = 38, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13034 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1080 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABOR VERDURAS VERDE · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13570 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES AJI COMINO Y PIMEN · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13574 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES BARBACOA AHUMADA · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13566 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES CARNE · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13573 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES CIBOUL Y PUERRO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13567 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES OREG TOM Y AJO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13572 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES POLLO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13571 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES TOMA CEBO Y MORRON · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13575 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES VERDURAS · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13568 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR MIX SABORES VERDURAS 0 SODIO · $1.050: $1.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13569 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1050 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR SOPA CREMA CHOCLO 70G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13433 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR SOPA CREMA VEGETALES 60G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12346 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR SOPA CREMA ZAPALLO 70G · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12547 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR SOPA DE LETRAS · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13439 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR SOPA POLLO CABELLO DE ANGEL · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13436 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR SOPA VEGETALES CARACOLITOS TRICOLOR · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13437 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KNORR SOPA VEGETALES MUNICIONES · $1.621: $2.200 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13438 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KROMY x48unid · $6.427: $6.700 → $8.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 8400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13036 AND "precio_venta" IS NOT DISTINCT FROM 6700 AND "precio_costo" IS NOT DISTINCT FROM 6427 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · KROOMY X12 · $4.100: $4.500 → $5.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12763 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 4100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · kroomy 10g frutichox24u · $3.500: $4.500 → $4.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13679 AND "precio_venta" IS NOT DISTINCT FROM 4500 AND "precio_costo" IS NOT DISTINCT FROM 3500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LA GOTITA 2ML · $10.400: $12.500 → $13.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 13600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12704 AND "precio_venta" IS NOT DISTINCT FROM 12500 AND "precio_costo" IS NOT DISTINCT FROM 10400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LA GOTITA GEL 3ML · $12.360,61: $15.700 → $16.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 16100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12676 AND "precio_venta" IS NOT DISTINCT FROM 15700 AND "precio_costo" IS NOT DISTINCT FROM 12360.61 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LA HOJA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13766 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LA HUERTA CHICO 210G · $8.450: $9.900 → $11.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 11000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11661 AND "precio_venta" IS NOT DISTINCT FROM 9900 AND "precio_costo" IS NOT DISTINCT FROM 8450 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LA VIRGINIA TE TILO · $14.310: $18.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12605 AND "precio_venta" IS NOT DISTINCT FROM 18700 AND "precio_costo" IS NOT DISTINCT FROM 14310 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LADYSOFT NOCTURNA x16 · $2.505: $3.300 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13507 AND "precio_venta" IS NOT DISTINCT FROM 3300 AND "precio_costo" IS NOT DISTINCT FROM 2505 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LAMPARA 7W · $4.340,85: $5.600 → $5.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12953 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4340.85 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LAMPARA CANDELA 12W · $5.500: $7.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13100 AND "precio_venta" IS NOT DISTINCT FROM 7200 AND "precio_costo" IS NOT DISTINCT FROM 5500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LAMPARA CANDELA 15W · $5.750: $7.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11677 AND "precio_venta" IS NOT DISTINCT FROM 7500 AND "precio_costo" IS NOT DISTINCT FROM 5750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · lamparita 12w · $750: $1.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12729 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LAMPARITAS 15W · $960: $1.300 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12733 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 960 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Las Moras Malbec · $18.600: $23.100 → $24.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 24200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12314 AND "precio_venta" IS NOT DISTINCT FROM 23100 AND "precio_costo" IS NOT DISTINCT FROM 18600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LAYS 40g QUESO CREMA · $1.650: $1.900 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13530 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LAYS BARBACOA 77G · $2.500: $3.000 → $3.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13464 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LAYS CLASICA 40G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12361 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · lays flaming hot 30grs · $1.650: $1.700 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12909 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LHERITIER 110G · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13620 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LIMZUL 800ML · $1.600: $2.100 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13727 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · LOS ARBOLES MALBEC · $24.600: $26.600 → $32.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12354 AND "precio_venta" IS NOT DISTINCT FROM 26600 AND "precio_costo" IS NOT DISTINCT FROM 24600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Lucky 10 origen convertible · $5.658.000: $5.658.000 → $7.355.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7355400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14524 AND "precio_venta" IS NOT DISTINCT FROM 5658000 AND "precio_costo" IS NOT DISTINCT FROM 5658000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Lucky 20 box · $62.346: $61.000 → $65.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11898 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 2.79 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Lucky 20 común · $58.000: $57.000 → $60.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 60000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11882 AND "precio_venta" IS NOT DISTINCT FROM 57000 AND "precio_costo" IS NOT DISTINCT FROM 58000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Lucky 20 convertible xl · $62.346: $62.000 → $65.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 65000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11858 AND "precio_venta" IS NOT DISTINCT FROM 62000 AND "precio_costo" IS NOT DISTINCT FROM 62346 AND "margen" IS NOT DISTINCT FROM 2.79 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Lucky 20 red · $29.460: $29.000 → $32.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 32000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11619 AND "precio_venta" IS NOT DISTINCT FROM 29000 AND "precio_costo" IS NOT DISTINCT FROM 29460 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Lucky 20 Silver · $54.300: $54.000 → $57.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 57000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12938 AND "precio_venta" IS NOT DISTINCT FROM 54000 AND "precio_costo" IS NOT DISTINCT FROM 54300 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Lucky origen 20 comun · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11696 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Lucky origen 20 común mentolado · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11875 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · LYSOFORM AEROSOL CITRICA · $2.300: $3.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13452 AND "precio_venta" IS NOT DISTINCT FROM 3000 AND "precio_costo" IS NOT DISTINCT FROM 2300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGDALENA DON SATUR CHIP · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12800 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGDALENA DON SATUR DDL · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12376 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGDALENAS DON SATUR VAINILLA · $18.059,90: $21.500 → $23.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 23500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12381 AND "precio_venta" IS NOT DISTINCT FROM 21500 AND "precio_costo" IS NOT DISTINCT FROM 18059.9 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGISTRAL 300 LIMON CREMOSO · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13358 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGISTRAL 300 PUREZA ACTIVE · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13359 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGISTRAL 300ML LIMON · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12386 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGISTRAL 300ml MARINA · $1.800: $2.200 → $2.400 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2400, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12382 AND "precio_venta" IS NOT DISTINCT FROM 2200 AND "precio_costo" IS NOT DISTINCT FROM 1800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGISTRAL 500ML MARINA · $3.200: $3.600 → $4.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12364 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 3200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAGISTRAL 5OOml LIMON · $2.750: $3.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12365 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAIZ PISINGALLO ELIO · $630: $900 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12734 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 630 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MAÑANITA YERBA 500G · $16.500: $20.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12652 AND "precio_venta" IS NOT DISTINCT FROM 20200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Marlboro 20 Box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11852 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM -1.34 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · marlboro 20 comun · $64.000: $63.000 → $66.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 66000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12059 AND "precio_venta" IS NOT DISTINCT FROM 63000 AND "precio_costo" IS NOT DISTINCT FROM 64000 AND "margen" IS NOT DISTINCT FROM 2.51 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 coral XL · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11865 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 Crafted Box · $43.500: $43.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11750 AND "precio_venta" IS NOT DISTINCT FROM 43000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 8.64 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 crafted común · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11621 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 crafted coral box · $43.500: $44.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11653 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 1.15 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 crafted mentolado común · $40.260: $40.000 → $43.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 43000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11636 AND "precio_venta" IS NOT DISTINCT FROM 40000 AND "precio_costo" IS NOT DISTINCT FROM 40260 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 Crafted Uva Box · $43.500: $44.000 → $46.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 46000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11731 AND "precio_venta" IS NOT DISTINCT FROM 44000 AND "precio_costo" IS NOT DISTINCT FROM 43500 AND "margen" IS NOT DISTINCT FROM 1.15 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 gold · $64.020: $64.000 → $67.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 67000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11885 AND "precio_venta" IS NOT DISTINCT FROM 64000 AND "precio_costo" IS NOT DISTINCT FROM 64020 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 menta box · $69.000: $65.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11857 AND "precio_venta" IS NOT DISTINCT FROM 65000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM -1.34 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 titanio · $74.000: $72.000 → $76.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 76000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11912 AND "precio_venta" IS NOT DISTINCT FROM 72000 AND "precio_costo" IS NOT DISTINCT FROM 74000 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Marlboro 20 uva box · $69.000: $68.000 → $71.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 71000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11851 AND "precio_venta" IS NOT DISTINCT FROM 68000 AND "precio_costo" IS NOT DISTINCT FROM 69000 AND "margen" IS NOT DISTINCT FROM -1.34 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · MATECOCIDO TARAGUI XPACK 10 · $9.510: $12.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12841 AND "precio_venta" IS NOT DISTINCT FROM 12400 AND "precio_costo" IS NOT DISTINCT FROM 9510 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · mega hamblet mani xunidad · $1.495: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13424 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1495 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MIEL DECFA 250G · $887,66: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12861 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 887.66 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MOCOVI ARROZ 500G · $4.900: $6.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12790 AND "precio_venta" IS NOT DISTINCT FROM 6400 AND "precio_costo" IS NOT DISTINCT FROM 4900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MOCOVI ARROZ CAJA 500G · $870: $1.200 sin cambio · margen 37
UPDATE "ProductoLocal" SET "margen" = 37, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12074 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 870 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MOGUL GELATINA FRUTILLA 25g · $6.080: $8.000 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13559 AND "precio_venta" IS NOT DISTINCT FROM 8000 AND "precio_costo" IS NOT DISTINCT FROM 6080 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · MR. POPS CHUPETIN YOGUS 625G · $4.197: $5.500 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13405 AND "precio_venta" IS NOT DISTINCT FROM 5500 AND "precio_costo" IS NOT DISTINCT FROM 4197 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · mumm extrabrut caja x6 · $39.300: $51.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13654 AND "precio_venta" IS NOT DISTINCT FROM 51100 AND "precio_costo" IS NOT DISTINCT FROM 39300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · mym chocolate · $1.792: $2.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13268 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1792 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · mym mani · $1.792: $2.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13269 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1792 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Nacho Picante 80g · $1.400: $1.900 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12412 AND "precio_venta" IS NOT DISTINCT FROM 1900 AND "precio_costo" IS NOT DISTINCT FROM 1400 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · NAIPES BLANCAS x50 · $750: $1.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13257 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 750 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · NORTON COS TARDIA BLANCO · $5.270: $6.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12724 AND "precio_venta" IS NOT DISTINCT FROM 6900 AND "precio_costo" IS NOT DISTINCT FROM 5270 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Novalgina · $800: $800 → $1.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14787 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 800 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · NUGATON 177G · $8.930: $11.700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13739 AND "precio_venta" IS NOT DISTINCT FROM 11700 AND "precio_costo" IS NOT DISTINCT FROM 8930 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · NUVIA BOLSA 45x60 · $520: $700 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13366 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 520 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · NUVIA BOLSA 60x90 · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13367 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · NUVIA ESPONJA ACERO · $295: $400 sin cambio · margen 35
UPDATE "ProductoLocal" SET "margen" = 35, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13408 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 295 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · NUVIA LANA ACERO · $531: $700 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13410 AND "precio_venta" IS NOT DISTINCT FROM 700 AND "precio_costo" IS NOT DISTINCT FROM 531 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · NUVIA PABILO · $280: $400 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13451 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 280 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ODOL 90g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11705 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ODOLITO 50g · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13163 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ODOLITO 50G · $1.100: $1.500 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12850 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1100 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · OFF CREMA 196g · $4.000: $5.200 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13558 AND "precio_venta" IS NOT DISTINCT FROM 5200 AND "precio_costo" IS NOT DISTINCT FROM 4000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · OFF CREMA 60G · $33.600: $43.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12710 AND "precio_venta" IS NOT DISTINCT FROM 43700 AND "precio_costo" IS NOT DISTINCT FROM 33600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · OKEBON CHOCOLATADA 273G · $1.065: $1.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13376 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1065 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · OKEBON LECHE 273G · $1.065: $1.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13379 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 1065 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Omeprazol · $549,24: $200 → $800 · margen 45
UPDATE "ProductoLocal" SET "precio_venta" = 800, "margen" = 45, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14837 AND "precio_venta" IS NOT DISTINCT FROM 200 AND "precio_costo" IS NOT DISTINCT FROM 549.24 AND "margen" IS NOT DISTINCT FROM -63.59 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Opera 92g · $980: $1.400 sin cambio · margen 42
UPDATE "ProductoLocal" SET "margen" = 42, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14875 AND "precio_venta" IS NOT DISTINCT FROM 1400 AND "precio_costo" IS NOT DISTINCT FROM 980 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ORIETA DURAZNO · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13781 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · ORIETA MERMELADA FRUTILLA · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13597 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · palito de la selva caja anana · $4.097: $5.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12904 AND "precio_venta" IS NOT DISTINCT FROM 5400 AND "precio_costo" IS NOT DISTINCT FROM 4097 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · palito de la selva caja blueberry · $4.097: $5.400 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12905 AND "precio_venta" IS NOT DISTINCT FROM 5400 AND "precio_costo" IS NOT DISTINCT FROM 4097 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PALITO DE LA SELVA CAJA COMUN · $4.261: $5.600 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13079 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4261 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PALO MADERA · $621: $900 sin cambio · margen 44
UPDATE "ProductoLocal" SET "margen" = 44, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12418 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 621 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · pan congelado xkg · $3.000: $3.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13526 AND "precio_venta" IS NOT DISTINCT FROM 3900 AND "precio_costo" IS NOT DISTINCT FROM 3000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PAÑO AMARILLO · $375: $500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12435 AND "precio_venta" IS NOT DISTINCT FROM 500 AND "precio_costo" IS NOT DISTINCT FROM 375 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PANTENE ACONDICIONADOR LISO EXTREMO 10ML · $4.300: $5.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13101 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PAPA CONGELADA SIPOLOT 700G · $3.150: $4.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12705 AND "precio_venta" IS NOT DISTINCT FROM 4100 AND "precio_costo" IS NOT DISTINCT FROM 3150 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PARCHE N°3 · $2.545: $3.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12814 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2545 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PATRICH AEROSOL 230ml grand prix · $2.700: $3.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13519 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PATRICHS AVIATOR 150ML CELESTE · $2.600: $3.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12434 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PATRICHS BLACK LABEL NEGRO 150ML · $2.600: $3.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12806 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PBT JYQ · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12689 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PELEADOR ARROZ 1Kg · $12.000: $15.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12477 AND "precio_venta" IS NOT DISTINCT FROM 15600 AND "precio_costo" IS NOT DISTINCT FROM 12000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PELEADOR ARROZ 500G · $6.500: $8.500 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12478 AND "precio_venta" IS NOT DISTINCT FROM 8500 AND "precio_costo" IS NOT DISTINCT FROM 6500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · pep palito panceta 84g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13177 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · pep ramita queso 84g · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13793 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · pep ramitas queso 40g · $790: $1.100 sin cambio · margen 39
UPDATE "ProductoLocal" SET "margen" = 39, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13792 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PEP RUEDITAS PIZZA 74G · $1.650: $2.000 → $2.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12465 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PETACA CHOCOLATE · $15.600: $19.600 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13190 AND "precio_venta" IS NOT DISTINCT FROM 19600 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PETACA CREMA AL WHISKY · $15.600: $19.600 → $20.300 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20300, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12002 AND "precio_venta" IS NOT DISTINCT FROM 19600 AND "precio_costo" IS NOT DISTINCT FROM 15600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PHILCO PILAS AA x8 · $7.000: $9.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13241 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 7000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PHILCO PILAS AAA x8 · $7.000: $9.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13240 AND "precio_venta" IS NOT DISTINCT FROM 9100 AND "precio_costo" IS NOT DISTINCT FROM 7000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Philips 20 box · $61.266: $61.000 → $64.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 64000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11683 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 61266 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · Philips 20 común · $59.500: $59.000 → $62.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 62000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11697 AND "precio_venta" IS NOT DISTINCT FROM 59000 AND "precio_costo" IS NOT DISTINCT FROM 59500 AND "margen" IS NOT DISTINCT FROM 30 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · philips 20 mentolado box · $61.320: $61.000 → $64.000 · su regla, sin tocarla
UPDATE "ProductoLocal" SET "precio_venta" = 64000, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12142 AND "precio_venta" IS NOT DISTINCT FROM 61000 AND "precio_costo" IS NOT DISTINCT FROM 61320 AND "margen" IS NOT DISTINCT FROM 10 AND "reglaPrecio" = 'RECARGO_FIJO_UNIDAD' AND "recargoFijoUnidad" IS NOT DISTINCT FROM 200;

-- Mini unidas · picadores marihuana x12 · $13.800: $18.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13081 AND "precio_venta" IS NOT DISTINCT FROM 18000 AND "precio_costo" IS NOT DISTINCT FROM 13800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PICNIC 38g · $375,35: $400 → $500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12714 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 375.35 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PILA EVEREADY AAA X24 · $10.800: $14.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12263 AND "precio_venta" IS NOT DISTINCT FROM 14100 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PILAS AAA ENERGIZER X4 · $3.482: $4.600 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12809 AND "precio_venta" IS NOT DISTINCT FROM 4600 AND "precio_costo" IS NOT DISTINCT FROM 3482 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PLUSBELLE JABON x3 HUMENTACION · $2.000: $2.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11644 AND "precio_venta" IS NOT DISTINCT FROM 2600 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PLUSBELLE x1 BALANCE · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13246 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PLUSBELLE X1 COCO Y VAINILLA · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13577 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PLUSBELLE X1 FLORES ROSAS · $900: $1.100 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13563 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PLUSBELLE x1 HUMENTACION · $900: $1.000 → $1.200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13249 AND "precio_venta" IS NOT DISTINCT FROM 1000 AND "precio_costo" IS NOT DISTINCT FROM 900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PORTEÑITAS 139G · $825: $1.100 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13403 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 825 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · POXIPOL · $4.370: $5.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12556 AND "precio_venta" IS NOT DISTINCT FROM 5700 AND "precio_costo" IS NOT DISTINCT FROM 4370 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · prepizza cebolla · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13306 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · prepizza mixta · $1.300: $1.700 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13368 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVO Prime ultra fino · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15278 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVO TULIPAN CLASICO x16U · $28.680: $37.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12627 AND "precio_venta" IS NOT DISTINCT FROM 37300 AND "precio_costo" IS NOT DISTINCT FROM 28680 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS PRIME anatómico · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15281 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS prime extra lubicado · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15287 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS prime orgazmax · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15279 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS prime retardante · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15285 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS prime stronger · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15286 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS prime super fino · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15284 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS prime tachas · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15283 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS prime texturado · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15282 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PRESERVATIVOS prime warming · $4.300: $4.300 → $5.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 5600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15280 AND "precio_venta" IS NOT DISTINCT FROM 4300 AND "precio_costo" IS NOT DISTINCT FROM 4300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PULVERIZADOR1L · $1.120: $1.500 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13248 AND "precio_venta" IS NOT DISTINCT FROM 1500 AND "precio_costo" IS NOT DISTINCT FROM 1120 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Pure de tomate molto 520g X24 · $16.000: $18.500 → $20.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 20800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13769 AND "precio_venta" IS NOT DISTINCT FROM 18500 AND "precio_costo" IS NOT DISTINCT FROM 16000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PURE HUERTA PULPA 205G X18 · $6.850: $9.000 sin cambio · margen 31
UPDATE "ProductoLocal" SET "margen" = 31, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12442 AND "precio_venta" IS NOT DISTINCT FROM 9000 AND "precio_costo" IS NOT DISTINCT FROM 6850 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · PURE LA HUERTA 530G X12 · $9.660: $12.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12441 AND "precio_venta" IS NOT DISTINCT FROM 12600 AND "precio_costo" IS NOT DISTINCT FROM 9660 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · QUAKER AVENA TRADICIONAL · $1.790: $2.400 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13469 AND "precio_venta" IS NOT DISTINCT FROM 2400 AND "precio_costo" IS NOT DISTINCT FROM 1790 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · QUENTO ARROZ 92G · $1.320: $1.800 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13711 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1320 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · QUITA ESMALTE CUTEX · $1.361: $1.800 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12848 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1361 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · QUITA ESMALTE CUTEX VIOLETA · $1.361: $1.800 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12851 AND "precio_venta" IS NOT DISTINCT FROM 1800 AND "precio_costo" IS NOT DISTINCT FROM 1361 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · QUITAESMALTE NEPTUS 60CM · $600: $800 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13309 AND "precio_venta" IS NOT DISTINCT FROM 800 AND "precio_costo" IS NOT DISTINCT FROM 600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RAFFAELLO 90G · $4.453: $5.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13053 AND "precio_venta" IS NOT DISTINCT FROM 5800 AND "precio_costo" IS NOT DISTINCT FROM 4453 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RAFTING 3L NARANJA · $9.460: $12.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12490 AND "precio_venta" IS NOT DISTINCT FROM 12300 AND "precio_costo" IS NOT DISTINCT FROM 9460 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RAID AEROSOL SIN OLOR · $4.590: $6.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13415 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 4590 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RAID ESPIRAL 12U · $2.545: $3.400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13364 AND "precio_venta" IS NOT DISTINCT FROM 3400 AND "precio_costo" IS NOT DISTINCT FROM 2545 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RAID ESPIRAL X12 LAVANDA · $2.700: $3.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13550 AND "precio_venta" IS NOT DISTINCT FROM 3600 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · raid lavanda x24 · $48.000: $62.400 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13653 AND "precio_venta" IS NOT DISTINCT FROM 62400 AND "precio_costo" IS NOT DISTINCT FROM 48000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · raid x 24 · $50.000: $65.000 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13652 AND "precio_venta" IS NOT DISTINCT FROM 65000 AND "precio_costo" IS NOT DISTINCT FROM 50000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RAMOLAC DULCE DE LECHE 200ML · $880: $1.200 sin cambio · margen 36
UPDATE "ProductoLocal" SET "margen" = 36, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13476 AND "precio_venta" IS NOT DISTINCT FROM 1200 AND "precio_costo" IS NOT DISTINCT FROM 880 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RAVIOLES VILLAD AGRI carne y verdura · $1.500: $2.000 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13181 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 1500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RAYOVAC AAA X 5U · $1.200: $1.600 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12915 AND "precio_venta" IS NOT DISTINCT FROM 1600 AND "precio_costo" IS NOT DISTINCT FROM 1200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RED LABEL WHISKY 1L · $22.945: $29.900 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13460 AND "precio_venta" IS NOT DISTINCT FROM 29900 AND "precio_costo" IS NOT DISTINCT FROM 22945 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · RED LABEL WHISKY 750ML · $19.296: $25.100 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13459 AND "precio_venta" IS NOT DISTINCT FROM 25100 AND "precio_costo" IS NOT DISTINCT FROM 19296 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REJILLA NUVIA 32X42CM · $300: $400 sin cambio · margen 33
UPDATE "ProductoLocal" SET "margen" = 33, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12480 AND "precio_venta" IS NOT DISTINCT FROM 400 AND "precio_costo" IS NOT DISTINCT FROM 300 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REJILLA SUPER AUTO · $671: $900 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13247 AND "precio_venta" IS NOT DISTINCT FROM 900 AND "precio_costo" IS NOT DISTINCT FROM 671 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REX 250g · $2.006: $2.700 sin cambio · margen 34
UPDATE "ProductoLocal" SET "margen" = 34, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13305 AND "precio_venta" IS NOT DISTINCT FROM 2700 AND "precio_costo" IS NOT DISTINCT FROM 2006 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA AERESOL BAMBOO · $3.140,99: $4.900 sin cambio · margen 56
UPDATE "ProductoLocal" SET "margen" = 56, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12509 AND "precio_venta" IS NOT DISTINCT FROM 4900 AND "precio_costo" IS NOT DISTINCT FROM 3140.99 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA AEROSOL ACTIVE MOTION 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11684 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · rexona aerosol antibacterial · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13062 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA AEROSOL ANTIBACTERIAL · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12804 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA AEROSOL COTTON DRY 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12510 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · rexona aerosol futbol fanatic · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13054 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · rexona aerosol futbol fanaticas · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13093 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA AEROSOL MEN INVISIBLE · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11800 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA AEROSOL MEN SENSITIVE 150ML · $3.650: $4.200 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11725 AND "precio_venta" IS NOT DISTINCT FROM 4200 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA AEROSOL NUTRITIVE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11802 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA BOLILLA ACTIVE EMOTION · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13076 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA BOLILLA BAMBOO & ALOE VERA X50ML · $2.700: $2.800 → $3.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12949 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2700 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA BOLILLA INVISIBLE 50ML · $2.639,07: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12483 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2639.07 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA BOLILLA NUTRITIVE 50ML · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12518 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA BOLILLA POWDER DRY · $2.638,95: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13044 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2638.95 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA BOLILLA V8 50ML · $2.639,07: $2.800 → $3.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 3500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12512 AND "precio_venta" IS NOT DISTINCT FROM 2800 AND "precio_costo" IS NOT DISTINCT FROM 2639.07 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · rexona invisible mujer aerosol · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11805 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA JABON 125Fgr NUTRITIVE · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12522 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA JABON TOCADOR x1 BAMBOO · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12514 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA JABON TOCADOR X1 FUTBOL FANATICS · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13032 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA JABON TOCADOR x1 SENSIBLE FRESH · $1.090: $1.100 → $1.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12486 AND "precio_venta" IS NOT DISTINCT FROM 1100 AND "precio_costo" IS NOT DISTINCT FROM 1090 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA MEN AEROSOL HOMBRE 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12715 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA MEN AEROSOL V8 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11806 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · REXONA MEN XTRACOOL 150ML · $3.650: $3.700 → $4.800 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 4800, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 11807 AND "precio_venta" IS NOT DISTINCT FROM 3700 AND "precio_costo" IS NOT DISTINCT FROM 3650 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · SALUTE ALCOHOL 500ML · $1.580: $2.100 sin cambio · margen 32
UPDATE "ProductoLocal" SET "margen" = 32, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12622 AND "precio_venta" IS NOT DISTINCT FROM 2100 AND "precio_costo" IS NOT DISTINCT FROM 1580 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · SEDAL ACONDICIONADOR x10ML BALANCE · $5.373,36: $5.600 → $7.000 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7000, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13232 AND "precio_venta" IS NOT DISTINCT FROM 5600 AND "precio_costo" IS NOT DISTINCT FROM 5373.36 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Skyy Coconut X CAJA · $102.000: $132.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12562 AND "precio_venta" IS NOT DISTINCT FROM 132600 AND "precio_costo" IS NOT DISTINCT FROM 102000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · SMIRNOFF VODKA CLASICO · $87.600: $107.700 → $113.900 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 113900, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12564 AND "precio_venta" IS NOT DISTINCT FROM 107700 AND "precio_costo" IS NOT DISTINCT FROM 87600 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · SOL MAYOR ROLLO DE COCINA · $13.500: $15.900 → $17.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 17600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13458 AND "precio_venta" IS NOT DISTINCT FROM 15900 AND "precio_costo" IS NOT DISTINCT FROM 13500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · SOL PAMPEANO MOSTACHOL · $10.800: $12.300 → $14.100 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 14100, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12368 AND "precio_venta" IS NOT DISTINCT FROM 12300 AND "precio_costo" IS NOT DISTINCT FROM 10800 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Solución pegamento dini · $1.300: $1.300 → $1.700 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15207 AND "precio_venta" IS NOT DISTINCT FROM 1300 AND "precio_costo" IS NOT DISTINCT FROM 1300 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · SPEED XL · $23.500: $30.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12531 AND "precio_venta" IS NOT DISTINCT FROM 30600 AND "precio_costo" IS NOT DISTINCT FROM 23500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · speed zero · $18.900: $24.600 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12774 AND "precio_venta" IS NOT DISTINCT FROM 24600 AND "precio_costo" IS NOT DISTINCT FROM 18900 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · TARAGUI YERBA 500G · $16.500: $20.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12029 AND "precio_venta" IS NOT DISTINCT FROM 20200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Tarta de jyq porción · $2.000: $2.000 → $2.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 2600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15396 AND "precio_venta" IS NOT DISTINCT FROM 2000 AND "precio_costo" IS NOT DISTINCT FROM 2000 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Te negro ind · $100: $100 → $200 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 200, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15381 AND "precio_venta" IS NOT DISTINCT FROM 100 AND "precio_costo" IS NOT DISTINCT FROM 100 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · TORO AMARILLA BOTELLON 1L · $11.000: $14.300 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12595 AND "precio_venta" IS NOT DISTINCT FROM 14300 AND "precio_costo" IS NOT DISTINCT FROM 11000 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Torta toffi | Pasta flora | torta coco · $2.500: $4.200 sin cambio · margen 68
UPDATE "ProductoLocal" SET "margen" = 68, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14868 AND "precio_venta" IS NOT DISTINCT FROM 4200 AND "precio_costo" IS NOT DISTINCT FROM 2500 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · TRAVIATA CRACK PORTEÑITA 96g · $802: $1.700 sin cambio · margen 111
UPDATE "ProductoLocal" SET "margen" = 111, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13605 AND "precio_venta" IS NOT DISTINCT FROM 1700 AND "precio_costo" IS NOT DISTINCT FROM 802 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · UNION YERBA 500G · $16.500: $20.200 → $21.500 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 21500, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12028 AND "precio_venta" IS NOT DISTINCT FROM 20200 AND "precio_costo" IS NOT DISTINCT FROM 16500 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · Vaso Fernet 1L · $5.800: $6.000 → $7.600 · margen 30
UPDATE "ProductoLocal" SET "precio_venta" = 7600, "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14924 AND "precio_venta" IS NOT DISTINCT FROM 6000 AND "precio_costo" IS NOT DISTINCT FROM 5800 AND "margen" IS NOT DISTINCT FROM 0 AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;

-- Mini unidas · VINO TORO ETIQUETA BLANCA 1.125L · $15.200: $19.800 sin cambio · margen 30
UPDATE "ProductoLocal" SET "margen" = 30, "reglaPrecio" = 'MARGEN_PORCENTUAL', "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 12597 AND "precio_venta" IS NOT DISTINCT FROM 19800 AND "precio_costo" IS NOT DISTINCT FROM 15200 AND "margen" IS NOT DISTINCT FROM NULL AND "reglaPrecio" = 'MARGEN_PORCENTUAL' AND "recargoFijoUnidad" IS NOT DISTINCT FROM NULL;
