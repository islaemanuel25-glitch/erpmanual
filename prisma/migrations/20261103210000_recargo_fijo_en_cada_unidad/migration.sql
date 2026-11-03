-- EL RECARGO FIJO POR UNIDAD SE SUMA A CADA UNIDAD, NO UNA VEZ AL BULTO.
--
-- Defecto visto por Emanuel el 2026-11-03 en Casiano casas: cartón de 10,
-- costo del bulto $40.260 (unitario $4.026), regla "Recargo fijo por unidad"
-- de $300. Tiene que dar 4.026 + 300 = 4.326 por unidad —con el redondeo a 100
-- de la ficha, 4.400—, o sea $44.000 el bulto. Estaba en $41.000: los $300
-- sumados una sola vez al bulto (40.260 + 300 = 40.560, redondeado por unidad).
--
-- ── DE DÓNDE SALIÓ ────────────────────────────────────────────────────────
--
-- 20261030220000_precios_bajo_su_regla había llevado esas filas a $44.000, con
-- la cuenta bien hecha (precioDesdeRecargoUnidad). 20261103120000_precios_del_30_10
-- _vuelven_a_su_regla trató toda esa migración como "filas que ya tenían %" y
-- las devolvió a su valor previo, $41.000 —sin mirar que la regla de esas filas
-- no era un porcentaje sino el recargo fijo—. Esas son las filas "de la
-- migración de hoy".
--
-- Además se buscan las que tienen HOY un precio que es exactamente el de la
-- cuenta equivocada —recargo sumado una vez al bulto, con el redondeo sobre el
-- bulto o sobre el unitario— aunque no las haya tocado esa migración: son las
-- "del cálculo normal".
--
-- ── LA CUENTA ─────────────────────────────────────────────────────────────
--
-- La de lib/precios/recargoFijoUnidad.js (precioDesdeRecargoUnidad), que es la
-- única del sistema: (costo del bulto ÷ unidades, a centavos) + recargo, el
-- redondeo a 100 de la ficha sobre ESE unitario, × unidades. El candado
-- scripts/correcciones/recargoFijoEnCadaUnidad.test.mjs comprueba contra
-- Postgres que este SQL da lo mismo que esa función.
--
-- ── LO QUE NO SE TOCA ─────────────────────────────────────────────────────
--
--   · Coca-Cola (proveedor 19), combos y promociones: se listan, no se tocan.
--   · Una fila cuyo producto tiene una edición MANUAL de precio, margen o regla
--     en la bitácora posterior a la escritura equivocada —para las de hoy,
--     posterior a que terminó la migración de hoy; para las del cálculo normal,
--     que la última escritura de precio del producto haya sido de una persona—.
--     Se lista con la fecha. Recibir una compra y aplicar una lista son
--     automáticas y no cuentan (mismo criterio que la migración de hoy).
--   · NUNCA BAJA UN PRECIO: si la cuenta correcta da menos que el de hoy, se
--     lista como "no se bajó".
--   · Los productos sueltos (unidades = 1): ahí unidad y bulto son lo mismo y
--     las dos cuentas dan igual. No entran.
--
-- ── SEGURIDAD E IDEMPOTENCIA ──────────────────────────────────────────────
--
-- El estado de antes, de todas las filas con recargo fijo, queda en
-- respaldo.backup_recargo_unidad_20261103 (la primera corrida; una segunda no
-- lo pisa). Cada fila decidida queda en respaldo.recargo_unidad_20261103_resultado
-- y una segunda corrida no la vuelve a decidir. La escritura exige que la fila
-- siga con el precio, el costo, la regla y el recargo con que se decidió.
--
-- ── EL INFORME ───────────────────────────────────────────────────────────
--
-- Sale por NOTICE al final. Prisma no lo muestra; se vuelve a leer, en solo
-- lectura, con:
--   SELECT origen, resultado, COUNT(*), COUNT(*) FILTER (WHERE aplicada)
--     FROM respaldo.recargo_unidad_20261103_resultado GROUP BY 1, 2 ORDER BY 1, 2;
--   SELECT ubicacion, producto, precio_antes, precio_correcto, motivo
--     FROM respaldo.recargo_unidad_20261103_resultado WHERE resultado <> 'CORREGIDA'
--    ORDER BY resultado, ubicacion, producto;

