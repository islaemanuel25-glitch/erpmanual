// CANDADOS DEL ORIGEN DE LAS ESCRITURAS DE COSTO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/precios/origenDeCosto.test.mjs
//
// Dos cosas:
//
//   1. el helper: declara con set_config LOCAL, por el mecanismo compartido con
//      el libro físico, y una declaración mal hecha NO lanza —no puede frenar
//      una escritura de costo—;
//   2. el CENSO de escritores: todo archivo de la app que escribe ProductoBase o
//      ProductoLocal está clasificado —declara, hereda de su llamador, queda
//      SIN_ORIGEN con su motivo, o no escribe costo—. Un escritor nuevo sin
//      clasificar lo pone rojo, y con él la pregunta de qué origen le toca.
//
// Que la declaración LLEGUE a la base en los caminos reales lo prueba
// `scripts/pruebas-db/origenDeCosto.mjs`, con un trigger de captura.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import {
  CONFIG_COSTO_ORIGEN,
  CONFIG_COSTO_ORIGEN_REF,
  ORIGEN_COSTO,
  SIN_ORIGEN_COSTO,
  declararOrigenDeCosto,
  motivoDeOrigenDeCostoInvalido,
} from "./origenDeCosto.js";
import { FORMA_DEL_ORIGEN } from "../libros/origenDeTransaccion.js";
import { CONFIG_ORIGEN, CONFIG_ORIGEN_REF } from "../stock/libro/libroStock.js";

const sinComentariosJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const fuente = (ruta) => sinComentariosJs(readFileSync(ruta, "utf8"));

// ── EL HELPER ──────────────────────────────────────────────────────────────

test("declara origen y referencia en SUS configuraciones, distintas de las del stock", async () => {
  const llamadas = [];
  const tx = { $queryRaw: async (partes, ...valores) => llamadas.push(valores) };
  assert.equal(await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.COMPRA_PROVEEDOR, referencia: 17 }), true);
  assert.equal(await declararOrigenDeCosto(tx, { origen: ORIGEN_COSTO.ALTA_PRODUCTO }), true);
  assert.deepEqual(llamadas, [
    [CONFIG_COSTO_ORIGEN, "COMPRA_PROVEEDOR", CONFIG_COSTO_ORIGEN_REF, "17"],
    [CONFIG_COSTO_ORIGEN, "ALTA_PRODUCTO", CONFIG_COSTO_ORIGEN_REF, ""],
  ]);
  assert.notEqual(CONFIG_COSTO_ORIGEN, CONFIG_ORIGEN);
  assert.notEqual(CONFIG_COSTO_ORIGEN_REF, CONFIG_ORIGEN_REF);
});

test("una declaración mal hecha NO lanza: no declara, avisa y devuelve false", async (t) => {
  const avisos = [];
  t.mock.method(console, "warn", (...a) => avisos.push(a.join(" ")));
  const llamadas = [];
  const tx = { $queryRaw: async (...a) => llamadas.push(a) };
  const raiz = { $queryRaw: async (...a) => llamadas.push(a), $transaction: async () => {} };
  for (const [cliente, origen] of [
    [raiz, ORIGEN_COSTO.COMPRA_PROVEEDOR],
    [null, ORIGEN_COSTO.COMPRA_PROVEEDOR],
    [tx, "INVENTADO"],
    [tx, SIN_ORIGEN_COSTO],
    [tx, undefined],
  ]) {
    assert.equal(await declararOrigenDeCosto(cliente, { origen }), false, `declaró con ${JSON.stringify(origen)}`);
  }
  assert.equal(llamadas.length, 0, "no tiene que tocar la base si no declara");
  assert.equal(avisos.length, 5);
  assert.ok(avisos.every((a) => a.includes(SIN_ORIGEN_COSTO)));
});

