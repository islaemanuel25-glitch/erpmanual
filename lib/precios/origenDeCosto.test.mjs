// CANDADOS DEL ORIGEN DE LAS ESCRITURAS DE COSTO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/precios/origenDeCosto.test.mjs
//
// Dos cosas:
//
//   1. el helper: declara con set_config LOCAL, por el mecanismo compartido con
//      el libro físico, y una declaración mal hecha NO lanza —no puede frenar
//      una escritura de costo—;
//   2. el CENSO de escritores de todo lo que el Libro de Costos va a versionar
//      —altas, cambios y bajas de ProductoBase y ProductoLocal, el cambio de
//      `Local.es_deposito` y la baja de un Grupo, que arrastra sus bases—: cada
//      archivo que escribe está clasificado —declara, hereda de su llamador,
//      queda SIN_ORIGEN con su motivo, o escribe sin cambio para el Libro—, y
//      con la CANTIDAD exacta de escrituras de cada tipo. Un escritor nuevo, o
//      una escritura nueva en un archivo ya clasificado, lo pone rojo, y con él
//      la pregunta de qué origen le toca.
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

// ── EL CENSO DE LO QUE EL LIBRO DE COSTOS VA A VERSIONAR ───────────────────
//
// Enumerado con `git ls-files --cached --others --exclude-standard`, que ve lo
// que todavía no se commiteó, sobre `app/`, `lib/` y `components/`. Los
// `scripts/` quedan afuera a propósito: son siembras y pruebas, no escritores
// de la aplicación, y los que corren contra una base real piden el cliente a la
// fábrica.
//
// Qué cuenta como escritura del Libro:
//
//   - toda alta, cambio o baja de ProductoBase y de ProductoLocal —costo,
//     escala, a qué local o base pertenece la fila—;
//   - un alta o cambio de Local que escriba `es_deposito`: cambia la escala del
//     fiambre fijo de todas las filas de ese local;
//   - la baja de un Grupo: la clave de ProductoBase es ON DELETE CASCADE.
//
// No cuenta la baja de un Local: la clave de ProductoLocal es ON DELETE
// RESTRICT, así que un local con filas no se puede borrar y uno sin filas no
// tiene nada que el Libro registre.
//
// Cada archivo lleva la CANTIDAD exacta de escrituras de cada tipo. Así una
// escritura nueva en un archivo ya clasificado también se pone roja: el origen
// se decide por transacción, y la clasificación vieja puede no alcanzarla.

const LLAMADA =
  /\b(productoBase|productoLocal|local|grupo)\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/g;

/** El argumento completo de una llamada, paréntesis balanceados, desde su `(`. */
function argumentoDesde(texto, abre) {
  let prof = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "(") prof++;
    else if (texto[i] === ")" && --prof === 0) return texto.slice(abre, i + 1);
  }
  return texto.slice(abre);
}

/** Las escrituras que le importan al Libro, con el texto de su argumento. */
function escriturasDelLibro(texto) {
  const salida = [];
  for (const m of texto.matchAll(LLAMADA)) {
    const [, modelo, op] = m;
    const arg = argumentoDesde(texto, m.index + m[0].length - 1);
    const esBaja = op === "delete" || op === "deleteMany";
    if (modelo === "local" && (esBaja || !/\bes_deposito\b/.test(arg))) continue;
    if (modelo === "grupo" && !esBaja) continue;
    salida.push({ clave: `${modelo}.${op}`, arg });
  }
  return salida;
}

const cuentas = (escrituras) =>
  escrituras.reduce((acc, e) => ({ ...acc, [e.clave]: (acc[e.clave] ?? 0) + 1 }), {});
const ordenado = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

// Los campos que el Libro versiona, más los que dicen a qué fila pertenece un
// costo. Una escritura "sin cambio para el Libro" no puede tocar ninguno.
const CAMPOS_DEL_LIBRO =
  /\b(precio_costo|factor_pack|unidad_medida|pesoReferenciaKg|pesoEsFijo|modoCompraProveedor|modoVentaDeposito|es_combo|baseId|localId|es_deposito)\s*:/;

