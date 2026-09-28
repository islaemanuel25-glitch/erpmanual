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
  // punto cero parcial.
  const EXENTOS = new Set(["scripts/pruebas-db/libroStock.mjs", "scripts/pruebas-db/recuperacionLibroStock.mjs"]);
  const culpables = archivos("app/**/*.js", "app/**/*.jsx", "lib/**/*.js", "lib/**/*.mjs", "scripts/**/*.js", "scripts/**/*.mjs", "scripts/**/*.cjs")
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
