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
CREATE TABLE "AuditoriaBitacora" (
  "id" serial PRIMARY KEY, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "usuarioId" integer,
  "localId" integer, "accion" text NOT NULL, "entidad" text NOT NULL, "entidadId" text, "entidadNombre" text, "cambios" jsonb);
CREATE TABLE "ImportacionListaFila" (
  "id" serial PRIMARY KEY, "productoBaseId" integer, "aplicada" boolean NOT NULL DEFAULT false,
  "aplicadaEn" timestamp(3), "aplicadaPorUsuarioId" integer);
CREATE TABLE "_prisma_migrations" ("migration_name" varchar(255) NOT NULL, "finished_at" timestamptz);
`;

// El estado de ANTES del 30/10. Las filas con id de las migraciones llevan los
// valores que sus guardas exigen; las fichas que las migraciones no nombran y
// las filas auxiliares van con ids que ninguna de las tres toca (≥ 800000).
const CASOS = `
INSERT INTO "Local" VALUES (1, 'depo', true), (2, 'Minimarket ayala', false), (3, 'Mini unidas', false), (4, 'mini el 7', false);
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
  (803706, 'arcor masiso 80grs chocolate crispy', NULL, NULL, 'unidad', NULL, 28402.67, 18200, 40.48, false),
  (1203,   'BAGGIO 200 ML MANZANA',       NULL, NULL, 'unidad', NULL, 8380,   10900, NULL,  false),
  (664,    'AZUFRE',                      NULL, NULL, 'unidad', NULL, 1200,   500,   NULL,  false),
  (811500, 'DOWNY BRISA DE VERANO',       NULL, NULL, 'unidad', NULL, 2650,   3200,  NULL,  false);
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
  (3706,   4, 803706, 28402.67, 18200, NULL,  'MARGEN_PORCENTUAL', NULL),
  (1203,   1, 1203,   8380,     10900, NULL,  'MARGEN_PORCENTUAL', NULL),
  (800003, 2, 1203,   8380,     10100, 20,    'MARGEN_PORCENTUAL', NULL),
  (664,    1, 664,    1200,     500,   NULL,  'MARGEN_PORCENTUAL', NULL),
  (2680,   4, 664,    1200,     300,   NULL,  'MARGEN_PORCENTUAL', NULL),
  (10396,  2, 664,    1200,     500,   NULL,  'MARGEN_PORCENTUAL', NULL),
  (11500,  2, 811500, 2650,     3200,  NULL,  'MARGEN_PORCENTUAL', NULL),
  (800004, 3, 811500, 2650,     3600,  35,    'MARGEN_PORCENTUAL', NULL);
INSERT INTO "ComboComponente" ("comboProductoLocalId", "comboLocalId", "componenteProductoLocalId", "componenteLocalId", "cantidad")
  VALUES (11598, 3, 800002, 3, 1);
`;

// Lo que pasó DESPUÉS del 30/10 y antes de esta corrección, con la fila de
// bitácora que cada camino deja de verdad (lib/auditoria/interceptor.js): una
// entrada por dominio, el id del producto es el de la ficha, y la acción sale de
// la primera escritura del request —por eso la recepción también dice
// "producto.editar"—.
const DESPUES = `
-- Edición manual de la Amoxicilina desde la ficha del producto.
UPDATE "ProductoLocal" SET "precio_venta" = 450 WHERE "id" = 14928;
INSERT INTO "AuditoriaBitacora" ("createdAt", "usuarioId", "accion", "entidad", "entidadId", "entidadNombre", "cambios") VALUES
  (now() AT TIME ZONE 'UTC', 7, 'producto.editar', 'Producto', '804928', 'Amoxicilina 500g',
   '[{"entidad":"Producto","nombre":"Amoxicilina 500g","id":"804928","campos":[{"label":"Precio de venta","antes":"400","despues":"450"}]}]');

-- Edición manual del AZUFRE en mini el 7: el producto se saltea en sus tres ubicaciones.
UPDATE "ProductoLocal" SET "precio_venta" = 1700 WHERE "id" = 2680;
INSERT INTO "AuditoriaBitacora" ("createdAt", "usuarioId", "accion", "entidad", "entidadId", "entidadNombre", "cambios") VALUES
  (now() AT TIME ZONE 'UTC', 7, 'producto.editar', 'Producto', '664', 'AZUFRE',
   '[{"entidad":"Producto","nombre":"AZUFRE","id":"664","campos":[{"label":"Precio de venta","antes":"1.600","despues":"1.700"}]}]');