// Cada entrada:
//
//   escrituras: cuántas hay de cada tipo, medido.
//   declara: los orígenes que declara, uno por transacción que escribe.
//   hereda: escribe con el `db`/`tx` que le pasan; el origen es el del llamador,
//     y se listan los llamadores para que uno nuevo no pase sin verse.
//   sinOrigen: lo que escribe sin poder declarar sin cambiar su estructura
//     transaccional. Queda SIN_ORIGEN, que es válido. El motivo es parte del dato.
//   sinCambio: lo que escribe esas tablas sin nada que el Libro registre.
//     Con `verificable: true`, el candado comprueba que ninguna escritura del
//     archivo toca un campo del Libro.
const CENSO = {
  // ── Declaran ─────────────────────────────────────────────────────────────
  "app/api/compras-proveedor/recibir/[id]/route.js": {
    escrituras: { "productoBase.update": 1, "productoLocal.create": 1 },
    declara: ["COMPRA_PROVEEDOR"],
  },
  "app/api/productos/crear/route.js": {
    escrituras: { "productoBase.create": 2, "productoLocal.createMany": 2 },
    declara: ["ALTA_PRODUCTO"],
  },
  "app/api/productos/import/apply/route.js": {
    escrituras: {
      "productoBase.create": 1,
      "productoBase.update": 1,
      "productoLocal.create": 2,
      "productoLocal.update": 1,
    },
    declara: ["IMPORTACION_PRODUCTOS", "IMPORTACION_PRODUCTOS"],
  },
  "app/api/productos/precios/apply/route.js": {
    escrituras: { "productoBase.updateMany": 1, "productoLocal.update": 1, "productoLocal.updateMany": 1 },
    declara: ["ACTUALIZACION_MASIVA_PRECIOS"],
  },
  "app/api/productos/promover-a-deposito/route.js": {
    escrituras: { "productoBase.update": 1, "productoLocal.createMany": 1 },
    declara: ["PROMOCION_A_DEPOSITO"],
  },
  "app/api/proveedores/listas/[id]/aplicar/route.js": {
    escrituras: { "productoBase.update": 1, "productoLocal.update": 1 },
    declara: ["LISTA_PROVEEDOR_APLICAR"],
  },
  "app/api/proveedores/listas/[id]/revertir/route.js": {
    escrituras: { "productoBase.update": 1, "productoLocal.update": 1 },
    declara: ["LISTA_PROVEEDOR_REVERTIR"],
  },
  "app/api/stock_locales/nuevo/route.js": {
    escrituras: { "productoBase.create": 1, "productoLocal.create": 1 },
    declara: ["ALTA_PRODUCTO_DESDE_STOCK"],
  },
  "app/api/stock_locales/importar/route.js": {
    escrituras: { "productoBase.createMany": 1, "productoLocal.createMany": 1 },
    declara: ["IMPORTACION_STOCK"],
    sinOrigen:
      "Los ProductoLocal se crean con el cliente raíz después de la transacción de las bases. Meterlos adentro cambia la atomicidad de la importación.",
  },
  "app/api/transferencias/confirmar-recepcion/route.js": {
    escrituras: { "productoLocal.create": 1 },
    declara: ["ALTA_POR_TRANSFERENCIA_RECEPCION"],
  },
  "app/api/productos/eliminar/[id]/route.js": {
    escrituras: { "productoBase.delete": 1, "productoLocal.deleteMany": 1 },
    declara: ["ELIMINACION_PRODUCTO"],
  },
  "app/api/admin/reset-operativo/route.js": {
    escrituras: { "productoBase.deleteMany": 1, "productoLocal.deleteMany": 1 },
    declara: ["RESET_OPERATIVO"],
  },
  "lib/combos/service.js": {
    escrituras: {
      "productoBase.create": 1,
      "productoBase.update": 2,
      "productoLocal.create": 1,
      "productoLocal.update": 3,
    },
    declara: ["COMBO_ALTA", "COMBO_EDICION"],
    sinCambio:
      "Desactivar un combo reescribe `es_combo: true` como defensa —un combo ya lo es, así que no cambia— y el `activo` de su ProductoLocal; `cambiarEstadoCombo` solo toca `activo`.",
  },
  "lib/grupos.js": {
    escrituras: { "productoLocal.createMany": 1 },
    declara: ["HERENCIA_DEL_DEPOSITO"],
  },
  "lib/transferencias/crearTransferencia.js": {
    escrituras: { "productoLocal.upsert": 1 },
    declara: ["ALTA_POR_TRANSFERENCIA_ENVIO"],
  },

  // ── Heredan ──────────────────────────────────────────────────────────────
  "lib/compras-proveedor/costoMaestro.js": {
    escrituras: { "productoBase.update": 1 },
    hereda: { funcion: "actualizarCostoRealProducto", llamadores: ["app/api/compras-proveedor/recibir/[id]/route.js"] },
  },
  "lib/precios/propagarCostoALocales.js": {
    escrituras: { "productoLocal.update": 1 },
    hereda: {
      funcion: "propagarCostoALocales",
      llamadores: ["app/api/productos/editar/[id]/route.js", "lib/compras-proveedor/costoMaestro.js"],
    },
  },

  // ── Quedan SIN_ORIGEN ────────────────────────────────────────────────────
  "app/api/productos/editar/[id]/route.js": {
    escrituras: {
      "productoBase.update": 2,
      "productoLocal.create": 1,
      "productoLocal.update": 2,
      "productoLocal.updateMany": 4,
    },
    sinOrigen:
      "El editor escribe con el cliente raíz, sin transacción: la base con su costo y su escala, la propagación, la alineación del dueño y el costo propio de un local son sentencias sueltas. Envolverlas cambia su atomicidad.",
  },
  "app/api/stock_locales/listar/route.js": {
    escrituras: { "productoLocal.createMany": 1 },
    sinOrigen: "El autocompletado de ProductoLocal faltantes al listar es un createMany suelto con el cliente raíz.",
  },
  "app/api/locales/[id]/route.js": {
    escrituras: { "local.update": 1 },
    sinOrigen:
      "Cambiar un local a depósito o al revés es un `local.update` suelto con el cliente raíz. Declarar exige envolverlo en una transacción.",
  },
  "app/api/grupos/[id]/route.js": {
    escrituras: { "grupo.delete": 1 },
    sinOrigen:
      "Borrar un grupo es un `grupo.delete` suelto con el cliente raíz; la cascada de la base borra sus ProductoBase sin ProductoLocal. Declarar exige envolverlo en una transacción.",
  },

  // ── Sin cambio para el Libro ─────────────────────────────────────────────
  "app/api/productos/precio-revisado/route.js": {
    escrituras: { "productoLocal.updateMany": 1 },
    sinCambio: "Solo marca precioRevisadoAt.",
    verificable: true,
  },
  "app/api/locales/route.js": {
    escrituras: { "local.create": 1 },
    sinCambio:
      "El alta de un local fija `es_deposito`, pero un local nuevo no tiene ProductoLocal: el Libro versiona el CAMBIO de tipo sobre sus filas, no el alta. Las filas que hereda llegan con HERENCIA_DEL_DEPOSITO.",
  },
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

test("el censo de escritores del Libro está completo y no tiene sobrantes", () => {
  const encontrados = archivosDeLaApp().filter((f) => escriturasDelLibro(fuente(f)).length > 0);
  const sinClasificar = encontrados.filter((f) => !(f in CENSO));
  assert.deepEqual(sinClasificar, [], "escritor nuevo: decidí qué origen declara, o por qué queda SIN_ORIGEN");
  const sobrantes = Object.keys(CENSO).filter((f) => !encontrados.includes(f));
  assert.deepEqual(sobrantes, [], "el censo nombra un archivo que ya no escribe nada del Libro");
});

test("cada archivo del censo tiene exactamente las escrituras clasificadas, y al menos una clasificación", () => {
  for (const [archivo, c] of Object.entries(CENSO)) {
    assert.deepEqual(
      ordenado(cuentas(escriturasDelLibro(fuente(archivo)))),
      ordenado(c.escrituras),
      `${archivo}: cambiaron sus escrituras. Revisá si la clasificación todavía las alcanza y actualizá las cantidades.`
    );
    assert.ok(c.declara || c.hereda || c.sinOrigen || c.sinCambio, `${archivo}: sin clasificación`);
    for (const motivo of [c.sinOrigen, c.sinCambio]) {
      if (motivo !== undefined) assert.ok(typeof motivo === "string" && motivo.length > 20, `${archivo}: el motivo es parte del dato`);
    }
  }
});

test("lo que se declara 'sin cambio' y verificable no toca ningún campo del Libro", () => {
  for (const [archivo, c] of Object.entries(CENSO)) {
    if (!c.verificable) continue;
    for (const { clave, arg } of escriturasDelLibro(fuente(archivo))) {
      const desdeData = arg.slice(arg.search(/\bdata\s*:/));
      assert.match(desdeData, /^data\s*:\s*\{/, `${archivo} ${clave}: el data no es literal, no se puede verificar`);
      assert.doesNotMatch(desdeData, CAMPOS_DEL_LIBRO, `${archivo} ${clave}: toca un campo del Libro`);
    }
  }
});

test("ningún ProductoLocal cambia de local ni de base: si aparece, se clasifica aparte", () => {
  const revinculan = [];
  for (const f of archivosDeLaApp()) {
    for (const { clave, arg } of escriturasDelLibro(fuente(f))) {
      if (!/^productoLocal\.update/.test(clave)) continue;
      const desdeData = arg.slice(Math.max(0, arg.search(/\bdata\s*:/)));
      if (/\b(baseId|localId)\s*:/.test(desdeData)) revinculan.push(`${f} ${clave}`);
    }
  }
  assert.deepEqual(revinculan, [], "re-vincular una fila es una BAJA y un ALTA para el Libro: decidí su origen");
});

test("nadie escribe esas tablas por SQL crudo: el futuro trigger lo vería sin origen y el censo no", () => {
  const crudos = archivosDeLaApp().filter((f) =>
    /(UPDATE|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE(\s+TABLE)?)\s+"?(Producto(Base|Local)|Local|Grupo)"?\b/i.test(fuente(f))
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