test("los orígenes son identificadores estables: clave igual al valor, con la forma del libro", () => {
  for (const [clave, valor] of Object.entries(ORIGEN_COSTO)) {
    assert.equal(clave, valor);
    assert.match(valor, FORMA_DEL_ORIGEN);
    assert.equal(motivoDeOrigenDeCostoInvalido(valor), null);
  }
  assert.notEqual(motivoDeOrigenDeCostoInvalido(SIN_ORIGEN_COSTO), null, "SIN_ORIGEN lo escribe el libro, no se declara");
});

test("el mecanismo compartido fija las dos configuraciones LOCALES a la transacción", () => {
  const compartido = fuente("lib/libros/origenDeTransaccion.js");
  const llamadas = [...compartido.matchAll(/set_config\(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(llamadas.length, 2);
  for (const args of llamadas) assert.match(args, /,\s*true\s*$/, `set_config(${args}) no es local a la transacción`);
  const propio = fuente("lib/precios/origenDeCosto.js");
  assert.doesNotMatch(propio, /set_config|\$queryRaw/, "el de costo no escribe por su cuenta: delega");
  assert.match(propio, /escribirOrigenEnTransaccion\(/);
});

// ── EL CENSO DE ESCRITORES DE COSTO ────────────────────────────────────────
//
// Enumerado con `git ls-files --cached --others --exclude-standard`, que ve lo
// que todavía no se commiteó, sobre `app/`, `lib/` y `components/`. Los
// `scripts/` quedan afuera a propósito: son siembras y pruebas, no escritores
// de la aplicación, y los que corren contra una base real piden el cliente a la
// fábrica.

const ESCRITURA = /\bproducto(Base|Local)\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|upsert)\s*\(/;

// DECLARA: los orígenes que declara el archivo, uno por transacción que escribe.
// HEREDA: escribe con el `db`/`tx` que le pasan; el origen es el del llamador, y
//   se listan los llamadores para que uno nuevo no pase sin verse.
// SIN_ORIGEN: escribe costo pero no puede declarar sin cambiar su estructura
//   transaccional. Queda SIN_ORIGEN, que es válido. El motivo es parte del dato.
// NO_ESCRIBE_COSTO: escribe esas tablas, pero no `precio_costo`.
const CENSO = {
  "app/api/compras-proveedor/recibir/[id]/route.js": { declara: ["COMPRA_PROVEEDOR"] },
  "app/api/productos/crear/route.js": { declara: ["ALTA_PRODUCTO"] },
  "app/api/productos/import/apply/route.js": { declara: ["IMPORTACION_PRODUCTOS", "IMPORTACION_PRODUCTOS"] },
  "app/api/productos/precios/apply/route.js": { declara: ["ACTUALIZACION_MASIVA_PRECIOS"] },
  "app/api/productos/promover-a-deposito/route.js": { declara: ["PROMOCION_A_DEPOSITO"] },
  "app/api/proveedores/listas/[id]/aplicar/route.js": { declara: ["LISTA_PROVEEDOR_APLICAR"] },
  "app/api/proveedores/listas/[id]/revertir/route.js": { declara: ["LISTA_PROVEEDOR_REVERTIR"] },
  "app/api/stock_locales/nuevo/route.js": { declara: ["ALTA_PRODUCTO_DESDE_STOCK"] },
  "app/api/stock_locales/importar/route.js": {
    declara: ["IMPORTACION_STOCK"],
    sinOrigen:
      "Los ProductoLocal se crean con el cliente raíz después de la transacción de las bases. Meterlos adentro cambia la atomicidad de la importación.",
  },
  "app/api/transferencias/confirmar-recepcion/route.js": { declara: ["ALTA_POR_TRANSFERENCIA_RECEPCION"] },
  "lib/combos/service.js": { declara: ["COMBO_ALTA", "COMBO_EDICION"] },
  "lib/grupos.js": { declara: ["HERENCIA_DEL_DEPOSITO"] },
  "lib/transferencias/crearTransferencia.js": { declara: ["ALTA_POR_TRANSFERENCIA_ENVIO"] },
  "lib/compras-proveedor/costoMaestro.js": {
    hereda: { funcion: "actualizarCostoRealProducto", llamadores: ["app/api/compras-proveedor/recibir/[id]/route.js"] },
  },
  "lib/precios/propagarCostoALocales.js": {
    hereda: {
      funcion: "propagarCostoALocales",
      llamadores: ["app/api/productos/editar/[id]/route.js", "lib/compras-proveedor/costoMaestro.js"],
    },
  },
  "app/api/productos/editar/[id]/route.js": {
    sinOrigen:
      "El editor escribe con el cliente raíz, sin transacción: base, propagación, alineación y override son sentencias sueltas. Envolverlas cambia su atomicidad.",
  },
  "app/api/stock_locales/listar/route.js": {
    sinOrigen: "El autocompletado de ProductoLocal faltantes al listar es un createMany suelto con el cliente raíz.",
  },
  "app/api/productos/precio-revisado/route.js": { noEscribeCosto: "Solo marca precioRevisadoAt." },
};

function archivosDeLaApp() {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app", "lib", "components"],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.test\.mjs$/.test(f));
}

test("el censo de escritores de ProductoBase y ProductoLocal está completo y no tiene sobrantes", () => {
  const encontrados = archivosDeLaApp().filter((f) => ESCRITURA.test(fuente(f)));
  const sinClasificar = encontrados.filter((f) => !(f in CENSO));
  assert.deepEqual(sinClasificar, [], "escritor nuevo: decidí qué origen declara, o por qué queda SIN_ORIGEN");
  const sobrantes = Object.keys(CENSO).filter((f) => !encontrados.includes(f));
  assert.deepEqual(sobrantes, [], "el censo nombra un archivo que ya no escribe esas tablas");
});

test("nadie escribe ProductoBase ni ProductoLocal por SQL crudo: el futuro trigger lo vería sin origen", () => {
  const crudos = archivosDeLaApp().filter((f) =>
    /(UPDATE|INSERT\s+INTO)\s+"?Producto(Base|Local)"?\b/i.test(fuente(f))
  );
  assert.deepEqual(crudos, []);
});

test("cada escritor que declara lo hace con el tx y con los orígenes del censo, ni más ni menos", () => {
  for (const [archivo, c] of Object.entries(CENSO)) {
    const texto = fuente(archivo);
    const declaraciones = [...texto.matchAll(/declararOrigenDeCosto\(\s*([A-Za-z_$][\w$]*)\s*,\s*\{\s*origen:\s*ORIGEN_COSTO\.(\w+)/g)];
    const todas = (texto.match(/declararOrigenDeCosto\(/g) || []).length;
    assert.equal(todas, declaraciones.length, `${archivo}: una declaración que no usa ORIGEN_COSTO literal`);
    assert.deepEqual(
      declaraciones.map((m) => m[2]),
      c.declara ?? [],
      `${archivo}: los orígenes declarados no son los del censo`
    );
    for (const m of declaraciones) assert.equal(m[1], "tx", `${archivo}: declara con \`${m[1]}\`, no con el tx`);
  }
});

test("los que heredan tienen exactamente los llamadores del censo", () => {
  for (const [archivo, c] of Object.entries(CENSO)) {
    if (!c.hereda) continue;
    assert.doesNotMatch(fuente(archivo), /declararOrigenDeCosto\(/, `${archivo} hereda: no declara`);
    const llamada = new RegExp(`\\b${c.hereda.funcion}\\(`);
    const llamadores = archivosDeLaApp().filter((f) => f !== archivo && llamada.test(fuente(f)));
    assert.deepEqual(llamadores.sort(), [...c.hereda.llamadores].sort(), `${c.hereda.funcion}: llamador nuevo sin clasificar`);
    for (const l of c.hereda.llamadores) {
      assert.ok(l in CENSO, `${l} llama a ${c.hereda.funcion} y no está en el censo`);
    }
  }
});

test("cada origen del contrato sale de un escritor del censo: no hay nombres adivinados", () => {
  const usados = new Set(Object.values(CENSO).flatMap((c) => c.declara ?? []));
  assert.deepEqual([...usados].sort(), Object.values(ORIGEN_COSTO).sort());
});
