// ARMA LA MIGRACIÓN QUE CORRIGE LAS DOS CORRECCIONES DE PRECIOS DEL 2026-10-30.
//
//   node scripts/correcciones/generarReversionPrecios20261030.mjs
//
// NO toca la base y no necesita datos de producción. Lee las tres migraciones
// del 30/10 que están en el repo y escribe la nueva migración: la lista exacta de
// lo que cada corrección PUSO —tabla, fila, precio, margen, regla— más el SQL
// que decide, fila por fila, en el momento de aplicarse. Correrlo dos veces
// escribe el mismo archivo.
//
// ── POR QUÉ LA LISTA SALE DE LOS ARCHIVOS Y NO DE LOS RESPALDOS ───────────
//
// Entre la primera corrección (18:33) y la segunda (19:33) pasó una hora con los
// locales vendiendo. Comparar un respaldo contra el siguiente mezclaría lo que
// puso la migración con lo que alguien editó en esa hora. Los UPDATE escritos en
// los archivos son exactamente lo que cada una puso, y producción confirmó que
// se aplicaron todos (docs/deploy/MIGRACIONES-SIN-APLICAR.md).
//
// ── LA REGLA DE NEGOCIO (Emanuel, 2026-11-03) ─────────────────────────────
//
// Solo había que arreglar las filas que NO tenían %. Las que ya lo tenían no se
// tocan nunca. Lo que decide cada fila está escrito en el SQL de abajo, con su
// porqué al lado, para que la migración se lea sola en el despliegue.

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const MIGRACIONES = path.join(RAIZ, "prisma/migrations");

export const MIGRACION_A = "20261030220000_precios_bajo_su_regla";
export const MIGRACION_B = "20261030230000_precios_sin_regla";
export const MIGRACION_C = "20261030235000_promociones_vuelven";
export const MIGRACION_NUEVA = "20261103120000_precios_del_30_10_vuelven_a_su_regla";

/** El proveedor cuyos productos tienen precio y % fijados por la empresa. */
export const PROVEEDOR_COCA_COLA = 19;

const UPDATE = /^UPDATE "(ProductoLocal|ProductoBase)" SET (.*?), "updatedAt" = CURRENT_TIMESTAMP\n WHERE "id" = (\d+)/gm;

/**
 * Lo que PUSO una migración: un objeto por UPDATE. Una ficha del depósito queda
 * ligada a la fila del depósito cuyo UPDATE la precede, que es como la escribió
 * el generador de entonces (alinear la ficha con la fila, `editarBase`).
 */
export function loQuePuso(texto) {
  const salida = [];
  let ultimaFila = null;
  for (const m of texto.matchAll(UPDATE)) {
    const [, tabla, sets, id] = m;
    const precio = sets.match(/"precio_venta" = (-?[\d.]+)/);
    const margen = sets.match(/"margen" = (-?[\d.]+)/);
    const regla = sets.match(/"reglaPrecio" = '(\w+)'/);
    if (regla && regla[1] !== "MARGEN_PORCENTUAL") throw new Error(`regla inesperada en ${tabla} ${id}: ${regla[1]}`);
    const fila = {
      tabla,
      id: Number(id),
      filaDeposito: tabla === "ProductoBase" ? ultimaFila : null,
      precio: precio ? precio[1] : null,
      margen: margen ? margen[1] : null,
      poneRegla: Boolean(regla),
    };
    if (tabla === "ProductoBase" && ultimaFila === null) throw new Error(`ficha ${id} sin fila del depósito antes`);
    if (tabla === "ProductoLocal") ultimaFila = fila.id;
    salida.push(fila);
  }
  return salida;
}

/** Las filas que la tercera migración ya devolvió. */
export function combosDevueltos(texto) {
  return [...texto.matchAll(UPDATE)].map((m) => Number(m[3]));
}

const leer = (d) => fs.readFileSync(path.join(MIGRACIONES, d, "migration.sql"), "utf8");

