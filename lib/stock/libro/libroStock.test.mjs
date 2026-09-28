// CANDADO: EL LIBRO HISTÓRICO FÍSICO DE STOCK NO SE PIERDE NI SE AFLOJA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/libroStock.test.mjs
//
// El libro vive casi entero en SQL —el trigger, el punto cero, la inmutabilidad—
// y el SQL no puede importar las constantes de `libroStock.js`. Estos candados
// atan las dos mitades: si alguien cambia un nombre de un lado, el otro se entera.
// Y cuidan lo que haría que el libro NACIERA mal o dejara de capturar sin avisar:
// el orden de la activación, el tope de espera, el reloj, la configuración local
// a la transacción.
//
// Lo que ninguno de estos puede ver —que el trigger capture de verdad, que la
// activación sea atómica, que un restore lo conserve— lo prueba contra
// PostgreSQL `scripts/pruebas-db/libroStock.mjs`.
//
// Todo lo que lee código lo lee SIN COMENTARIOS: un candado que busca texto
// encuentra la prosa, y la prosa de estos archivos nombra justamente lo que se
// busca (regla 5 de CLAUDE.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  CAMPOS_QUE_REINTERPRETAN,
  CONFIG_ORIGEN,
  CONFIG_ORIGEN_REF,
  ORIGEN_ACTIVACION,
  SIN_ORIGEN,
  TIPO_MOVIMIENTO,
  TRIGGERS_OBLIGATORIOS,
  ZONA_DEL_LIBRO,
  declararOrigenDeStock,
  motivoDeOrigenInvalido,
} from "./libroStock.js";
import { TZ_AR } from "@/lib/fechas/formatearFechaHora";

const MIGRACION = "prisma/migrations/20260927120000_libro_stock/migration.sql";

const sinComentariosSql = (t) => t.replace(/--[^\n]*/g, "");
const sinComentariosJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const sinComentariosPrisma = (t) => t.replace(/\/\/[^\n]*/g, "");

