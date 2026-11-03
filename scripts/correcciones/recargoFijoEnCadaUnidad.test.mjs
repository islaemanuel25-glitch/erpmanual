// EL RECARGO FIJO POR UNIDAD VA A CADA UNIDAD: LA CUENTA, Y SU CORRECCIÓN DE DATOS.
//
// Caso de Emanuel, 2026-11-03, Casiano casas: cartón de 10, costo del bulto
// $40.260 (unitario $4.026), recargo $300 por unidad. Correcto: 4.326 por
// unidad, $43.260 el bulto sin redondeo ($44.000 con el redondeo a 100, que se
// aplica sobre el unitario). Estaba en $41.000: los $300 sumados una vez al
// bulto. Lo escribió 20261103120000_precios_del_30_10_vuelven_a_su_regla al
// devolver a su valor previo filas que 20261030220000 había calculado bien.
//
// La migración nueva decide en SQL con datos de producción: se prueba
// corriéndola (CLAUDE.md, regla 2). Este candado arma una base descartable,
// carga el estado de ANTES del 30/10, corre las cuatro migraciones anteriores
// tal como están en el repo —son las que dejaron el $41.000— y recién ahí la
// nueva, dos veces. Necesita PG_PRUEBA_URL (permiso de CREATE DATABASE); sin
// ella la parte de base se SALTEA a la vista.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { precioDesdeRecargoUnidad } from "../../lib/precios/recargoFijoUnidad.js";
import { ventaSegunRegla } from "../../lib/precios/ventaSegunRegla.js";
import { ventaParaModo, MODO_PRECIO_VENTA } from "../../lib/proveedores/listas/aplicacion.js";
import { ROTULOS_DE_PRECIO } from "./generarReversionPrecios20261030.mjs";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const archivo = (d) => path.join(RAIZ, "prisma/migrations", d, "migration.sql");
const ANTERIORES = [
  "20261030220000_precios_bajo_su_regla",
  "20261030230000_precios_sin_regla",
  "20261030235000_promociones_vuelven",
  "20261103120000_precios_del_30_10_vuelven_a_su_regla",
];
const NUEVA = "20261103210000_recargo_fijo_en_cada_unidad";

// ── LA CUENTA ───────────────────────────────────────────────────────────────

const CASIANO = { costo: 40260, recargoFijoUnidad: 300, unidadMedida: "cajon", factorPack: 10 };

/** Lo que el candado afirma de una cuenta de precio. La contraprueba la corre con la vieja. */
function afirmaLaCuentaPorUnidad(cuenta) {
  assert.equal(cuenta({ ...CASIANO, redondeo100: false }), 43260, "Casiano sin redondeo");
  assert.equal(cuenta({ ...CASIANO, redondeo100: true }), 44000, "Casiano con redondeo a 100 sobre el unitario");
  // Suelto: unidades = 1, el recargo va una vez porque bulto y unidad son lo mismo.
  assert.equal(cuenta({ costo: 4026, recargoFijoUnidad: 300, unidadMedida: "unidad", factorPack: null, redondeo100: false }), 4326);
  assert.equal(cuenta({ costo: 4026, recargoFijoUnidad: 300, unidadMedida: "unidad", factorPack: null, redondeo100: true }), 4400);
}

/** La cuenta equivocada: el recargo sumado una vez al bulto. */
const cuentaVieja = ({ costo, recargoFijoUnidad, redondeo100 }) => {
  const x = costo + recargoFijoUnidad;
  return redondeo100 ? Math.ceil(x / 100) * 100 : x;
};

test("la cuenta del sistema suma el recargo a cada unidad: Casiano da $43.260 (y $44.000 redondeado)", () => {
  afirmaLaCuentaPorUnidad((p) => precioDesdeRecargoUnidad(p).precioVenta);
});

test("contraprueba: con la cuenta vieja (recargo una vez al bulto) el candado da rojo", () => {
  assert.throws(() => afirmaLaCuentaPorUnidad(cuentaVieja), /Casiano sin redondeo/);
  assert.equal(cuentaVieja({ ...CASIANO, redondeo100: false }), 40560, "la vieja da 40.260 + 300");
});