CREATE SCHEMA IF NOT EXISTS respaldo;

CREATE TABLE IF NOT EXISTS respaldo.backup_recargo_unidad_20261103 AS
SELECT pl."id", pl."localId", pl."baseId", pl."precio_costo", pl."precio_venta", pl."margen",
       pl."reglaPrecio", pl."recargoFijoUnidad",
       b."precio_costo" AS base_precio_costo, b."precio_venta" AS base_precio_venta, b."margen" AS base_margen,
       CURRENT_TIMESTAMP AS respaldado_en
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
 WHERE pl."reglaPrecio" = 'RECARGO_FIJO_UNIDAD';

CREATE TABLE IF NOT EXISTS respaldo.recargo_unidad_20261103_resultado (
  id              integer PRIMARY KEY,
  base_id         integer NOT NULL,
  origen          text    NOT NULL,
  resultado       text    NOT NULL,
  motivo          text    NOT NULL,
  producto        text,
  ubicacion       text,
  es_deposito     boolean NOT NULL DEFAULT false,
  costo           numeric(12,2),
  costo_fila      numeric(12,2),
  unidades        integer,
  recargo         numeric(12,2),
  precio_antes    numeric(12,2),
  precio_correcto numeric(12,2),
  ficha_antes     numeric(12,2),
  editada_en      timestamp(3),
  aplicada        boolean NOT NULL DEFAULT false,
  ficha_aplicada  boolean NOT NULL DEFAULT false,
  decidida_en     timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- El corte de "posterior" para las filas de hoy: cuándo terminó la migración
-- de hoy, según _prisma_migrations. SQL dinámico porque la base sombra de
-- "prisma migrate dev" no tiene esa tabla. Falla cerrada más abajo.
CREATE TEMP TABLE _rec_corte (corte timestamp(3));
DO $$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    EXECUTE 'INSERT INTO _rec_corte SELECT MAX(finished_at) AT TIME ZONE ''UTC'' FROM "_prisma_migrations" WHERE migration_name = ''20261103120000_precios_del_30_10_vuelven_a_su_regla''';
  END IF;
END $$;

-- Las filas que la migración de hoy escribió con su valor previo y que van por
-- recargo fijo.
CREATE TEMP TABLE _rec_de_hoy AS
SELECT r.id
  FROM respaldo.reversion_20261030_resultado r
 WHERE r.tabla = 'ProductoLocal' AND r.aplicada
   AND r.regla_final = 'RECARGO_FIJO_UNIDAD'
   AND r.resultado IN ('REVERTIDA', 'NO_SE_BAJO', 'SIN_REGLA');

-- Cada fila con recargo fijo sobre un bulto, con la cuenta correcta y las dos
-- formas de la equivocada.
CREATE TEMP TABLE _rec_filas AS
SELECT pl."id", pl."baseId" AS base_id, pl."localId",
       COALESCE(NULLIF(TRIM(pl."nombre"), ''), b."nombre") AS producto, l."nombre" AS ubicacion,
       COALESCE(l."es_deposito", false) AS es_deposito,
       pl."precio_venta" AS precio_antes, pl."precio_costo" AS costo_fila,
       pl."recargoFijoUnidad" AS recargo, b."precio_venta" AS ficha_antes,
       k.costo, k.unidades, b."redondeo_100" AS redondeo,
       19 IN (b."proveedor_id", b."proveedor2_id", b."proveedor3_id") AS coca,
       (b."es_combo" OR EXISTS (SELECT 1 FROM "ComboComponente" cc WHERE cc."comboProductoLocalId" = pl."id")) AS combo,
       (COALESCE(pl."nombre", '') || ' ' || COALESCE(b."nombre", '')) ~* '(PROMO|OFERTA|MAS PANES)' AS promo,
       EXISTS (SELECT 1 FROM _rec_de_hoy h WHERE h.id = pl."id") AS de_hoy
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
  LEFT JOIN "Local" l ON l."id" = pl."localId"
  CROSS JOIN LATERAL (
    SELECT CASE WHEN pl."precio_costo" IS NOT NULL AND pl."precio_costo" <> 0 THEN pl."precio_costo" ELSE b."precio_costo" END AS costo,
           CASE WHEN b."unidad_medida"::text IN ('pack', 'cajon') AND b."factor_pack" > 1 THEN b."factor_pack" ELSE 1 END AS unidades
  ) k
 WHERE pl."activo"
   AND pl."reglaPrecio" = 'RECARGO_FIJO_UNIDAD'
   AND pl."recargoFijoUnidad" >= 0
   AND k.unidades > 1
   AND k.costo > 0
   AND NOT EXISTS (SELECT 1 FROM respaldo.recargo_unidad_20261103_resultado x WHERE x.id = pl."id");

ALTER TABLE _rec_filas ADD COLUMN correcto numeric(12,2);
ALTER TABLE _rec_filas ADD COLUMN equivocado_bulto numeric(12,2);
ALTER TABLE _rec_filas ADD COLUMN equivocado_unidad numeric(12,2);
-- correcto: (costo ÷ unidades + recargo), redondeo sobre el unitario, × unidades.
-- equivocado_bulto: costo + recargo una vez, redondeo sobre el bulto.
-- equivocado_unidad: costo + recargo una vez, redondeo sobre el unitario (el de Casiano).
UPDATE _rec_filas SET
  correcto = ROUND(unidades * CASE WHEN redondeo THEN CEIL(ROUND(ROUND(costo / unidades, 2) + recargo, 2) / 100) * 100
                                   ELSE ROUND(ROUND(costo / unidades, 2) + recargo, 2) END, 2),
  equivocado_bulto = CASE WHEN redondeo THEN CEIL(ROUND(costo + recargo, 2) / 100) * 100
                          ELSE ROUND(costo + recargo, 2) END,
  equivocado_unidad = ROUND(unidades * CASE WHEN redondeo THEN CEIL(ROUND((costo + recargo) / unidades, 2) / 100) * 100
                                            ELSE ROUND((costo + recargo) / unidades, 2) END, 2);

-- En juego: las de hoy, y las que tienen hoy exactamente la cuenta equivocada.
-- Las que ya tienen el precio correcto no entran.
DELETE FROM _rec_filas
 WHERE precio_antes IS NOT DISTINCT FROM correcto
    OR NOT (de_hoy OR precio_antes IN (equivocado_bulto, equivocado_unidad));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _rec_corte WHERE corte IS NOT NULL)
     AND EXISTS (SELECT 1 FROM _rec_filas WHERE de_hoy) THEN
    RAISE EXCEPTION 'No se sabe cuándo terminó 20261103120000_precios_del_30_10_vuelven_a_su_regla: sin eso no se puede separar una edición posterior.';
  END IF;