export function armarMigracion() {
  const a = loQuePuso(leer(MIGRACION_A));
  const b = loQuePuso(leer(MIGRACION_B));
  const c = new Set(combosDevueltos(leer(MIGRACION_C)));
  const clave = (f) => `${f.tabla}:${f.id}`;
  const enA = new Set(a.map(clave));
  for (const f of b) if (enA.has(clave(f))) throw new Error(`${clave(f)} está en las dos correcciones`);
  for (const id of c) if (!b.some((f) => f.tabla === "ProductoLocal" && f.id === id)) throw new Error(`combo ${id} no está en la segunda`);

  const v = (x) => (x === null ? "NULL" : x);
  const valores = [
    ...a.map((f) => ["bajo_su_regla", f]),
    ...b.map((f) => ["sin_regla", f]),
  ].map(([mig, f]) =>
    `('${mig}', '${f.tabla}', ${f.id}, ${v(f.filaDeposito)}, ${f.precio !== null}, ${v(f.precio)}, ` +
    `${f.margen !== null}, ${v(f.margen)}, ${f.poneRegla}, ${f.tabla === "ProductoLocal" && c.has(f.id)})`
  );

  const cuenta = (l, t) => l.filter((f) => f.tabla === t).length;
  const resumen = {
    bajoSuReglaFilas: cuenta(a, "ProductoLocal"),
    bajoSuReglaFichas: cuenta(a, "ProductoBase"),
    sinReglaFilas: cuenta(b, "ProductoLocal"),
    sinReglaFichas: cuenta(b, "ProductoBase"),
    combosYaDevueltos: c.size,
  };
  return { sql: cabecera(resumen) + valores.join(",\n") + "\nON CONFLICT DO NOTHING;\n" + CUERPO, resumen };
}

const cabecera = (r) => `-- LAS DOS CORRECCIONES DE PRECIOS DEL 30/10 SE CORRIGEN: SOLO CAMBIA LO QUE NO TENÍA %.
--
-- Pedido de Emanuel del 2026-11-03, sobre la medición en solo lectura del mismo
-- día. Regla de negocio: solo había que arreglar las filas de precio por
-- ubicación que NO tenían % definido. Las que ya lo tenían no se tocan nunca.
-- Generada por scripts/correcciones/generarReversionPrecios20261030.mjs a partir
-- de las tres migraciones del 30/10; candado en
-- scripts/correcciones/reversionPrecios20261030.test.mjs, contra Postgres.
--
-- ── QUÉ HACE ───────────────────────────────────────────────────────────────
--
--   · ${MIGRACION_A} (${r.bajoSuReglaFilas} filas, ${r.bajoSuReglaFichas} fichas):
--     tocó filas que YA TENÍAN %. Vuelven TODAS a su valor previo, desde
--     respaldo.backup_precios_ubicacion_20261030.
--   · ${MIGRACION_B} (${r.sinReglaFilas} filas, ${r.sinReglaFichas} fichas):
--     les puso 30 % parejo. Coca-Cola (proveedor ${PROVEEDOR_COCA_COLA}), combos y
--     promociones vuelven a su valor previo (respaldo..._20261030_b). El resto se
--     recalcula con la regla PROPIA del producto: la de la fila, la de la ficha o
--     la de otra ubicación, en ese orden. Sin regla en ningún lado no se inventa:
--     vuelve a su valor previo y se lista.
--   · NUNCA BAJA UN PRECIO (Emanuel, 2026-11-03): si la regla propia da menos
--     que el precio previo a la corrección, la fila vuelve entera a su valor
--     previo y se lista como "no se bajó".
--   · Los ${r.combosYaDevueltos} combos que devolvió ${MIGRACION_C} no se tocan.
--   · La ficha del depósito sigue a su fila del depósito, como se alineó entonces.
--
-- ── SEGURIDAD ─────────────────────────────────────────────────────────────
--
-- Una fila se toca solo si HOY tiene exactamente el precio, el margen, la regla
-- y el monto fijo que dejó la corrección. Si alguien —o un recálculo por costo—
-- la cambió después, no se toca y se lista como salteada.
--
-- ── IDEMPOTENTE ──────────────────────────────────────────────────────────
--
-- Cada fila decidida queda en respaldo.reversion_20261030_resultado; una
-- segunda corrida no decide ni escribe nada. Los respaldos del 30/10 no se
-- borran, y el estado de antes de esta corrida queda en
-- respaldo.backup_precios_ubicacion_20261103.
--
-- ── EL INFORME ───────────────────────────────────────────────────────────
--
-- Sale por NOTICE al final, y se puede volver a leer en solo lectura con
--   node scripts/correcciones/generarReversionPrecios20261030.mjs --informe | psql "<url>" -X

CREATE SCHEMA IF NOT EXISTS respaldo;

CREATE TABLE IF NOT EXISTS respaldo.backup_precios_ubicacion_20261103 AS
SELECT pl."id", pl."localId", pl."baseId", pl."precio_costo", pl."precio_venta", pl."margen",
       pl."reglaPrecio", pl."recargoFijoUnidad",
       b."precio_costo" AS base_precio_costo, b."precio_venta" AS base_precio_venta, b."margen" AS base_margen,
       CURRENT_TIMESTAMP AS respaldado_en
  FROM "ProductoLocal" pl
  JOIN "ProductoBase" b ON b."id" = pl."baseId"
 WHERE pl."activo";

-- Lo que PUSO cada corrección, sacado de sus UPDATE. precio/margen en NULL con
-- pone_* en false: esa corrección no tocó ese campo.
CREATE TABLE IF NOT EXISTS respaldo.reversion_20261030_objetivo (
  migracion         text    NOT NULL,
  tabla             text    NOT NULL,
  id                integer NOT NULL,
  fila_deposito     integer,
  pone_precio       boolean NOT NULL,
  precio_puesto     numeric(12,2),
  pone_margen       boolean NOT NULL,
  margen_puesto     numeric(6,2),
  pone_regla        boolean NOT NULL,
  combo_ya_devuelto boolean NOT NULL,
  PRIMARY KEY (tabla, id)
);

CREATE TABLE IF NOT EXISTS respaldo.reversion_20261030_resultado (
  tabla        text    NOT NULL,
  id           integer NOT NULL,
  migracion    text    NOT NULL,
  resultado    text    NOT NULL,
  motivo       text    NOT NULL,
  producto     text,
  ubicacion    text,
  precio_antes numeric(12,2),
  margen_antes numeric(6,2),
  regla_antes  text,
  recargo_antes numeric(12,2),
  precio_final numeric(12,2),
  margen_final numeric(6,2),
  regla_final  text,
  recargo_final numeric(12,2),
  precio_previo numeric(12,2),
  aplicada     boolean NOT NULL DEFAULT false,
  decidida_en  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tabla, id)
);

INSERT INTO respaldo.reversion_20261030_objetivo
  (migracion, tabla, id, fila_deposito, pone_precio, precio_puesto, pone_margen, margen_puesto, pone_regla, combo_ya_devuelto)
VALUES
`;

