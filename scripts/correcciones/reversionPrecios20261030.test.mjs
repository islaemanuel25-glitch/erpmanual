// LA CORRECCIÓN DE LAS CORRECCIONES DE PRECIOS DEL 30/10, EJERCIDA CONTRA POSTGRES.
//
// La migración decide en SQL, en el momento de aplicarse, con datos que solo
// están en producción. Ni el build ni un candado de funciones puras pueden
// probarla: un SQL se prueba corriéndolo (CLAUDE.md, regla 2). Por eso este
// candado arma una base descartable, carga casos en el estado de ANTES del 30/10,
// corre las TRES migraciones de ese día tal como están en el repo —son ellas las
// que crean los respaldos y ponen los valores— y recién ahí corre la nueva, dos
// veces.
//
// Los casos usan las filas reales que nombran esas migraciones, con los valores
// que sus guardas exigen; lo único elegido acá son los locales, las fichas que
// las migraciones no nombran, las ediciones posteriores y la regla de otra
// ubicación.
//
// Necesita PG_PRUEBA_URL: una conexión con permiso de CREATE DATABASE (por
// ejemplo postgresql://root@/postgres?host=/var/run/postgresql). Sin ella la
// parte de base se SALTEA a la vista, no pasa en verde.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  armarMigracion, loQuePuso, INFORME, MIGRACION_A, MIGRACION_B, MIGRACION_C, MIGRACION_NUEVA,
} from "./generarReversionPrecios20261030.mjs";
import { precioDesdeMargen } from "../../lib/precios/precioDesdeMargen.js";
import { precioDesdeRecargoUnidad } from "../../lib/precios/recargoFijoUnidad.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const archivo = (d) => path.join(RAIZ, "prisma/migrations", d, "migration.sql");

// ── LO QUE NO NECESITA BASE ─────────────────────────────────────────────────

test("la migración del repo es la que arma el generador hoy", () => {
  assert.equal(
    fs.readFileSync(archivo(MIGRACION_NUEVA), "utf8"),
    armarMigracion().sql,
    "la migración quedó vieja respecto del generador: volver a correrlo"
  );
});

test("la lista de lo que pusieron tiene los tamaños que producción confirmó", () => {
  assert.deepEqual(armarMigracion().resumen, {
    bajoSuReglaFilas: 768, bajoSuReglaFichas: 23, sinReglaFilas: 1479, sinReglaFichas: 370, combosYaDevueltos: 12,
  });
});

test("las seis filas de Coca-Cola que tocaron las correcciones están en la lista", () => {
  const a = loQuePuso(fs.readFileSync(archivo(MIGRACION_A), "utf8")).map((f) => f.id);
  const b = loQuePuso(fs.readFileSync(archivo(MIGRACION_B), "utf8")).map((f) => f.id);
  for (const id of [9995, 10007, 10026, 10313, 6798]) assert.ok(a.includes(id), `falta ${id} en la primera`);
  assert.ok(b.includes(12176), "falta la COCA COLA 2.25L de Mini unidas en la segunda");
});

test("una ficha queda ligada a la fila del depósito que la precede", () => {
  const b = loQuePuso(fs.readFileSync(archivo(MIGRACION_B), "utf8"));
  assert.deepEqual(b.find((f) => f.tabla === "ProductoBase" && f.id === 167), {
    tabla: "ProductoBase", id: 167, filaDeposito: 167, precio: "24000", margen: "30", poneRegla: false,
  });
});

// ── CONTRA POSTGRES ─────────────────────────────────────────────────────────

const URL_ADMIN = process.env.PG_PRUEBA_URL;