test("la función única elige la regla: en recargo no mira el margen viejo que arrastra la fila", () => {
  const v = ventaSegunRegla({
    ...CASIANO, reglaPrecio: "RECARGO_FIJO_UNIDAD", margenLocal: 10.14, margenBase: 30, redondeo100: true,
  });
  assert.equal(v.precioVenta, 44000);
  assert.equal(v.regla, "RECARGO_FIJO_UNIDAD");
  assert.equal(v.margenConfigurado, null);
  // Por margen: el de la ubicación manda, el de la ficha es el respaldo.
  assert.equal(ventaSegunRegla({ costo: 1000, margenLocal: 30, margenBase: 50 }).precioVenta, 1300);
  assert.equal(ventaSegunRegla({ costo: 1000, margenLocal: null, margenBase: 50 }).precioVenta, 1500);
  assert.equal(ventaSegunRegla({ costo: 1000, margenLocal: null, margenBase: null }).aplica, false);
});

test("aplicar una lista recalcula una ubicación en recargo con su recargo, no con su margen viejo", () => {
  const r = ventaParaModo({
    modo: MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN, costo: 40260, margenConfigurado: 10.14, redondeo100: true,
    reglaPrecio: "RECARGO_FIJO_UNIDAD", recargoFijoUnidad: 300, unidadMedida: "cajon", factorPack: 10,
  });
  assert.deepEqual(r, { aplica: true, precioFinal: 44000 });
  // Sin regla (la ficha del depósito), sigue por margen como siempre.
  assert.deepEqual(
    ventaParaModo({ modo: MODO_PRECIO_VENTA.RECALCULAR_POR_MARGEN, costo: 1000, margenConfigurado: 30 }),
    { aplica: true, precioFinal: 1300 },
  );
});

test("la migración mira los mismos rótulos de bitácora que escribe la app", () => {
  const sql = fs.readFileSync(archivo(NUEVA), "utf8");
  assert.ok(sql.includes(`k->>'label' IN (${ROTULOS_DE_PRECIO.map((r) => `'${r}'`).join(", ")})`));
});

// ── CONTRA POSTGRES ─────────────────────────────────────────────────────────

const URL_ADMIN = process.env.PG_PRUEBA_URL;