// ── LA DECISIÓN, FILA POR FILA ──────────────────────────────────────────────
//
// `antes` es lo que la fila tiene HOY; `previo` es lo del respaldo de la
// corrección que la tocó; `puesto` es lo que esa corrección dejó (lo que puso, y
// lo previo en los campos que no tocó). `intacta` = hoy sigue siendo `puesto`.
//
// La FUENTE de regla de cualquier fila es lo que decidió una persona: el valor
// previo si la fila sigue con lo que puso una corrección, y el de hoy si no. Así
// el 30 % que inventó la corrección nunca cuenta como regla de nadie.
//
// Las cuentas son las de lib/precios: precioDesdeMargen (costo × (1 + m/100),
// redondeo a 100 siempre hacia arriba si la ficha redondea) y
// precioDesdeRecargoUnidad (costo unitario a dos decimales + monto, redondeo
// sobre el unitario, × factor del bulto). El candado las compara contra esas
// funciones.
const CUERPO = `
CREATE TEMP TABLE _rev_estado AS
WITH previo_pl AS (
  SELECT o.id, r."precio_venta" AS precio, r."margen", r."reglaPrecio"::text AS regla, r."recargoFijoUnidad" AS recargo
    FROM respaldo.reversion_20261030_objetivo o
    JOIN respaldo.backup_precios_ubicacion_20261030 r ON r."id" = o.id
   WHERE o.tabla = 'ProductoLocal' AND o.migracion = 'bajo_su_regla'
  UNION ALL
  SELECT o.id, r."precio_venta", r."margen", r."reglaPrecio"::text, r."recargoFijoUnidad"
    FROM respaldo.reversion_20261030_objetivo o
    JOIN respaldo.backup_precios_ubicacion_20261030_b r ON r."id" = o.id
   WHERE o.tabla = 'ProductoLocal' AND o.migracion = 'sin_regla'
),
previo_pb AS (
  SELECT o.id,
         (SELECT r.base_precio_venta FROM respaldo.backup_precios_ubicacion_20261030 r WHERE r."baseId" = o.id ORDER BY r."id" LIMIT 1) AS precio,
         (SELECT r.base_margen FROM respaldo.backup_precios_ubicacion_20261030 r WHERE r."baseId" = o.id ORDER BY r."id" LIMIT 1) AS margen,
         EXISTS (SELECT 1 FROM respaldo.backup_precios_ubicacion_20261030 r WHERE r."baseId" = o.id) AS hay
    FROM respaldo.reversion_20261030_objetivo o
   WHERE o.tabla = 'ProductoBase' AND o.migracion = 'bajo_su_regla'
  UNION ALL
  SELECT o.id,
         (SELECT r.base_precio_venta FROM respaldo.backup_precios_ubicacion_20261030_b r WHERE r."baseId" = o.id ORDER BY r."id" LIMIT 1),
         (SELECT r.base_margen FROM respaldo.backup_precios_ubicacion_20261030_b r WHERE r."baseId" = o.id ORDER BY r."id" LIMIT 1),
         EXISTS (SELECT 1 FROM respaldo.backup_precios_ubicacion_20261030_b r WHERE r."baseId" = o.id)
    FROM respaldo.reversion_20261030_objetivo o
   WHERE o.tabla = 'ProductoBase' AND o.migracion = 'sin_regla'
)
SELECT o.*,
       pl."localId", COALESCE(pl."baseId", o.id) AS base_id,
       pl."precio_venta" AS antes_precio, pl."margen" AS antes_margen,
       pl."reglaPrecio"::text AS antes_regla, pl."recargoFijoUnidad" AS antes_recargo,
       pv.precio AS previo_precio, pv.margen AS previo_margen, pv.regla AS previo_regla, pv.recargo AS previo_recargo,
       (pl."id" IS NOT NULL AND pv.id IS NOT NULL) AS hay
  FROM respaldo.reversion_20261030_objetivo o
  LEFT JOIN "ProductoLocal" pl ON pl."id" = o.id
  LEFT JOIN previo_pl pv ON pv.id = o.id
 WHERE o.tabla = 'ProductoLocal'
UNION ALL
SELECT o.*,
       NULL, o.id,
       b."precio_venta", b."margen", NULL, NULL,
       pv.precio, pv.margen, NULL, NULL,
       (b."id" IS NOT NULL AND pv.hay)
  FROM respaldo.reversion_20261030_objetivo o
  LEFT JOIN "ProductoBase" b ON b."id" = o.id
  LEFT JOIN previo_pb pv ON pv.id = o.id
 WHERE o.tabla = 'ProductoBase';

ALTER TABLE _rev_estado ADD COLUMN intacta boolean;
UPDATE _rev_estado SET intacta = hay
   AND antes_precio  IS NOT DISTINCT FROM (CASE WHEN pone_precio THEN precio_puesto ELSE previo_precio END)
   AND antes_margen  IS NOT DISTINCT FROM (CASE WHEN pone_margen THEN margen_puesto ELSE previo_margen END)
   AND antes_regla   IS NOT DISTINCT FROM (CASE WHEN pone_regla THEN 'MARGEN_PORCENTUAL' ELSE previo_regla END)
   AND antes_recargo IS NOT DISTINCT FROM previo_recargo;

-- La regla que decidió una persona, para cada fila por ubicación de los
-- productos en juego.
CREATE TEMP TABLE _rev_fuente AS
SELECT p."id", p."baseId", p."localId", x.tipo, x.valor
  FROM "ProductoLocal" p
  LEFT JOIN _rev_estado e ON e.tabla = 'ProductoLocal' AND e.id = p."id" AND e.intacta
  CROSS JOIN LATERAL (
    SELECT CASE WHEN e.id IS NOT NULL THEN e.previo_margen  ELSE p."margen" END AS margen,
           CASE WHEN e.id IS NOT NULL THEN e.previo_regla   ELSE p."reglaPrecio"::text END AS regla,
           CASE WHEN e.id IS NOT NULL THEN e.previo_recargo ELSE p."recargoFijoUnidad" END AS recargo
  ) f
  CROSS JOIN LATERAL (
    SELECT CASE WHEN f.regla = 'RECARGO_FIJO_UNIDAD' AND f.recargo >= 0 THEN 'RECARGO'
                WHEN f.margen > 0 THEN 'PORCENTAJE' END AS tipo,
           CASE WHEN f.regla = 'RECARGO_FIJO_UNIDAD' AND f.recargo >= 0 THEN f.recargo
                WHEN f.margen > 0 THEN f.margen END AS valor
  ) x
 WHERE p."activo"
   AND p."baseId" IN (SELECT base_id FROM _rev_estado WHERE tabla = 'ProductoLocal');

-- ── LAS FILAS POR UBICACIÓN ─────────────────────────────────────────────────
INSERT INTO respaldo.reversion_20261030_resultado
  (tabla, id, migracion, resultado, motivo, producto, ubicacion,
   precio_antes, margen_antes, regla_antes, recargo_antes,
   precio_final, margen_final, regla_final, recargo_final, precio_previo)
SELECT 'ProductoLocal', e.id, e.migracion, d.resultado, d.motivo,
       COALESCE(NULLIF(TRIM(pl."nombre"), ''), b."nombre"), l."nombre",
       e.antes_precio, e.antes_margen, e.antes_regla, e.antes_recargo,
       CASE d.resultado WHEN 'RECALCULADA' THEN c.precio WHEN 'REVERTIDA' THEN e.previo_precio WHEN 'SIN_REGLA' THEN e.previo_precio WHEN 'NO_SE_BAJO' THEN e.previo_precio ELSE e.antes_precio END,
       CASE d.resultado WHEN 'RECALCULADA' THEN (CASE WHEN r.tipo = 'PORCENTAJE' THEN r.valor ELSE e.previo_margen END)
                        WHEN 'REVERTIDA' THEN e.previo_margen WHEN 'SIN_REGLA' THEN e.previo_margen WHEN 'NO_SE_BAJO' THEN e.previo_margen ELSE e.antes_margen END,
       CASE d.resultado WHEN 'RECALCULADA' THEN (CASE WHEN r.tipo = 'PORCENTAJE' THEN 'MARGEN_PORCENTUAL' ELSE 'RECARGO_FIJO_UNIDAD' END)
                        WHEN 'REVERTIDA' THEN e.previo_regla WHEN 'SIN_REGLA' THEN e.previo_regla WHEN 'NO_SE_BAJO' THEN e.previo_regla ELSE e.antes_regla END,
       CASE d.resultado WHEN 'RECALCULADA' THEN (CASE WHEN r.tipo = 'RECARGO' THEN r.valor ELSE e.previo_recargo END)
                        WHEN 'REVERTIDA' THEN e.previo_recargo WHEN 'SIN_REGLA' THEN e.previo_recargo WHEN 'NO_SE_BAJO' THEN e.previo_recargo ELSE e.antes_recargo END,
       e.previo_precio
  FROM _rev_estado e
  LEFT JOIN "ProductoLocal" pl ON pl."id" = e.id
  LEFT JOIN "ProductoBase" b ON b."id" = pl."baseId"
  LEFT JOIN "Local" l ON l."id" = pl."localId"
  CROSS JOIN LATERAL (
    SELECT ${PROVEEDOR_COCA_COLA} IN (b."proveedor_id", b."proveedor2_id", b."proveedor3_id") AS coca,
           (b."es_combo" OR EXISTS (SELECT 1 FROM "ComboComponente" cc WHERE cc."comboProductoLocalId" = e.id)) AS combo,
           (COALESCE(pl."nombre", '') || ' ' || COALESCE(b."nombre", '')) ~* '(PROMO|OFERTA|MAS PANES)' AS promo,
           CASE WHEN pl."precio_costo" IS NOT NULL AND pl."precio_costo" <> 0 THEN pl."precio_costo" ELSE b."precio_costo" END AS costo,
           CASE WHEN b."unidad_medida"::text IN ('pack', 'cajon') AND b."factor_pack" > 1 THEN b."factor_pack" ELSE 1 END AS factor
  ) k
  -- La regla propia: la de la fila; si no, la de la ficha; si no, la que más se
  -- repite en las otras ubicaciones del producto (empate: la ubicación de menor id).
  LEFT JOIN LATERAL (
    SELECT tipo, valor, origen FROM (
      SELECT 1 AS prio, f.tipo, f.valor, 'la de la fila' AS origen, 0::bigint AS n, 0 AS loc
        FROM _rev_fuente f WHERE f."id" = e.id AND f.tipo IS NOT NULL
      UNION ALL
      SELECT 2, 'PORCENTAJE', fm.margen, 'la de la ficha', 0, 0
        FROM (SELECT CASE WHEN eb.id IS NOT NULL THEN eb.previo_margen ELSE b."margen" END AS margen
                FROM (SELECT 1) uno
                LEFT JOIN _rev_estado eb ON eb.tabla = 'ProductoBase' AND eb.id = b."id" AND eb.intacta) fm
       WHERE fm.margen > 0
      UNION ALL
      SELECT 3, f.tipo, f.valor, 'la de otra ubicación', COUNT(*), MIN(f."localId")
        FROM _rev_fuente f WHERE f."baseId" = pl."baseId" AND f."id" <> e.id AND f.tipo IS NOT NULL
       GROUP BY f.tipo, f.valor
    ) x ORDER BY prio, n DESC, loc LIMIT 1
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT ROUND(CASE
      WHEN r.tipo = 'PORCENTAJE' THEN
        CASE WHEN b."redondeo_100" THEN CEIL(ROUND(k.costo * (1 + r.valor / 100), 2) / 100) * 100
             ELSE k.costo * (1 + r.valor / 100) END
      WHEN r.tipo = 'RECARGO' THEN
        k.factor * CASE WHEN b."redondeo_100" THEN CEIL(ROUND(ROUND(k.costo / k.factor, 2) + r.valor, 2) / 100) * 100
                        ELSE ROUND(ROUND(k.costo / k.factor, 2) + r.valor, 2) END
    END, 2) AS precio
  ) c ON true
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN e.combo_ya_devuelto THEN 'INTACTA'
      WHEN NOT e.hay THEN 'SALTEADA'
      WHEN NOT e.intacta THEN 'SALTEADA'
      WHEN e.migracion = 'bajo_su_regla' THEN 'REVERTIDA'
      WHEN k.coca OR k.combo OR k.promo THEN 'REVERTIDA'
      WHEN r.tipo IS NULL OR k.costo IS NULL OR k.costo <= 0 THEN 'SIN_REGLA'
      -- Nunca baja un precio (Emanuel, 2026-11-03: "nada peor que perder"). Se
      -- compara contra el precio previo a la corrección; si el recálculo da menos,
      -- la fila no se recalcula y vuelve entera a su valor previo.
      WHEN c.precio < COALESCE(e.previo_precio, 0) THEN 'NO_SE_BAJO'
      ELSE 'RECALCULADA' END AS resultado,
    CASE
      WHEN e.combo_ya_devuelto THEN 'combo ya devuelto por ${MIGRACION_C}'
      WHEN NOT e.hay THEN 'sin fila o sin respaldo'
      WHEN NOT e.intacta THEN 'editada después de la corrección'
      WHEN k.coca THEN 'Coca-Cola: precio y % fijados por la empresa'
      WHEN e.migracion = 'bajo_su_regla' THEN 'ya tenía %'
      WHEN k.combo THEN 'combo'
      WHEN k.promo THEN 'promoción'
      WHEN r.tipo IS NULL THEN 'sin regla en ningún lado'
      WHEN k.costo IS NULL OR k.costo <= 0 THEN 'sin costo para aplicar su regla'
      WHEN c.precio < COALESCE(e.previo_precio, 0) THEN 'no se bajó: su regla daba ' || c.precio::text
      ELSE (CASE WHEN r.tipo = 'PORCENTAJE' THEN r.valor::text || ' %' ELSE '+$' || r.valor::text || ' por unidad' END) || ', ' || r.origen
    END AS motivo
  ) d
 WHERE e.tabla = 'ProductoLocal'
   AND NOT EXISTS (SELECT 1 FROM respaldo.reversion_20261030_resultado x WHERE x.tabla = 'ProductoLocal' AND x.id = e.id);

-- ── LAS FICHAS DEL DEPÓSITO ─────────────────────────────────────────────────
-- Una ficha de la primera corrección vuelve a su valor previo. Una de la segunda
-- sigue a la fila del depósito con la que se alineó: si la fila se recalculó, la
-- ficha toma el mismo precio (y el margen, si la regla es de %); si la fila
-- volvió, vuelve; si la fila no se tocó, la ficha tampoco.
INSERT INTO respaldo.reversion_20261030_resultado
  (tabla, id, migracion, resultado, motivo, producto, ubicacion,
   precio_antes, margen_antes, precio_final, margen_final, precio_previo)
SELECT 'ProductoBase', e.id, e.migracion, d.resultado, d.motivo, b."nombre", 'ficha del depósito',
       e.antes_precio, e.antes_margen,
       CASE d.resultado WHEN 'RECALCULADA' THEN fd.precio_final WHEN 'REVERTIDA' THEN e.previo_precio WHEN 'SIN_REGLA' THEN e.previo_precio WHEN 'NO_SE_BAJO' THEN e.previo_precio ELSE e.antes_precio END,
       CASE d.resultado WHEN 'RECALCULADA' THEN (CASE WHEN fd.regla_final = 'MARGEN_PORCENTUAL' THEN fd.margen_final ELSE e.previo_margen END)
                        WHEN 'REVERTIDA' THEN e.previo_margen WHEN 'SIN_REGLA' THEN e.previo_margen WHEN 'NO_SE_BAJO' THEN e.previo_margen ELSE e.antes_margen END,
       e.previo_precio
  FROM _rev_estado e
  LEFT JOIN "ProductoBase" b ON b."id" = e.id
  LEFT JOIN respaldo.reversion_20261030_resultado fd ON fd.tabla = 'ProductoLocal' AND fd.id = e.fila_deposito
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN NOT e.hay OR NOT e.intacta THEN 'SALTEADA'
      WHEN e.migracion = 'bajo_su_regla' THEN 'REVERTIDA'
      WHEN fd.resultado IN ('REVERTIDA', 'RECALCULADA', 'SIN_REGLA', 'NO_SE_BAJO') THEN fd.resultado
      ELSE 'SALTEADA' END AS resultado,
    CASE
      WHEN NOT e.hay THEN 'sin ficha o sin respaldo'
      WHEN NOT e.intacta THEN 'editada después de la corrección'
      WHEN e.migracion = 'bajo_su_regla' THEN 'ya tenía %'
      WHEN fd.resultado IN ('REVERTIDA', 'RECALCULADA', 'SIN_REGLA', 'NO_SE_BAJO') THEN 'sigue a su fila del depósito: ' || fd.motivo
      ELSE 'su fila del depósito no se tocó' END AS motivo
  ) d
 WHERE e.tabla = 'ProductoBase'
   AND NOT EXISTS (SELECT 1 FROM respaldo.reversion_20261030_resultado x WHERE x.tabla = 'ProductoBase' AND x.id = e.id);

-- ── LA ESCRITURA ────────────────────────────────────────────────────────────
-- Vuelve a exigir el valor de hoy: una fila que no sigue igual no se escribe.
WITH escritas AS (
  UPDATE "ProductoLocal" pl
     SET "precio_venta" = r.precio_final, "margen" = r.margen_final,
         "reglaPrecio" = r.regla_final::"ReglaPrecio", "recargoFijoUnidad" = r.recargo_final,
         "updatedAt" = CURRENT_TIMESTAMP
    FROM respaldo.reversion_20261030_resultado r
   WHERE r.tabla = 'ProductoLocal' AND r.id = pl."id" AND NOT r.aplicada
     AND r.resultado IN ('REVERTIDA', 'RECALCULADA', 'SIN_REGLA', 'NO_SE_BAJO')
     AND pl."precio_venta" IS NOT DISTINCT FROM r.precio_antes
     AND pl."margen" IS NOT DISTINCT FROM r.margen_antes
     AND pl."reglaPrecio"::text IS NOT DISTINCT FROM r.regla_antes
     AND pl."recargoFijoUnidad" IS NOT DISTINCT FROM r.recargo_antes
  RETURNING pl."id"
)
UPDATE respaldo.reversion_20261030_resultado r SET aplicada = true
  FROM escritas w WHERE r.tabla = 'ProductoLocal' AND r.id = w."id";

WITH escritas AS (
  UPDATE "ProductoBase" b
     SET "precio_venta" = r.precio_final, "margen" = r.margen_final, "updatedAt" = CURRENT_TIMESTAMP
    FROM respaldo.reversion_20261030_resultado r
   WHERE r.tabla = 'ProductoBase' AND r.id = b."id" AND NOT r.aplicada
     AND r.resultado IN ('REVERTIDA', 'RECALCULADA', 'SIN_REGLA', 'NO_SE_BAJO')
     AND b."precio_venta" IS NOT DISTINCT FROM r.precio_antes
     AND b."margen" IS NOT DISTINCT FROM r.margen_antes
  RETURNING b."id"
)
UPDATE respaldo.reversion_20261030_resultado r SET aplicada = true
  FROM escritas w WHERE r.tabla = 'ProductoBase' AND r.id = w."id";

DROP TABLE _rev_fuente;
DROP TABLE _rev_estado;

-- ── EL INFORME ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  f record;
BEGIN
  RAISE NOTICE 'Reversión de precios del 30/10 — filas por ubicación';
  FOR f IN
    SELECT resultado, COUNT(*) AS n, COUNT(*) FILTER (WHERE aplicada) AS escritas
      FROM respaldo.reversion_20261030_resultado WHERE tabla = 'ProductoLocal'
     GROUP BY resultado ORDER BY resultado
  LOOP
    RAISE NOTICE '  %: % (escritas: %)', f.resultado, f.n, f.escritas;
  END LOOP;
  FOR f IN
    SELECT resultado, COUNT(*) AS n FROM respaldo.reversion_20261030_resultado WHERE tabla = 'ProductoBase'
     GROUP BY resultado ORDER BY resultado
  LOOP
    RAISE NOTICE '  fichas del depósito %: %', f.resultado, f.n;
  END LOOP;
  RAISE NOTICE 'No se bajó (su regla daba menos que el precio previo; vuelven a su valor previo): %',
    (SELECT COUNT(*) FROM respaldo.reversion_20261030_resultado WHERE tabla = 'ProductoLocal' AND resultado = 'NO_SE_BAJO');
  FOR f IN SELECT * FROM respaldo.reversion_20261030_resultado
            WHERE tabla = 'ProductoLocal' AND resultado = 'NO_SE_BAJO' ORDER BY ubicacion, producto
  LOOP
    RAISE NOTICE '  % · % · % (%)', f.ubicacion, f.producto, f.precio_final, f.motivo;
  END LOOP;
  RAISE NOTICE 'Sin regla, devueltas a su valor previo:';
  FOR f IN SELECT * FROM respaldo.reversion_20261030_resultado
            WHERE tabla = 'ProductoLocal' AND resultado = 'SIN_REGLA' ORDER BY ubicacion, producto
  LOOP
    RAISE NOTICE '  % · % · % (%)', f.ubicacion, f.producto, f.precio_final, f.motivo;
  END LOOP;
  RAISE NOTICE 'Salteadas por edición posterior:';
  FOR f IN SELECT * FROM respaldo.reversion_20261030_resultado
            WHERE resultado = 'SALTEADA' ORDER BY tabla DESC, ubicacion, producto
  LOOP
    RAISE NOTICE '  % · % · hoy % (%)', f.ubicacion, f.producto, f.precio_antes, f.motivo;
  END LOOP;
  RAISE NOTICE 'Coca-Cola:';
  FOR f IN SELECT * FROM respaldo.reversion_20261030_resultado
            WHERE tabla = 'ProductoLocal' AND motivo LIKE 'Coca-Cola%' ORDER BY ubicacion, producto
  LOOP
    RAISE NOTICE '  % · % · % margen % (%)', f.ubicacion, f.producto, f.precio_final, f.margen_final, f.resultado;
  END LOOP;
END $$;
`;

