-- LAS PROMOCIONES VUELVEN A COMO ESTABAN. NO SE TOCAN, NUNCA.
--
-- Regla de Emanuel (2026-10-30): las promociones no se tocan, aunque estén a
-- pérdida. Las dos correcciones de ese día —20261030220000_precios_bajo_su_regla
-- y 20261030230000_precios_sin_regla— las excluían solo por el nombre (PROMO,
-- OFERTA, MAS PANES), y subieron 12 combos: el de Quilmes de Minimarket ayala
-- pasó de $6.000 a $7.366,66.
--
-- Vuelven al precio, al margen y a la regla que tenían antes de la primera de
-- las dos, sacados de respaldo.backup_precios_ubicacion_20261030. Son todos los
-- combos —un producto con componentes— que esas tandas cambiaron; ninguna ficha
-- del depósito se había tocado.
--
-- Cada UPDATE exige el precio y el margen que la fila tiene hoy: si alguien los
-- cambió a mano después, esa fila no se toca.
--
-- Antes de nada, todas las filas activas con su ficha van a
-- respaldo.backup_precios_ubicacion_20261030_e.

CREATE SCHEMA IF NOT EXISTS respaldo;

CREATE TABLE respaldo.backup_precios_ubicacion_20261030_e AS
SELECT pl."id", pl."localId", pl."baseId", pl."precio_costo", pl."precio_venta", pl."margen",
       pl."reglaPrecio", pl."recargoFijoUnidad",
       b."precio_costo" AS base_precio_costo, b."precio_venta" AS base_precio_venta, b."margen" AS base_margen,
       CURRENT_TIMESTAMP AS respaldado_en
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
 WHERE pl."activo";

-- Casiano casas · Carcasa 2x $1500 · $1.900 → $1.500
UPDATE "ProductoLocal" SET "precio_venta" = 1500, "margen" = 0, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14784 AND "precio_venta" = 1900 AND "margen" = 30;

-- Casiano casas · Chisito Queth 65g · $1.300 → $1.000
UPDATE "ProductoLocal" SET "precio_venta" = 1000, "margen" = 0, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14094 AND "precio_venta" = 1300 AND "margen" = 30;

-- Casiano casas · Picada · $2.200 → $1.700
UPDATE "ProductoLocal" SET "precio_venta" = 1700, "margen" = 0, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14348 AND "precio_venta" = 2200 AND "margen" = 30;

-- mini el 7 · Dover suelto · $100 sin cambio, el margen vuelve a vacío
UPDATE "ProductoLocal" SET "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 13948 AND "precio_venta" = 100 AND "margen" = 133;

-- Minimarket ayala · 361 x2 · $3.500 sin cambio, el margen vuelve a vacío
UPDATE "ProductoLocal" SET "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15070 AND "precio_venta" = 3500 AND "margen" = 134;

-- Minimarket ayala · combo pancho · $3.921,67 → $3.100
UPDATE "ProductoLocal" SET "precio_venta" = 3100, "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15055 AND "precio_venta" = 3921.67 AND "margen" = 30;

-- Minimarket ayala · dover suelto · $114,40 → $100
UPDATE "ProductoLocal" SET "precio_venta" = 100, "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14952 AND "precio_venta" = 114.40 AND "margen" = 30;

-- Minimarket ayala · FULBITO X2 · $500 sin cambio, el margen vuelve a vacío
UPDATE "ProductoLocal" SET "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15316 AND "precio_venta" = 500 AND "margen" = 120;

-- Minimarket ayala · HAMBUR XL PANES X10 · $8.500 sin cambio, el margen vuelve a vacío
UPDATE "ProductoLocal" SET "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15091 AND "precio_venta" = 8500 AND "margen" = 31;

-- Minimarket ayala · HAMBUR XL PANES X6 · $5.100 sin cambio, el margen vuelve a vacío
UPDATE "ProductoLocal" SET "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15090 AND "precio_venta" = 5100 AND "margen" = 31;

-- Minimarket ayala · quilmes x2 · $7.366,66 → $6.000
UPDATE "ProductoLocal" SET "precio_venta" = 6000, "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 14951 AND "precio_venta" = 7366.66 AND "margen" = 30;

-- Minimarket ayala · QUIÑLMES · $7.366,66 → $6.000
UPDATE "ProductoLocal" SET "precio_venta" = 6000, "margen" = NULL, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "id" = 15388 AND "precio_venta" = 7366.66 AND "margen" = 30;