-- Recepción de una compra: sube el costo de DOWNY BRISA DE VERANO y el
-- recálculo automático le pone el 30 % inventado. La fila trae el pedido.
UPDATE "ProductoLocal" SET "precio_costo" = 3000, "precio_venta" = 3900 WHERE "id" = 11500;
INSERT INTO "AuditoriaBitacora" ("createdAt", "usuarioId", "accion", "entidad", "entidadId", "entidadNombre", "cambios") VALUES
  (now() AT TIME ZONE 'UTC', 7, 'producto.editar', 'Producto', '811500', 'DOWNY BRISA DE VERANO',
   '[{"entidad":"Producto","nombre":"DOWNY BRISA DE VERANO","id":"811500","campos":[{"label":"Precio de costo","antes":"2.650","despues":"3.000"},{"label":"Precio de venta","antes":"3.500","despues":"3.900"}]},{"entidad":"Pedido","nombre":"Pedido #77","id":"77","campos":[{"label":"Estado","antes":"ENVIADO","despues":"RECIBIDO"}]}]');

-- Aplicación de una lista: sube el costo de DOWNY 400 y el recálculo le pone el
-- 30 % inventado. La fila de la lista guarda quién y cuándo.
UPDATE "ProductoLocal" SET "precio_costo" = 3300, "precio_venta" = 4300 WHERE "id" = 11265;
INSERT INTO "ImportacionListaFila" ("productoBaseId", "aplicada", "aplicadaEn", "aplicadaPorUsuarioId") VALUES
  (801265, true, (now() AT TIME ZONE 'UTC') - interval '1 minute', 7);