const sql = () => sinComentariosSql(readFileSync(MIGRACION, "utf8"));
const bloqueDeActivacion = () => {
  const crudo = readFileSync(MIGRACION, "utf8");
  const i = crudo.indexOf("-- ACTIVACION:INICIO");
  const f = crudo.indexOf("-- ACTIVACION:FIN");
  assert.ok(i > 0 && f > i, "la migración perdió las marcas del bloque de activación");
  return sinComentariosSql(crudo.slice(i, f));
};
const modelo = (nombre) => {
  const schema = sinComentariosPrisma(readFileSync("prisma/schema.prisma", "utf8"));
  const m = schema.match(new RegExp(`\\bmodel ${nombre} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : null;
};

// ── EL MODELO ──────────────────────────────────────────────────────────────

test("los modelos del libro existen, con las columnas del hecho físico", () => {
  const mov = modelo("MovimientoStock");
  assert.ok(mov, "desapareció el modelo MovimientoStock");
  for (const col of [
    "stockLocalId", "localId", "productoLocalId", "productoBaseId", "tipo",
    "cantidadAnterior", "cantidadPosterior", "enTransitoAnterior", "enTransitoPosterior",
    "instante", "dia", "origen", "origenRef",
    "nombreCongelado", "codigoBarraCongelado", "unidadMedidaCongelada",
  ]) {
    assert.match(mov, new RegExp(`^\\s+${col}\\s`, "m"), `MovimientoStock perdió ${col}`);
  }
  assert.match(mov, /\bdia\s+DateTime\s+@db\.Date\b/, "el día tiene que ser una fecha, no un instante");
  assert.ok(modelo("ReinterpretacionDeStock"), "desapareció el modelo ReinterpretacionDeStock");
});

test("el libro no tiene claves foráneas: tiene que sobrevivir a lo que describe", () => {
  for (const nombre of ["MovimientoStock", "ReinterpretacionDeStock"]) {
    assert.doesNotMatch(modelo(nombre), /@relation/, `${nombre} ganó una relación: un borrado podría llevarse la historia`);
  }
  assert.doesNotMatch(sql(), /REFERENCES/, "la migración del libro agregó una clave foránea");
});

test("los tipos del enum son exactamente los del libro", () => {
  const schema = sinComentariosPrisma(readFileSync("prisma/schema.prisma", "utf8"));
  const e = schema.match(/\benum TipoMovimientoStock \{([\s\S]*?)\}/);
  assert.ok(e, "desapareció el enum TipoMovimientoStock");
  assert.deepEqual(e[1].trim().split(/\s+/), Object.values(TIPO_MOVIMIENTO));
});

// ── LA MIGRACIÓN Y LOS TRIGGERS ────────────────────────────────────────────

test("cada trigger obligatorio se crea en la migración, sobre su tabla", () => {
  const texto = sql();
  const creados = [...texto.matchAll(/CREATE TRIGGER "([^"]+)"[\s\S]*?\bON "([^"]+)"/g)].map((m) => ({ nombre: m[1], tabla: m[2] }));
  assert.deepEqual(
    creados.map((t) => `${t.tabla}.${t.nombre}`).sort(),
    TRIGGERS_OBLIGATORIOS.map((t) => `${t.tabla}.${t.nombre}`).sort(),
    "la lista del verificador y los triggers de la migración no coinciden"
  );
});

test("la captura de StockLocal ve INSERT, UPDATE y DELETE, y va DESPUÉS de la fila", () => {
  assert.match(bloqueDeActivacion(), /CREATE TRIGGER "StockLocal_libro"\s+AFTER INSERT OR UPDATE OR DELETE ON "StockLocal"\s+FOR EACH ROW/);
});

test("la reinterpretación vigila exactamente los campos relevados, ni uno más ni uno menos", () => {
  const bloque = bloqueDeActivacion();
  for (const [tabla, campos] of Object.entries(CAMPOS_QUE_REINTERPRETAN)) {
    const m = bloque.match(new RegExp(`AFTER UPDATE OF ([^\\n]+) ON "${tabla}"`));
    assert.ok(m, `no hay trigger de reinterpretación sobre ${tabla}`);
    const vigilados = m[1].split(",").map((c) => c.trim().replace(/"/g, ""));
    assert.deepEqual([...vigilados].sort(), [...campos].sort(), `${tabla}: la migración y libroStock.js vigilan campos distintos`);
    for (const c of campos) {
      assert.match(sql(), new RegExp(`'${c}'`), `la función de reinterpretación no registra ${c}`);
    }
  }
});

test("la activación toma el candado ANTES de crear el trigger y el trigger ANTES de copiar el estado inicial", () => {
  const b = bloqueDeActivacion();
  const tope = b.indexOf("set_config('lock_timeout', '3s', true)");
  const candado = b.search(/LOCK TABLE "StockLocal", "ProductoBase", "Local" IN SHARE ROW EXCLUSIVE MODE/);
  const trigger = b.indexOf('CREATE TRIGGER "StockLocal_libro"');
  const copia = b.indexOf('INSERT INTO "MovimientoStock"');
  assert.ok(tope >= 0, "la activación perdió el tope de espera de 3 s, local a la transacción");
  assert.ok(candado > tope, "el candado tiene que pedirse con el tope ya puesto");
  assert.ok(trigger > candado, "el trigger se crea sin el candado tomado: hay una ventana sin captura");
  assert.ok(copia > trigger, "el estado inicial se copia antes de que el trigger exista");
  assert.match(b, /^DO \$activacion\$/m, "la activación dejó de ser un único bloque DO");
  assert.match(b.slice(copia), /'ESTADO_INICIAL'[\s\S]*?NULL, sl\."cantidad", NULL, sl\."enTransito"/, "el punto cero tiene que dejar los anteriores en NULL");
});

test("el punto cero lleva UN solo instante, leído después del candado", () => {
  const b = bloqueDeActivacion();
  const lectura = b.indexOf('v_instante := "libro_stock_instante"()');
  assert.ok(lectura > b.indexOf("LOCK TABLE"), "el instante del punto cero se lee antes del candado");
  assert.match(b, /v_instante, "libro_stock_dia"\(v_instante\), 'ACTIVACION_DEL_LIBRO'/);
});

test("el reloj es clock_timestamp(), en UTC, y el día sale del instante con la zona de la app", () => {
  const texto = sql();
  assert.match(texto, /clock_timestamp\(\) AT TIME ZONE 'UTC'\)::timestamp\(3\)/);
  assert.doesNotMatch(texto, /\bnow\(\)|CURRENT_TIMESTAMP|transaction_timestamp|statement_timestamp/i, "el libro tiene que usar el reloj del momento del cambio, no el del inicio de la transacción");
  assert.equal(ZONA_DEL_LIBRO, TZ_AR, "la zona del libro dejó de ser la de la app");
  assert.ok(texto.includes(`AT TIME ZONE '${ZONA_DEL_LIBRO}'`), "la migración calcula el día con otra zona");
});

test("el origen: mismas configuraciones y mismos reservados en SQL y en JavaScript", () => {
  const texto = sql();
  assert.ok(texto.includes(`current_setting('${CONFIG_ORIGEN}', true)`));
  assert.ok(texto.includes(`current_setting('${CONFIG_ORIGEN_REF}', true)`));
  assert.ok(texto.includes(`'${SIN_ORIGEN}'`));
  assert.ok(texto.includes(`'${ORIGEN_ACTIVACION}'`));
});

test("el libro es inmutable: UPDATE y DELETE rechazados en las dos tablas", () => {
  const texto = sql();
  for (const tabla of ["MovimientoStock", "ReinterpretacionDeStock"]) {
    assert.match(texto, new RegExp(`BEFORE UPDATE OR DELETE ON "${tabla}"\\s+FOR EACH ROW EXECUTE FUNCTION "libro_stock_inmutable"`));
  }
});

// ── EL HELPER DE ORIGEN ────────────────────────────────────────────────────

test("el helper declara el origen con set_config LOCAL a la transacción, nunca de sesión", () => {
  const fuente = sinComentariosJs(readFileSync("lib/stock/libro/libroStock.js", "utf8"));
  const llamadas = [...fuente.matchAll(/set_config\(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(llamadas.length, 2, "el helper tiene que fijar origen y referencia");
  for (const args of llamadas) assert.match(args, /,\s*true\s*$/, `set_config(${args}) no es local a la transacción`);
});

test("el helper rechaza el cliente raíz: el origen se perdería antes de escribir", async () => {
  const raiz = { $queryRaw: async () => [], $transaction: async () => {} };
  await assert.rejects(() => declararOrigenDeStock(raiz, { origen: "VENTA" }), /cliente raíz/);
  await assert.rejects(() => declararOrigenDeStock(null, { origen: "VENTA" }), /cliente de la transacción/);
});

test("el helper pasa origen y referencia, y borra la referencia cuando no se da", async () => {
  const llamadas = [];
  const tx = { $queryRaw: async (partes, ...valores) => llamadas.push(valores) };
  await declararOrigenDeStock(tx, { origen: "VENTA", referencia: 17 });
  await declararOrigenDeStock(tx, { origen: "VENTA" });
  assert.deepEqual(llamadas, [
    [CONFIG_ORIGEN, "VENTA", CONFIG_ORIGEN_REF, "17"],
    [CONFIG_ORIGEN, "VENTA", CONFIG_ORIGEN_REF, ""],
  ]);
});

test("un origen es un identificador en mayúsculas y no uno de los reservados", () => {
  assert.equal(motivoDeOrigenInvalido("VENTA"), null);
  assert.equal(motivoDeOrigenInvalido("TRANSFERENCIA_ENVIO"), null);
  for (const malo of ["venta", "", "V", "VENTA-1", "1VENTA", null, undefined, 3, SIN_ORIGEN, ORIGEN_ACTIVACION]) {
    assert.notEqual(motivoDeOrigenInvalido(malo), null, `aceptó ${JSON.stringify(malo)}`);
  }
});

// ── NADIE MÁS ESCRIBE EL LIBRO ─────────────────────────────────────────────

function archivos(...patrones) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...patrones], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

test("ningún archivo de la app ni de los scripts escribe el libro: lo escribe solo el trigger", () => {
  const escritura = /(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+"?(MovimientoStock|ReinterpretacionDeStock)\b|\b(movimientoStock|reinterpretacionDeStock)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b/;
  // Las pruebas de base son las excepciones declaradas. La del libro intenta
  // UPDATE y DELETE para comprobar que se rechazan, y rompe filas a propósito en
  // su contraprueba. La de la recuperación crea un "MovimientoStock" FALSO con
  // filas, en una base descartable, para probar que el diagnóstico frena ante un
  // punto cero parcial. La del Stock Diario, en bases descartables, REUBICA en el
  // tiempo los movimientos que el trigger escribió de verdad —para tener días
  // distintos en una prueba que dura un minuto— e inserta en masa movimientos
  // sintéticos para medir el plan con volumen.
  const EXENTOS = new Set([
    "scripts/pruebas-db/libroStock.mjs",
    "scripts/pruebas-db/recuperacionLibroStock.mjs",
    "scripts/pruebas-db/stockDiario.mjs",
    // Reubica en el tiempo el libro de las bases DESCARTABLES del Stock Diario
    // —la del motor y la de la API—; no construye cliente, cada prueba trae el suyo.
    "scripts/pruebas-db/lib/libroEnElTiempo.mjs",
  ]);
  // En un pathspec de git `*` también cruza `/`, y `**/` exige un directorio:
  // "scripts/**/*.mjs" dejaba afuera los 146 scripts de primer nivel. Con una
  // sola estrella se ven todos, a cualquier profundidad.
  const culpables = archivos("app/*.js", "app/*.jsx", "lib/*.js", "lib/*.mjs", "scripts/*.js", "scripts/*.mjs", "scripts/*.cjs")
    .filter((f) => !EXENTOS.has(f) && !f.endsWith(".test.mjs"))
    .filter((f) => escritura.test(sinComentariosJs(readFileSync(f, "utf8"))));
  assert.deepEqual(culpables, []);
});

test("el reset operativo no borra el libro", () => {
  const reset = sinComentariosJs(readFileSync("app/api/admin/reset-operativo/route.js", "utf8"));
  assert.doesNotMatch(reset, /MovimientoStock|ReinterpretacionDeStock|movimientoStock|reinterpretacionDeStock/);
  // Y sigue borrando StockLocal con DELETE, que el trigger ve, y no con TRUNCATE,
  // que el trigger no ve.
  assert.match(reset, /tx\.stockLocal\.deleteMany\(/);
  assert.doesNotMatch(reset, /TRUNCATE/i);
});

test("la prueba de base del libro corre en CI", () => {
  const ci = readFileSync(".github/workflows/verificacion.yml", "utf8");
  assert.match(ci, /scripts\/pruebas-db\/libroStock\.mjs/);
  assert.match(archivos("scripts/pruebas-db/libroStock.mjs").join(), /libroStock\.mjs/);
});

// ── LA BAJA NO DEPENDE DEL ORDEN DE LAS SENTENCIAS ─────────────────────────
//
// `20260928180000_libro_stock_baja_atomica` reemplaza `libro_stock_registrar`.
// Estos candados atan el reemplazo a lo que la corrección tiene que ser: el
// CAMBIO y el ALTA idénticos al original, la BAJA con su identidad recordada, y
// el libro fallando cerrado. Que funcione de verdad —el DELETE atómico, la
// re-vinculación, el rollback, la concurrencia— lo prueba la sección K de
// `scripts/pruebas-db/libroStock.mjs`, con la contraprueba sobre el libro sin
// corregir.

const MIGRACION_BAJA = "prisma/migrations/20260928180000_libro_stock_baja_atomica/migration.sql";
const sqlBaja = () => sinComentariosSql(readFileSync(MIGRACION_BAJA, "utf8"));
const espacios = (t) => t.replace(/\s+/g, " ").trim();

function cuerpoDe(texto, funcion) {
  const i = texto.search(new RegExp(`FUNCTION "${funcion}"\\(`));
  assert.ok(i >= 0, `no encontré la función ${funcion}`);
  const desde = texto.indexOf("$fn$", i);
  const hasta = texto.indexOf("$fn$", desde + 4);
  return texto.slice(desde + 4, hasta);
}

/** Las sentencias INSERT del cuerpo, normalizadas. */
const insertsDe = (cuerpo) => [...cuerpo.matchAll(/INSERT INTO "MovimientoStock"[\s\S]*?;/g)].map((m) => espacios(m[0]));

test("la corrección es la ÚLTIMA definición de libro_stock_registrar: nadie la pisa sin pasar por acá", () => {
  const definen = archivos("prisma/migrations/*/migration.sql")
    .sort()
    .filter((f) => /FUNCTION "libro_stock_registrar"\(/.test(sinComentariosSql(readFileSync(f, "utf8"))));
  assert.deepEqual(definen, [MIGRACION, MIGRACION_BAJA]);
  assert.match(sqlBaja(), /CREATE OR REPLACE FUNCTION "libro_stock_registrar"\(\) RETURNS trigger/);
});

test("el CAMBIO y el ALTA se escriben EXACTAMENTE como antes, y el reloj, el día y el origen son los mismos", () => {
  const viejo = cuerpoDe(sql(), "libro_stock_registrar");
  const nuevo = cuerpoDe(sqlBaja(), "libro_stock_registrar");
  const insertsViejos = insertsDe(viejo);
  const insertsNuevos = insertsDe(nuevo);
  for (const tipo of ["CAMBIO", "ALTA"]) {
    const v = insertsViejos.find((s) => s.includes(`'${tipo}'`));
    assert.ok(v, `el original no tiene el INSERT de ${tipo}`);
    assert.ok(insertsNuevos.includes(v), `el INSERT de ${tipo} cambió: la corrección no toca ni el CAMBIO ni el ALTA`);
  }
  for (const linea of [
    'v_instante timestamp(3) := "libro_stock_instante"();',
    'v_dia date := "libro_stock_dia"(v_instante);',
    'v_origen text := "libro_stock_origen"();',
    'v_ref text := "libro_stock_origen_ref"();',
  ]) {
    assert.ok(espacios(viejo).includes(linea) && espacios(nuevo).includes(linea), `cambió: ${linea}`);
  }
  assert.doesNotMatch(sqlBaja(), /\bnow\(\)|CURRENT_TIMESTAMP|transaction_timestamp|statement_timestamp/i);
});

test("la BAJA ya no depende de un JOIN que puede no encontrar nada: toma la identidad recordada o falla", () => {
  const nuevo = cuerpoDe(sqlBaja(), "libro_stock_registrar");
  const baja = insertsDe(nuevo).find((s) => s.includes("'BAJA'"));
  assert.ok(baja, "no hay INSERT de BAJA");
  assert.match(baja, /\) VALUES \(/, "la BAJA volvió a ser un INSERT … SELECT, que inserta cero filas sin avisar");
  assert.match(espacios(nuevo), /v_identidad := "libro_stock_identidad_de_baja"\(OLD\."productoId"\);/);
  // El contrato de la BAJA: la fila, la ubicación, la cadena, la base, los
  // saldos anteriores y la identidad congelada.
  for (const valor of ['OLD."id"', 'OLD."localId"', 'OLD."productoId"', "'baseId'", 'OLD."cantidad"', 'OLD."enTransito"', "'nombre'", "'codigo'", "'unidad'"]) {
    assert.ok(baja.includes(valor), `la BAJA perdió ${valor}`);
  }
  const identidad = espacios(cuerpoDe(sqlBaja(), "libro_stock_identidad_de_baja"));
  assert.match(identidad, /RAISE EXCEPTION 'Libro de stock: no se puede registrar la BAJA/, "sin identidad, la BAJA tiene que fallar, no saltearse");
});

test("el libro falla cerrado: un CAMBIO o un ALTA que no inserta aborta la sentencia", () => {
  const nuevo = espacios(cuerpoDe(sqlBaja(), "libro_stock_registrar"));
  for (const tipo of ["CAMBIO", "ALTA"]) {
    assert.match(nuevo, new RegExp(`'${tipo}'.*?GET DIAGNOSTICS v_filas = ROW_COUNT; IF v_filas <> 1 THEN RAISE EXCEPTION 'Libro de stock: no se pudo registrar el ${tipo}`));
  }
});

test("la identidad se recuerda ANTES de borrar ProductoLocal y ProductoBase, local a la transacción", () => {
  const texto = sqlBaja();
  assert.match(texto, /CREATE TRIGGER "ProductoBase_libro_identidad"\s+BEFORE DELETE ON "ProductoBase"\s+FOR EACH ROW EXECUTE FUNCTION "libro_stock_recordar_producto_base"\(\)/);
  assert.match(texto, /CREATE TRIGGER "ProductoLocal_libro_identidad"\s+BEFORE DELETE ON "ProductoLocal"\s+FOR EACH ROW EXECUTE FUNCTION "libro_stock_recordar_producto_local"\(\)/);
  for (const funcion of ["libro_stock_recordar_producto_base", "libro_stock_recordar_producto_local"]) {
    const cuerpo = espacios(cuerpoDe(texto, funcion));
    const llamadas = [...cuerpo.matchAll(/set_config\((.*?), true \)/g)];
    assert.equal(llamadas.length, 1, `${funcion} tiene que recordar con set_config LOCAL (true)`);
    assert.doesNotMatch(cuerpo, /\b(INSERT|UPDATE|DELETE)\b/, `${funcion} escribe tablas: solo tiene que recordar`);
    assert.match(cuerpo, /RETURN OLD;/, `${funcion} tiene que dejar seguir el DELETE`);
  }
});

test("la corrección no reescribe el libro ni mueve el punto cero", () => {
  const texto = sqlBaja();
  assert.doesNotMatch(texto, /ESTADO_INICIAL|ACTIVACION_DEL_LIBRO/, "la corrección no crea estado inicial");
  assert.doesNotMatch(texto, /(UPDATE|DELETE\s+FROM|TRUNCATE)\s+"(MovimientoStock|ReinterpretacionDeStock)"/);
  assert.doesNotMatch(texto, /\b(DROP|ALTER)\s+(TABLE|TRIGGER|FUNCTION)\b/, "la corrección reemplaza, no borra ni altera");
  assert.doesNotMatch(texto, /CREATE (OR REPLACE )?TRIGGER "(StockLocal_libro|ProductoBase_libro_reinterpretacion|Local_libro_reinterpretacion|MovimientoStock_inmutable|ReinterpretacionDeStock_inmutable)"/);
  // Los únicos objetos que toca.
  const funciones = [...texto.matchAll(/CREATE (?:OR REPLACE )?FUNCTION "([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(funciones, [
    "libro_stock_identidad_de_baja",
    "libro_stock_recordar_producto_base",
    "libro_stock_recordar_producto_local",
    "libro_stock_registrar",
  ]);
});