function psql(url, args, entrada) {
  const r = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args], { input: entrada, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql salió con ${r.status}: ${r.stderr}`);
  return r;
}
const consulta = (url, sql) => psql(url, ["-At", "-F", "|", "-c", sql]).stdout.trim();

// Las columnas que leen o escriben estas migraciones, copiadas de prisma/schema.prisma.
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

// El estado de ANTES del 30/10. 6946 y 7085 son las filas reales de Casiano
// que nombra 20261030220000, con los valores que su guarda exige (precio
// $41.000, costo $40.260, margen 10,14) y su regla de recargo de $300. Las
// demás llevan ids que ninguna migración anterior toca (≥ 900000).
const CASOS = `
INSERT INTO "Local" VALUES (1, 'depo', true), (5, 'Casiano casas', false), (2, 'Minimarket ayala', false);
INSERT INTO "ProductoBase" ("id", "nombre", "proveedor_id", "unidad_medida", "factor_pack", "precio_costo", "precio_venta", "margen", "redondeo_100") VALUES
  (906946, 'Lucky origen 20 comun',           NULL, 'cajon',  10,   40260, 41000, NULL, true),
  (907085, 'Lucky origen 20 común mentolado', NULL, 'cajon',  10,   40260, 41000, NULL, true),
  (900010, 'Cartón sin redondeo',             NULL, 'cajon',  10,   40260, 40560, NULL, false),
  (900020, 'Cartón del cálculo normal',       NULL, 'pack',   10,   40260, 40600, NULL, true),
  (900030, 'Suelto',                          NULL, 'unidad', NULL, 4026,  4326,  NULL, false),
  (900040, 'Cartón editado a mano',           NULL, 'cajon',  10,   40260, 41000, NULL, true),
  (900050, 'COCA COLA cartón',                19,   'pack',   10,   40260, 41000, NULL, true),
  (900060, 'Cartón ya bien',                  NULL, 'cajon',  10,   40260, 44000, NULL, true),
  (900070, 'Cartón con margen',               NULL, 'cajon',  10,   40260, 41000, 30,   true);
INSERT INTO "ProductoLocal" ("id", "localId", "baseId", "precio_costo", "precio_venta", "margen", "reglaPrecio", "recargoFijoUnidad") VALUES
  (6946,   5, 906946, 40260, 41000, 10.14, 'RECARGO_FIJO_UNIDAD', 300),
  (7085,   5, 907085, 40260, 41000, 10.14, 'RECARGO_FIJO_UNIDAD', 300),
  (900011, 2, 900010, 40260, 40560, NULL,  'RECARGO_FIJO_UNIDAD', 300),
  (900021, 1, 900020, 40260, 40600, NULL,  'RECARGO_FIJO_UNIDAD', 300),
  (900022, 5, 900020, 40260, 41000, NULL,  'RECARGO_FIJO_UNIDAD', 300),
  (900031, 2, 900030, 4026,  4326,  NULL,  'RECARGO_FIJO_UNIDAD', 300),
  (900041, 5, 900040, 40260, 41000, NULL,  'RECARGO_FIJO_UNIDAD', 300),
  (900051, 5, 900050, 40260, 41000, NULL,  'RECARGO_FIJO_UNIDAD', 300),
  (900061, 5, 900060, 40260, 44000, NULL,  'RECARGO_FIJO_UNIDAD', 300),
  (900071, 5, 900070, 40260, 41000, 30,    'MARGEN_PORCENTUAL',   NULL);
`;

// Lo que pasó después de la migración de hoy, con la fila de bitácora que deja
// cada camino de verdad (lib/auditoria/interceptor.js).
const DESPUES = `
-- Una persona tocó el margen del Lucky mentolado desde la ficha: no se toca.
INSERT INTO "AuditoriaBitacora" ("createdAt", "usuarioId", "accion", "entidad", "entidadId", "entidadNombre", "cambios") VALUES
  (now() AT TIME ZONE 'UTC', 7, 'producto.editar', 'Producto', '907085', 'Lucky origen 20 común mentolado',
   '[{"entidad":"Producto","nombre":"Lucky origen 20 común mentolado","id":"907085","campos":[{"label":"Margen","antes":"10,14","despues":"12"}]}]');
-- El cartón editado a mano: su última escritura de precio es de una persona.
INSERT INTO "AuditoriaBitacora" ("createdAt", "usuarioId", "accion", "entidad", "entidadId", "entidadNombre", "cambios") VALUES
  ((now() AT TIME ZONE 'UTC') - interval '2 days', 7, 'producto.editar', 'Producto', '900040', 'Cartón editado a mano',
   '[{"entidad":"Producto","nombre":"Cartón editado a mano","id":"900040","campos":[{"label":"Precio de venta","antes":"40.000","despues":"41.000"}]}]');
-- El cartón del cálculo normal: editado a mano hace una semana, y después una
-- recepción de compra le escribió el precio. La última es automática: entra.
INSERT INTO "AuditoriaBitacora" ("createdAt", "usuarioId", "accion", "entidad", "entidadId", "entidadNombre", "cambios") VALUES
  ((now() AT TIME ZONE 'UTC') - interval '7 days', 7, 'producto.editar', 'Producto', '900020', 'Cartón del cálculo normal',
   '[{"entidad":"Producto","nombre":"Cartón del cálculo normal","id":"900020","campos":[{"label":"Precio de venta","antes":"39.000","despues":"40.000"}]}]'),
  ((now() AT TIME ZONE 'UTC') - interval '1 day', 7, 'producto.editar', 'Producto', '900020', 'Cartón del cálculo normal',
   '[{"entidad":"Producto","nombre":"Cartón del cálculo normal","id":"900020","campos":[{"label":"Precio de venta","antes":"40.000","despues":"40.600"}]},{"entidad":"Pedido","nombre":"Pedido #9","id":"9","campos":[{"label":"Estado","antes":"ENVIADO","despues":"RECIBIDO"}]}]');
`;

const FOTO = `
SELECT 'PL', "id", "precio_venta", "margen", "reglaPrecio", "recargoFijoUnidad", "updatedAt" FROM "ProductoLocal"
UNION ALL SELECT 'PB', "id", "precio_venta", "margen", NULL, NULL, "updatedAt" FROM "ProductoBase"
ORDER BY 1, 2`;

function conBase(nombre, cuerpo) {
  consulta(URL_ADMIN, `DROP DATABASE IF EXISTS ${nombre}`);
  consulta(URL_ADMIN, `CREATE DATABASE ${nombre}`);
  const partes = URL_ADMIN.match(/^(postgres(?:ql)?:\/\/[^/]*\/)[^?]*(.*)$/);
  assert.ok(partes, "PG_PRUEBA_URL no tiene forma de URL de Postgres");
  const url = `${partes[1]}${nombre}${partes[2]}`;
  try {
    psql(url, ["-f", "-"], ESQUEMA + CASOS);
    for (const d of ANTERIORES) {
      psql(url, ["-f", archivo(d)]);
      consulta(url, `INSERT INTO "_prisma_migrations" VALUES ('${d}', now())`);
    }
    cuerpo(url);
  } finally {
    consulta(URL_ADMIN, `DROP DATABASE IF EXISTS ${nombre}`);
  }
}

const sinBase = URL_ADMIN ? false : "sin PG_PRUEBA_URL no hay base donde correr la migración";

test("contra Postgres: Casiano vuelve a $44.000, cada caso termina donde dice la regla, y la segunda corrida no cambia nada", { skip: sinBase }, () => {
  conBase(`prueba_recargo_unidad_${process.pid}`, (url) => {
    const precio = (id) => consulta(url, `SELECT "precio_venta" FROM "ProductoLocal" WHERE "id" = ${id}`);
    const ficha = (id) => consulta(url, `SELECT "precio_venta" FROM "ProductoBase" WHERE "id" = ${id}`);
    const resultado = (id) => consulta(url,
      `SELECT origen || '|' || resultado || '|' || motivo FROM respaldo.recargo_unidad_20261103_resultado WHERE id = ${id}`);

    // El punto de partida es el del defecto: la migración de hoy dejó Casiano en $41.000.
    assert.equal(precio(6946), "41000.00", "la migración de hoy tenía que haber dejado el $41.000");
    psql(url, ["-f", "-"], DESPUES);

    const primera = psql(url, ["-f", archivo(NUEVA)]);
    const correcto = precioDesdeRecargoUnidad({ ...CASIANO, redondeo100: true }).precioVenta;

    // 1. Casiano: de la migración de hoy, con la misma cuenta que lib/precios.
    assert.equal(precio(6946), `${correcto.toFixed(2)}`);
    assert.equal(precio(6946), "44000.00");
    assert.equal(resultado(6946), "migracion_de_hoy|CORREGIDA|+$300.00 por unidad × 10 unidades");

    // 2. Los números exactos del pedido, sin redondeo: 40.560 → 43.260. Cálculo normal.
    assert.equal(precio(900011), "43260.00");
    assert.equal(resultado(900011), "calculo_normal|CORREGIDA|+$300.00 por unidad × 10 unidades");

    // 3. Cálculo normal, las dos formas de la cuenta equivocada (redondeo sobre el
    //    bulto: 40.600; sobre el unitario: 41.000). La fila del depósito arrastra
    //    su ficha; la manual vieja no cuenta porque después escribió una recepción.
    assert.equal(precio(900021), "44000.00");
    assert.equal(ficha(900020), "44000.00", "la ficha del depósito sigue a su fila");
    assert.equal(precio(900022), "44000.00");
    assert.match(resultado(900022), /^calculo_normal\|CORREGIDA\|/);

    // 4. Suelto: unidades = 1, no cambia nada y ni siquiera entra.
    assert.equal(precio(900031), "4326.00");
    assert.equal(resultado(900031), "");

    // 5. Editadas a mano después de la escritura equivocada: no se tocan, se listan.
    const aMano = /\|SALTEADA\|editada a mano el \d{4}-\d\d-\d\d \d\d:\d\d$/;
    assert.equal(precio(7085), "41000.00");
    assert.match(resultado(7085), /^migracion_de_hoy/);
    assert.match(resultado(7085), aMano);
    assert.equal(precio(900041), "41000.00");
    assert.match(resultado(900041), aMano);

    // 6. Coca-Cola: no se toca.
    assert.equal(precio(900051), "41000.00");
    assert.match(resultado(900051), /\|EXCLUIDA\|Coca-Cola/);

    // 7. Ya bien, o en regla de margen: no entran.
    assert.equal(precio(900061), "44000.00");
    assert.equal(resultado(900061), "");
    assert.equal(precio(900071), "41000.00");
    assert.equal(resultado(900071), "");

    // El informe dice cuántas, de dónde, y lista las salteadas.
    assert.match(primera.stderr, /Recargo fijo por unidad: 4 filas corregidas \(1 de la migración de hoy, 3 del cálculo normal\), 1 fichas del depósito/);
    assert.match(primera.stderr, /Salteadas por edición manual: 2, no se bajaron: 0, excluidas \(Coca-Cola, combos, promociones\): 1/);
    assert.match(primera.stderr, /Casiano casas · Lucky origen 20 comun · 41000\.00 → 44000\.00/);
    assert.match(primera.stderr, /Salteadas por edición manual \(para revisar\):\n(.*\n)*.*Casiano casas · Lucky origen 20 común mentolado · hoy 41000\.00, correcto 44000\.00 \(editada a mano el /);

    // El respaldo del estado de antes está.
    assert.equal(consulta(url, `SELECT "precio_venta" FROM respaldo.backup_recargo_unidad_20261103 WHERE "id" = 6946`), "41000.00");

    // 8. Segunda corrida: ni un valor ni un updatedAt se mueve.
    const antes = consulta(url, FOTO);
    const decisiones = consulta(url, "SELECT * FROM respaldo.recargo_unidad_20261103_resultado ORDER BY id");
    psql(url, ["-f", archivo(NUEVA)]);
    assert.equal(consulta(url, FOTO), antes);
    assert.equal(consulta(url, "SELECT * FROM respaldo.recargo_unidad_20261103_resultado ORDER BY id"), decisiones);

    // 9. Falla cerrada: sin saber cuándo terminó la migración de hoy no se puede
    //    separar una edición posterior.
    consulta(url, "DROP TABLE respaldo.recargo_unidad_20261103_resultado");
    consulta(url, `UPDATE "ProductoLocal" SET "precio_venta" = 41000 WHERE "id" = 6946`);
    consulta(url, `DELETE FROM "_prisma_migrations" WHERE migration_name = '${ANTERIORES[3]}'`);
    assert.throws(() => psql(url, ["-f", archivo(NUEVA)]), /No se sabe cuándo terminó/);
  });
});

test("contraprueba contra Postgres: con la cuenta vieja en la migración, Casiano se queda en $41.000", { skip: sinBase }, () => {
  const sql = fs.readFileSync(archivo(NUEVA), "utf8");
  const buena = "ROUND(ROUND(costo / unidades, 2) + recargo, 2)";
  assert.equal(sql.split(buena).length - 1, 2, "la cuenta correcta tiene que estar dos veces (con y sin redondeo)");
  const vieja = sql.replaceAll(buena, "ROUND((costo + recargo) / unidades, 2)");
  conBase(`prueba_recargo_unidad_vieja_${process.pid}`, (url) => {
    psql(url, ["-f", "-"], vieja);
    assert.equal(consulta(url, `SELECT "precio_venta" FROM "ProductoLocal" WHERE "id" = 6946`), "41000.00");
    assert.notEqual(consulta(url, `SELECT "precio_venta" FROM "ProductoLocal" WHERE "id" = 6946`), "44000.00");
  });
});