function psql(url, args, entrada) {
  const r = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args], { input: entrada, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql salió con ${r.status}: ${r.stderr}`);
  return r;
}
const consulta = (url, sql) => psql(url, ["-At", "-F", "|", "-c", sql]).stdout.trim();

// La forma de las columnas que la migración lee o escribe, copiada de
// prisma/schema.prisma (tipos y nulabilidad).
const ESQUEMA = `
CREATE TYPE "ReglaPrecio" AS ENUM ('MARGEN_PORCENTUAL', 'RECARGO_FIJO_UNIDAD');
CREATE TYPE "UnidadMedida" AS ENUM ('unidad', 'pack', 'cajon', 'kg');
CREATE TABLE "Local" ("id" integer PRIMARY KEY, "nombre" text NOT NULL, "es_deposito" boolean NOT NULL DEFAULT false);
CREATE TABLE "ProductoBase" (
  "id" integer PRIMARY KEY, "nombre" text NOT NULL,
  "proveedor_id" integer, "proveedor2_id" integer, "proveedor3_id" integer,
  "unidad_medida" "UnidadMedida" NOT NULL, "factor_pack" integer,
  "precio_costo" numeric(12,2) NOT NULL, "precio_venta" numeric(12,2) NOT NULL, "margen" numeric(6,2),
  "redondeo_100" boolean NOT NULL DEFAULT true, "es_combo" boolean NOT NULL DEFAULT false,
  "activo" boolean NOT NULL DEFAULT true, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "ProductoLocal" (
  "id" integer PRIMARY KEY, "localId" integer NOT NULL, "baseId" integer NOT NULL REFERENCES "ProductoBase"("id"),
  "nombre" text, "precio_costo" numeric(12,2), "precio_venta" numeric(12,2), "margen" numeric(6,2),
  "reglaPrecio" "ReglaPrecio" NOT NULL DEFAULT 'MARGEN_PORCENTUAL', "recargoFijoUnidad" numeric(12,2),
  "activo" boolean NOT NULL DEFAULT true, "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "ComboComponente" (
  "id" serial PRIMARY KEY, "comboProductoLocalId" integer NOT NULL, "comboLocalId" integer NOT NULL,
  "componenteProductoLocalId" integer NOT NULL, "componenteLocalId" integer NOT NULL, "cantidad" numeric(12,3) NOT NULL);
`;

// El estado de ANTES del 30/10. Las filas con id de las migraciones llevan los
// valores que sus guardas exigen; las fichas que las migraciones no nombran y
// las filas auxiliares van con ids que ninguna de las tres toca (≥ 800000).
const CASOS = `
INSERT INTO "Local" VALUES (1, 'depo', true), (2, 'Minimarket ayala', false), (3, 'Mini unidas', false);
INSERT INTO "ProductoBase" ("id", "nombre", "proveedor_id", "proveedor2_id", "unidad_medida", "factor_pack", "precio_costo", "precio_venta", "margen", "es_combo") VALUES
  (2609,   'AMSTEL LAGER 473',            NULL, NULL, 'pack',   24, 35400,    46100, 30.23, false),
  (495,    'JABON REXONA X3 COTTON FRESH', NULL, NULL, 'unidad', NULL, 3261.01, 2900,  NULL,  false),
  (800995, 'COCA COLA 2L',                19,   NULL, 'unidad', NULL, 23333.33, 30400, NULL,  false),
  (167,    'BAGGIO 1L CHOCOLATADA X8',    NULL, NULL, 'pack',   8,  18400,    19300, NULL,  false),
  (800086, 'Chester 20 común',            NULL, NULL, 'cajon',  10, 49980,    49000, NULL,  false),
  (800176, 'COCA COLA 2.25L',             NULL, 19,   'unidad', NULL, 28500,  27600, NULL,  false),
  (800951, 'quilmes x2',                  NULL, NULL, 'unidad', NULL, 5666.66, 6000, NULL,  true),
  (801265, 'DOWNY 400ML BRISA INTENSO',   NULL, NULL, 'unidad', NULL, 3141,   4100,  NULL,  false),
  (804928, 'Amoxicilina 500g',            NULL, NULL, 'unidad', NULL, 300,    300,   NULL,  false),
  (801598, 'Aceitunas negras',            NULL, NULL, 'unidad', NULL, 14580,  0,     NULL,  false),
  (801599, 'componente',                  NULL, NULL, 'unidad', NULL, 100,    150,   NULL,  false),
  (803185, 'COLGATE DENTRIFICO 70G X12',  NULL, NULL, 'unidad', NULL, 22200,  28900, NULL,  false);
INSERT INTO "ProductoLocal" ("id", "localId", "baseId", "precio_costo", "precio_venta", "margen", "reglaPrecio", "recargoFijoUnidad") VALUES
  (13982,  1, 2609,   35400,    46100, 30.23, 'MARGEN_PORCENTUAL', NULL),
  (495,    1, 495,    3261.01,  2900,  NULL,  'MARGEN_PORCENTUAL', NULL),
  (9995,   2, 800995, 23333.33, 30400, 30.29, 'MARGEN_PORCENTUAL', NULL),
  (167,    1, 167,    18400,    19300, NULL,  'MARGEN_PORCENTUAL', NULL),
  (800001, 2, 167,    18400,    25800, 40,    'MARGEN_PORCENTUAL', NULL),
  (6086,   1, 800086, 49980,    49000, 30,    'RECARGO_FIJO_UNIDAD', 200),
  (12176,  3, 800176, 28500,    27600, -3.16, 'MARGEN_PORCENTUAL', NULL),
  (14951,  2, 800951, 5666.66,  6000,  NULL,  'MARGEN_PORCENTUAL', NULL),
  (11265,  2, 801265, 3141,     4100,  NULL,  'MARGEN_PORCENTUAL', NULL),
  (14928,  3, 804928, 300,      300,   0,     'MARGEN_PORCENTUAL', NULL),
  (11598,  3, 801598, 14580,    0,     0,     'MARGEN_PORCENTUAL', NULL),
  (800002, 3, 801599, 100,      150,   NULL,  'MARGEN_PORCENTUAL', NULL),
  (13185,  3, 803185, 22200,    28900, NULL,  'MARGEN_PORCENTUAL', NULL);
INSERT INTO "ComboComponente" ("comboProductoLocalId", "comboLocalId", "componenteProductoLocalId", "componenteLocalId", "cantidad")
  VALUES (11598, 3, 800002, 3, 1);
`;

// Lo que pasó DESPUÉS del 30/10 y antes de esta corrección.
const DESPUES = `
UPDATE "ProductoLocal" SET "precio_venta" = 450 WHERE "id" = 14928;  -- alguien editó la Amoxicilina
UPDATE "ProductoBase" SET "margen" = 45 WHERE "id" = 803185;        -- alguien le puso 45 % a la ficha del Colgate
`;

const FOTO = `
SELECT 'PL', "id", "precio_venta", "margen", "reglaPrecio", "recargoFijoUnidad", "updatedAt" FROM "ProductoLocal"
UNION ALL SELECT 'PB', "id", "precio_venta", "margen", NULL, NULL, "updatedAt" FROM "ProductoBase"
ORDER BY 1, 2`;

test("contra Postgres: cada caso termina donde dice la regla, y la segunda corrida no cambia nada", {
  skip: URL_ADMIN ? false : "sin PG_PRUEBA_URL no hay base donde correr la migración",
}, () => {
  const nombre = `prueba_reversion_30_10_${process.pid}`;
  consulta(URL_ADMIN, `DROP DATABASE IF EXISTS ${nombre}`);
  consulta(URL_ADMIN, `CREATE DATABASE ${nombre}`);
  // `new URL` no acepta una conexión por socket sin host; se cambia solo el nombre de la base.
  const partes = URL_ADMIN.match(/^(postgres(?:ql)?:\/\/[^/]*\/)[^?]*(.*)$/);
  assert.ok(partes, `PG_PRUEBA_URL no tiene forma de URL de Postgres`);
  const url = `${partes[1]}${nombre}${partes[2]}`;
  try {
    psql(url, ["-f", "-"], ESQUEMA + CASOS);
    for (const d of [MIGRACION_A, MIGRACION_B, MIGRACION_C]) psql(url, ["-f", archivo(d)]);

    // Las correcciones del 30/10 hicieron lo que dicen: el punto de partida es el real.
    assert.equal(consulta(url, `SELECT "precio_venta" || '|' || "margen" FROM "ProductoLocal" WHERE "id" = 167`), "24000.00|30.00");
    assert.equal(consulta(url, `SELECT "precio_venta" FROM "ProductoLocal" WHERE "id" = 14951`), "6000.00");
    psql(url, ["-f", "-"], DESPUES);

    const primera = psql(url, ["-f", archivo(MIGRACION_NUEVA)]);
    const fila = (id) => consulta(url,
      `SELECT "precio_venta" || '|' || COALESCE("margen"::text, '∅') || '|' || "reglaPrecio" || '|' || COALESCE("recargoFijoUnidad"::text, '∅')
         FROM "ProductoLocal" WHERE "id" = ${id}`);
    const ficha = (id) => consulta(url, `SELECT "precio_venta" || '|' || COALESCE("margen"::text, '∅') FROM "ProductoBase" WHERE "id" = ${id}`);
    const resultado = (tabla, id) => consulta(url,
      `SELECT resultado || '|' || motivo FROM respaldo.reversion_20261030_resultado WHERE tabla = '${tabla}' AND id = ${id}`);

    // 1. Una fila que YA TENÍA % vuelve a su valor previo, y su ficha también.
    assert.equal(fila(13982), "46100.00|30.23|MARGEN_PORCENTUAL|∅");
    assert.equal(ficha(2609), "46100.00|30.23");
    assert.equal(resultado("ProductoLocal", 13982), "REVERTIDA|ya tenía %");
    //    Y una de la primera a la que le había inventado 30: vuelve a sin margen.
    assert.equal(fila(495), "2900.00|∅|MARGEN_PORCENTUAL|∅");
    assert.equal(ficha(495), "2900.00|∅");

    // 2. Sin %: se recalcula con la regla del producto en otra ubicación (40 %),
    //    con la misma cuenta que lib/precios, y la ficha del depósito la sigue.
    const con40 = precioDesdeMargen({ costo: 18400, margenConfigurado: 40, redondeo100: true }).precioFinal;
    assert.equal(fila(167), `${con40.toFixed(2)}|40.00|MARGEN_PORCENTUAL|∅`);
    assert.equal(ficha(167), `${con40.toFixed(2)}|40.00`);
    assert.equal(resultado("ProductoLocal", 167), "RECALCULADA|40.00 %, la de otra ubicación");
    assert.equal(fila(800001), "25800.00|40.00|MARGEN_PORCENTUAL|∅", "la ubicación de donde salió la regla no se toca");
    //    La de la ficha, puesta por una persona después del 30/10.
    const con45 = precioDesdeMargen({ costo: 22200, margenConfigurado: 45, redondeo100: true }).precioFinal;
    assert.equal(fila(13185), `${con45.toFixed(2)}|45.00|MARGEN_PORCENTUAL|∅`);
    assert.equal(resultado("ProductoLocal", 13185), "RECALCULADA|45.00 %, la de la ficha");
    //    La de la fila: monto fijo por unidad sobre un cartón de 10.
    const conMonto = precioDesdeRecargoUnidad({ costo: 49980, recargoFijoUnidad: 200, unidadMedida: "cajon", factorPack: 10, redondeo100: true }).precioVenta;
    assert.equal(fila(6086), `${conMonto.toFixed(2)}|30.00|RECARGO_FIJO_UNIDAD|200.00`);
    assert.equal(resultado("ProductoLocal", 6086), "RECALCULADA|+$200.00 por unidad, la de la fila");

    // 3. Sin regla en ningún lado: no se inventa, vuelve a su valor previo.
    assert.equal(fila(11265), "4100.00|∅|MARGEN_PORCENTUAL|∅");
    assert.equal(resultado("ProductoLocal", 11265), "SIN_REGLA|sin regla en ningún lado");

    // 4. Coca-Cola, de las dos correcciones: vuelve a lo fijado por la empresa.
    assert.equal(fila(12176), "27600.00|-3.16|MARGEN_PORCENTUAL|∅");
    assert.equal(fila(9995), "30400.00|30.29|MARGEN_PORCENTUAL|∅");
    assert.match(resultado("ProductoLocal", 12176), /^REVERTIDA\|Coca-Cola/);

    // 5. El combo que ya devolvió la tercera migración queda intacto; un combo
    //    por componentes que ella no devolvió vuelve a su valor previo.
    assert.equal(fila(14951), "6000.00|∅|MARGEN_PORCENTUAL|∅");
    assert.match(resultado("ProductoLocal", 14951), /^INTACTA\|/);
    assert.equal(fila(11598), "0.00|0.00|MARGEN_PORCENTUAL|∅");
    assert.equal(resultado("ProductoLocal", 11598), "REVERTIDA|combo");

    // 6. Editada a mano después: no se toca y se lista.
    assert.equal(fila(14928), "450.00|30.00|MARGEN_PORCENTUAL|∅");
    assert.equal(resultado("ProductoLocal", 14928), "SALTEADA|editada después de la corrección");

    // El informe sale y nombra lo que pidió Emanuel.
    assert.match(primera.stderr, /Sin regla, devueltas a su valor previo:\n.*Minimarket ayala · DOWNY 400ML BRISA INTENSO · 4100\.00/);
    assert.match(primera.stderr, /Salteadas por edición posterior:\n.*Mini unidas · Amoxicilina 500g · hoy 450\.00/);
    assert.match(primera.stderr, /Mini unidas · COCA COLA 2\.25L · 27600\.00 margen -3\.16 \(REVERTIDA\)/);
    assert.match(primera.stderr, /Minimarket ayala · COCA COLA 2L · 30400\.00 margen 30\.29 \(REVERTIDA\)/);

    // El informe de solo lectura corre contra la base y dice lo mismo.
    const informe = psql(url, ["-f", "-"], INFORME).stdout;
    assert.match(informe, /Minimarket ayala\s*\|\s*DOWNY 400ML BRISA INTENSO\s*\|\s*4100\.00\s*\|\s*sin regla en ningún lado/);
    assert.match(informe, /Mini unidas\s*\|\s*COCA COLA 2\.25L\s*\|\s*27600\.00\s*\|\s*-3\.16\s*\|\s*REVERTIDA/);
    assert.match(informe, /Amoxicilina 500g\s*\|\s*450\.00\s*\|\s*editada después/);

    // Los respaldos del 30/10 siguen ahí.
    for (const t of ["backup_precios_ubicacion_20261030", "backup_precios_ubicacion_20261030_b", "backup_precios_ubicacion_20261030_e"]) {
      assert.ok(Number(consulta(url, `SELECT COUNT(*) FROM respaldo.${t}`)) > 0, `${t} quedó vacío o no está`);
    }

    // 7. Segunda corrida: ni un valor ni un updatedAt se mueve.
    const antes = consulta(url, FOTO);
    const decisiones = consulta(url, "SELECT * FROM respaldo.reversion_20261030_resultado ORDER BY tabla, id");
    psql(url, ["-f", archivo(MIGRACION_NUEVA)]);
    assert.equal(consulta(url, FOTO), antes);
    assert.equal(consulta(url, "SELECT * FROM respaldo.reversion_20261030_resultado ORDER BY tabla, id"), decisiones);
  } finally {
    consulta(URL_ADMIN, `DROP DATABASE IF EXISTS ${nombre}`);
  }
});