// ── EL INFORME, PARA VOLVER A LEERLO ────────────────────────────────────────
//
// Prisma no muestra los NOTICE de la migración. Estas consultas son de solo
// lectura sobre respaldo.reversion_20261030_resultado; el generador las imprime
// con `--informe` y no se conecta a nada:
//
//   node scripts/correcciones/generarReversionPrecios20261030.mjs --informe | psql "<url>" -X
//
// Viven acá y no en un `.sql` suelto porque un `.sql` fuera de las migraciones
// es lo que `scripts/nadaDeDatosNiSecretos.test.mjs` trata como volcado.
export const INFORME = `\\echo 'Filas por ubicación y fichas, por resultado (escritas = cambiadas en la base)'
SELECT tabla, resultado, COUNT(*) AS filas, COUNT(*) FILTER (WHERE aplicada) AS escritas
  FROM respaldo.reversion_20261030_resultado
 GROUP BY tabla, resultado ORDER BY tabla DESC, resultado;

\\echo 'Por qué volvieron o con qué regla se recalcularon'
SELECT migracion, resultado, regexp_replace(motivo, '^-?[0-9.]+ %|^\\+\\$[0-9.]+ por unidad', 'N') AS motivo, COUNT(*) AS filas
  FROM respaldo.reversion_20261030_resultado WHERE tabla = 'ProductoLocal'
 GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

\\echo 'No se bajó: su regla daba menos que el precio previo, vuelven a su valor previo'
SELECT ubicacion, producto, precio_final, motivo FROM respaldo.reversion_20261030_resultado
 WHERE tabla = 'ProductoLocal' AND resultado = 'NO_SE_BAJO' ORDER BY ubicacion, producto;

\\echo 'Sin regla, devueltas a su valor previo'
SELECT ubicacion, producto, precio_final, motivo FROM respaldo.reversion_20261030_resultado
 WHERE tabla = 'ProductoLocal' AND resultado = 'SIN_REGLA' ORDER BY ubicacion, producto;

\\echo 'Salteadas por edición posterior (precio de hoy, que no se tocó)'
SELECT tabla, ubicacion, producto, precio_antes AS precio_hoy, motivo FROM respaldo.reversion_20261030_resultado
 WHERE resultado = 'SALTEADA' ORDER BY tabla DESC, ubicacion, producto;

\\echo 'Coca-Cola'
SELECT ubicacion, producto, precio_final, margen_final, resultado FROM respaldo.reversion_20261030_resultado
 WHERE tabla = 'ProductoLocal' AND motivo LIKE 'Coca-Cola%' ORDER BY ubicacion, producto;
`;

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename) && process.argv.includes("--informe")) {
  process.stdout.write(INFORME);
} else if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const { sql, resumen } = armarMigracion();
  const dir = path.join(MIGRACIONES, MIGRACION_NUEVA);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "migration.sql"), sql);
  console.log(JSON.stringify(resumen, null, 2));
}