INSERT INTO "AuditoriaBitacora" ("createdAt", "usuarioId", "accion", "entidad", "entidadId", "entidadNombre", "cambios") VALUES
  (now() AT TIME ZONE 'UTC', 7, 'producto.editar', 'Producto', '801265', 'DOWNY 400ML BRISA INTENSO',
   '[{"entidad":"Producto","nombre":"DOWNY 400ML BRISA INTENSO","id":"801265","campos":[{"label":"Precio de costo","antes":"3.141","despues":"3.300"},{"label":"Precio de venta","antes":"4.100","despues":"4.300"}]}]');
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
    for (const d of [MIGRACION_A, MIGRACION_B, MIGRACION_C]) {
      psql(url, ["-f", archivo(d)]);
      // Lo que Prisma anota al terminar cada una: de acá sale el corte de "posterior".
      consulta(url, `INSERT INTO "_prisma_migrations" VALUES ('${d}', now())`);
    }

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
    //    La de la ficha: una fila "de escala" que heredaba el margen de su ficha.
    const deFicha = precioDesdeMargen({ costo: 28402.67, margenConfigurado: 40.48, redondeo100: true }).precioFinal;
    assert.equal(fila(3706), `${deFicha.toFixed(2)}|40.48|MARGEN_PORCENTUAL|∅`);
    assert.equal(resultado("ProductoLocal", 3706), "RECALCULADA|40.48 %, la de la ficha");
    //    La de la fila: monto fijo por unidad sobre un cartón de 10.
    const conMonto = precioDesdeRecargoUnidad({ costo: 49980, recargoFijoUnidad: 200, unidadMedida: "cajon", factorPack: 10, redondeo100: true }).precioVenta;
    assert.equal(fila(6086), `${conMonto.toFixed(2)}|30.00|RECARGO_FIJO_UNIDAD|200.00`);
    assert.equal(resultado("ProductoLocal", 6086), "RECALCULADA|+$200.00 por unidad, la de la fila");

    //    Nunca baja un precio: con el 20 % de otra ubicación daría menos que los
    //    $10.900 que tenía; vuelve entera a su valor previo, y la ficha también.
    const con20 = precioDesdeMargen({ costo: 8380, margenConfigurado: 20, redondeo100: true }).precioFinal;
    assert.ok(con20 < 10900, "el caso tiene que ser uno donde la regla baja el precio");
    assert.equal(fila(1203), "10900.00|∅|MARGEN_PORCENTUAL|∅");
    assert.equal(ficha(1203), "10900.00|∅");
    assert.equal(resultado("ProductoLocal", 1203), `NO_SE_BAJO|no se bajó: su regla daba ${con20.toFixed(2)}`);
    assert.match(resultado("ProductoBase", 1203), /^NO_SE_BAJO\|sigue a su fila del depósito/);

    // 3. Sin regla en ningún lado: no se inventa, vuelve a su valor previo. Es
    //    además una fila que una LISTA recalculó sola con el 30 %: no cuenta como
    //    edición, entra igual.
    assert.equal(fila(11265), "4100.00|∅|MARGEN_PORCENTUAL|∅");
    assert.equal(resultado("ProductoLocal", 11265), "SIN_REGLA|sin regla en ningún lado");

    //    Recalculada sola por una RECEPCIÓN de compra: tampoco cuenta como
    //    edición. Se recalcula con su regla propia (35 % de otra ubicación) sobre
    //    el costo de HOY, $3.000, no sobre el del 30/10.
    const conRecepcion = precioDesdeMargen({ costo: 3000, margenConfigurado: 35, redondeo100: true }).precioFinal;
    assert.equal(fila(11500), `${conRecepcion.toFixed(2)}|35.00|MARGEN_PORCENTUAL|∅`);
    assert.equal(resultado("ProductoLocal", 11500), "RECALCULADA|35.00 %, la de otra ubicación");

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

    // 6. Editada a mano después, según la bitácora: no se toca y se lista.
    const aMano = /^SALTEADA\|editada a mano el \d{4}-\d\d-\d\d \d\d:\d\d$/;
    assert.equal(fila(14928), "450.00|30.00|MARGEN_PORCENTUAL|∅");
    assert.match(resultado("ProductoLocal", 14928), aMano);
    //    Editado a mano en UNA ubicación: el producto se saltea en TODAS, y su ficha.
    assert.equal(fila(664), "1600.00|33.00|MARGEN_PORCENTUAL|∅");
    assert.equal(fila(2680), "1700.00|33.00|MARGEN_PORCENTUAL|∅");
    assert.equal(fila(10396), "1600.00|33.00|MARGEN_PORCENTUAL|∅");
    assert.equal(ficha(664), "1600.00|33.00");
    for (const [t, id] of [["ProductoLocal", 664], ["ProductoLocal", 2680], ["ProductoLocal", 10396], ["ProductoBase", 664]]) {
      assert.match(resultado(t, id), aMano, `${t} ${id}`);
    }

    // El informe sale y nombra lo que pidió Emanuel.
    assert.match(primera.stderr, /Sin regla, devueltas a su valor previo:\n.*Minimarket ayala · DOWNY 400ML BRISA INTENSO · 4100\.00/);
    // 1.360 son todas las de la lista; en esta base casi todas no existen.
    assert.match(primera.stderr, /Las 1360 filas a las que la segunda corrección les puso margen: 6 corregidas \(2 se habían recalculado solas\), 4 salteadas por edición manual/);
    assert.match(primera.stderr, /Salteadas por edición manual del producto \(para revisar\):\n(.*\n)*.*Amoxicilina 500g · Mini unidas · hoy 450\.00 \(editada a mano el /);
    assert.match(primera.stderr, /AZUFRE · mini el 7 · hoy 1700\.00 \(editada a mano el /);
    assert.match(primera.stderr, /Mini unidas · COCA COLA 2\.25L · 27600\.00 margen -3\.16 \(REVERTIDA\)/);
    assert.match(primera.stderr, /Minimarket ayala · COCA COLA 2L · 30400\.00 margen 30\.29 \(REVERTIDA\)/);

    // El informe de solo lectura corre contra la base y dice lo mismo.
    const informe = psql(url, ["-f", "-"], INFORME).stdout;
    assert.match(informe, /Minimarket ayala\s*\|\s*DOWNY 400ML BRISA INTENSO\s*\|\s*4100\.00\s*\|\s*sin regla en ningún lado/);
    assert.match(informe, /Mini unidas\s*\|\s*COCA COLA 2\.25L\s*\|\s*27600\.00\s*\|\s*-3\.16\s*\|\s*REVERTIDA/);
    assert.match(informe, /Amoxicilina 500g\s*\|\s*Mini unidas\s*\|\s*450\.00\s*\|\s*\d{4}-\d\d-\d\d \d\d:\d\d/);
    assert.match(informe, /\s1360\s*\|\s*6\s*\|\s*2\s*\|\s*4\s*\n/);
    assert.match(informe, /depo\s*\|\s*BAGGIO 200 ML MANZANA\s*\|\s*10900\.00\s*\|\s*no se bajó/);
    assert.match(primera.stderr, /No se bajó \(.*\): 1\n.*depo · BAGGIO 200 ML MANZANA · 10900\.00/);

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

    // 8. Falla cerrada: sin saber cuándo terminó la segunda corrección no se
    //    puede separar una edición posterior, y con filas reales no sigue.
    consulta(url, `DELETE FROM "_prisma_migrations" WHERE migration_name = '${MIGRACION_B}'`);
    assert.throws(() => psql(url, ["-f", archivo(MIGRACION_NUEVA)]), /No se sabe cuándo terminó/);
  } finally {
    consulta(URL_ADMIN, `DROP DATABASE IF EXISTS ${nombre}`);
  }
});