END $$;

-- ── LA BITÁCORA ─────────────────────────────────────────────────────────────
-- Por producto (la bitácora no guarda la ubicación; es el lado seguro), la
-- última escritura MANUAL de precio, margen o regla, y la última AUTOMÁTICA.
-- Automáticas: la recepción de una compra (su fila trae "Pedido" o
-- "Comprobante") y la aplicación de una lista (la fila de la lista guarda
-- quién y cuándo). Mismo criterio que 20261103120000.
CREATE TEMP TABLE _rec_bitacora AS
SELECT (c->>'id')::int AS base_id,
       MAX(a."createdAt") FILTER (WHERE NOT x.automatica) AS manual_en,
       MAX(a."createdAt") FILTER (WHERE x.automatica) AS automatica_en
  FROM "AuditoriaBitacora" a
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a."cambios"::jsonb) = 'array' THEN a."cambios"::jsonb ELSE '[]'::jsonb END) c
  CROSS JOIN LATERAL (
    SELECT (EXISTS (SELECT 1 FROM jsonb_array_elements(a."cambios"::jsonb) p WHERE p->>'entidad' IN ('Pedido', 'Comprobante'))
            OR EXISTS (
              SELECT 1 FROM "ImportacionListaFila" f
               WHERE f."productoBaseId" = (c->>'id')::int AND f."aplicada" AND f."aplicadaEn" IS NOT NULL
                 AND f."aplicadaPorUsuarioId" IS NOT DISTINCT FROM a."usuarioId"
                 AND a."createdAt" >= f."aplicadaEn"
                 AND a."createdAt" <= f."aplicadaEn" + interval '10 minutes')) AS automatica
  ) x
 WHERE c->>'entidad' = 'Producto'
   AND (c->>'id') ~ '^[0-9]+$'
   AND (c->>'id')::int IN (SELECT base_id FROM _rec_filas)
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c->'campos') = 'array' THEN c->'campos' ELSE '[]'::jsonb END) k
      WHERE k->>'label' IN ('Precio de venta', 'Margen', 'Regla Precio', 'Recargo Fijo Unidad'))
 GROUP BY 1;

-- ── LA DECISIÓN ─────────────────────────────────────────────────────────────
INSERT INTO respaldo.recargo_unidad_20261103_resultado
  (id, base_id, origen, resultado, motivo, producto, ubicacion, es_deposito, costo, costo_fila, unidades, recargo,
   precio_antes, precio_correcto, ficha_antes, editada_en)
SELECT f."id", f.base_id,
       CASE WHEN f.de_hoy THEN 'migracion_de_hoy' ELSE 'calculo_normal' END,
       d.resultado, d.motivo, f.producto, f.ubicacion, f.es_deposito, f.costo, f.costo_fila, f.unidades, f.recargo,
       f.precio_antes, f.correcto, f.ficha_antes, e.editada_en
  FROM _rec_filas f
  LEFT JOIN _rec_bitacora bt ON bt.base_id = f.base_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN f.de_hoy AND bt.manual_en > (SELECT MAX(corte) FROM _rec_corte) THEN bt.manual_en
      WHEN NOT f.de_hoy AND bt.manual_en IS NOT NULL AND bt.manual_en >= COALESCE(bt.automatica_en, '-infinity'::timestamp) THEN bt.manual_en
    END AS editada_en
  ) e
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN f.coca THEN 'EXCLUIDA'
      WHEN f.combo THEN 'EXCLUIDA'
      WHEN f.promo THEN 'EXCLUIDA'
      WHEN e.editada_en IS NOT NULL THEN 'SALTEADA'
      WHEN f.correcto < COALESCE(f.precio_antes, 0) THEN 'NO_SE_BAJO'
      ELSE 'CORREGIDA' END AS resultado,
    CASE
      WHEN f.coca THEN 'Coca-Cola: precio fijado por la empresa'
      WHEN f.combo THEN 'combo'
      WHEN f.promo THEN 'promoción'
      WHEN e.editada_en IS NOT NULL THEN 'editada a mano el ' || to_char((e.editada_en AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD HH24:MI')
      WHEN f.correcto < COALESCE(f.precio_antes, 0) THEN 'no se bajó: la cuenta correcta da ' || f.correcto::text
      ELSE '+$' || f.recargo::text || ' por unidad × ' || f.unidades::text || ' unidades' END AS motivo
  ) d
ON CONFLICT (id) DO NOTHING;

-- ── LA ESCRITURA ────────────────────────────────────────────────────────────
-- Vuelve a exigir el valor de hoy: una fila que no sigue igual no se escribe.
WITH escritas AS (
  UPDATE "ProductoLocal" pl
     SET "precio_venta" = r.precio_correcto, "updatedAt" = CURRENT_TIMESTAMP
    FROM respaldo.recargo_unidad_20261103_resultado r
   WHERE r.id = pl."id" AND NOT r.aplicada AND r.resultado = 'CORREGIDA'
     AND pl."precio_venta" IS NOT DISTINCT FROM r.precio_antes
     AND pl."precio_costo" IS NOT DISTINCT FROM r.costo_fila
     AND pl."reglaPrecio" = 'RECARGO_FIJO_UNIDAD'
     AND pl."recargoFijoUnidad" IS NOT DISTINCT FROM r.recargo
  RETURNING pl."id"
)
UPDATE respaldo.recargo_unidad_20261103_resultado r SET aplicada = true
  FROM escritas w WHERE r.id = w."id";

-- La ficha del depósito sigue a su fila del depósito, si estaba alineada con ella.
WITH escritas AS (
  UPDATE "ProductoBase" b
     SET "precio_venta" = r.precio_correcto, "updatedAt" = CURRENT_TIMESTAMP
    FROM respaldo.recargo_unidad_20261103_resultado r
   WHERE r.base_id = b."id" AND r.aplicada AND NOT r.ficha_aplicada AND r.es_deposito
     AND b."precio_venta" IS NOT DISTINCT FROM r.ficha_antes
     AND r.ficha_antes IS NOT DISTINCT FROM r.precio_antes
  RETURNING r.id
)
UPDATE respaldo.recargo_unidad_20261103_resultado r SET ficha_aplicada = true
  FROM escritas w WHERE r.id = w.id;

DROP TABLE _rec_bitacora;
DROP TABLE _rec_filas;
DROP TABLE _rec_de_hoy;
DROP TABLE _rec_corte;

-- ── EL INFORME ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  f record;
BEGIN
  SELECT COUNT(*) FILTER (WHERE aplicada) AS corregidas,
         COUNT(*) FILTER (WHERE aplicada AND origen = 'migracion_de_hoy') AS de_hoy,
         COUNT(*) FILTER (WHERE aplicada AND origen = 'calculo_normal') AS normal,
         COUNT(*) FILTER (WHERE ficha_aplicada) AS fichas,
         COUNT(*) FILTER (WHERE resultado = 'SALTEADA') AS a_mano,
         COUNT(*) FILTER (WHERE resultado = 'NO_SE_BAJO') AS no_baja,
         COUNT(*) FILTER (WHERE resultado = 'EXCLUIDA') AS excluidas
    INTO f FROM respaldo.recargo_unidad_20261103_resultado;
  RAISE NOTICE 'Recargo fijo por unidad: % filas corregidas (% de la migración de hoy, % del cálculo normal), % fichas del depósito',
    f.corregidas, f.de_hoy, f.normal, f.fichas;
  RAISE NOTICE 'Salteadas por edición manual: %, no se bajaron: %, excluidas (Coca-Cola, combos, promociones): %',
    f.a_mano, f.no_baja, f.excluidas;
  RAISE NOTICE 'Corregidas:';
  FOR f IN SELECT * FROM respaldo.recargo_unidad_20261103_resultado WHERE aplicada ORDER BY ubicacion, producto
  LOOP
    RAISE NOTICE '  % · % · % → % (%, %)', f.ubicacion, f.producto, f.precio_antes, f.precio_correcto, f.motivo, f.origen;
  END LOOP;
  RAISE NOTICE 'Salteadas por edición manual (para revisar):';
  FOR f IN SELECT * FROM respaldo.recargo_unidad_20261103_resultado WHERE resultado = 'SALTEADA' ORDER BY ubicacion, producto
  LOOP
    RAISE NOTICE '  % · % · hoy %, correcto % (%)', f.ubicacion, f.producto, f.precio_antes, f.precio_correcto, f.motivo;
  END LOOP;
  RAISE NOTICE 'No se bajaron / excluidas:';
  FOR f IN SELECT * FROM respaldo.recargo_unidad_20261103_resultado WHERE resultado IN ('NO_SE_BAJO', 'EXCLUIDA') ORDER BY resultado, ubicacion, producto
  LOOP
    RAISE NOTICE '  % · % · hoy %, correcto % (%)', f.ubicacion, f.producto, f.precio_antes, f.precio_correcto, f.motivo;
  END LOOP;
END $$;
