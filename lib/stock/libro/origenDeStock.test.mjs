// CANDADOS DEL ORIGEN DE CADA MOVIMIENTO DEL LIBRO DE STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/origenDeStock.test.mjs
//
// El CENSO de escritores de `StockLocal`: cada archivo que escribe está
// clasificado —declara su origen, o hereda el de su llamador— con la CANTIDAD
// exacta de escrituras de cada tipo. Un escritor nuevo, o una escritura nueva en
// un archivo ya clasificado, lo pone rojo, y con él la pregunta de qué origen le
// toca. Mismo patrón que `lib/precios/origenDeCosto.test.mjs`.
//
// Y el ORDEN: declarar después de escribir no sirve —el trigger ya anotó el
// movimiento con lo que había—, así que se afirma que la declaración va antes.
//
// Que la declaración LLEGUE a `MovimientoStock` en los caminos reales, con la
// referencia correcta y sin filtrarse a otra transacción, lo prueba
// `scripts/pruebas-db/ajusteStockTrazable.mjs` contra PostgreSQL.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { ORIGEN_STOCK, SIN_ORIGEN, ORIGEN_ACTIVACION, motivoDeOrigenInvalido } from "./libroStock.js";
import { FORMA_DEL_ORIGEN } from "../../libros/origenDeTransaccion.js";
import { MOTIVO_DIFERENCIA } from "../motivosDeDiferencia.js";

const sinComentariosJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const fuente = (ruta) => sinComentariosJs(readFileSync(ruta, "utf8"));

// ── EL CATÁLOGO ────────────────────────────────────────────────────────────

test("los orígenes son identificadores estables con la forma del libro, y ninguno es reservado", () => {
  for (const [clave, valor] of Object.entries(ORIGEN_STOCK)) {
    assert.equal(clave, valor);
    assert.match(valor, FORMA_DEL_ORIGEN);
    assert.equal(motivoDeOrigenInvalido(valor), null);
  }
  assert.ok(!Object.values(ORIGEN_STOCK).includes(SIN_ORIGEN));
  assert.ok(!Object.values(ORIGEN_STOCK).includes(ORIGEN_ACTIVACION));
});

// ── EL CENSO ───────────────────────────────────────────────────────────────
//
// Enumerado con `git ls-files --cached --others --exclude-standard` sobre
// `app/`, `lib/` y `components/`, que ve también lo que todavía no se commiteó.
// Los `scripts/` quedan afuera a propósito: son siembras y pruebas, y los que
// corren contra una base real piden el cliente a la fábrica.
//
// Cada entrada:
//
//   escrituras: cuántas hay de cada tipo, medido.
//   declara: los orígenes que declara, en el orden en que aparecen.
//   antesDe: dónde se escribe de verdad, cuando la escritura vive en una
//     función auxiliar definida más arriba en el mismo archivo. Por defecto
//     son las escrituras mismas.
//   hereda: escribe con el `tx` que le pasan; el origen lo declara el
//     llamador, y se listan los llamadores para que uno nuevo no pase sin verse.
//   declaraSinEscribir: no escribe `StockLocal` directo, pero declara el origen
//     de lo que escribe un auxiliar que hereda.

const LLAMADA =
  /\bstockLocal\s*\.\s*(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\s*\(/g;

const CENSO = {
  // ── Declaran y escriben ─────────────────────────────────────────────────
  "app/api/admin/reset-operativo/route.js": {
    escrituras: { "stockLocal.deleteMany": 1 },
    declara: ["RESET_OPERATIVO"],
  },
  "app/api/compras-proveedor/recibir/[id]/route.js": {
    escrituras: { "stockLocal.upsert": 1 },
    declara: ["COMPRA_PROVEEDOR"],
  },
  "app/api/productos/crear/route.js": {
    escrituras: { "stockLocal.createMany": 2 },
    declara: ["ALTA_PRODUCTO"],
  },
  "app/api/productos/eliminar/[id]/route.js": {
    escrituras: { "stockLocal.deleteMany": 1 },
    declara: ["ELIMINACION_PRODUCTO"],
  },
  "app/api/productos/import/apply/route.js": {
    escrituras: { "stockLocal.create": 2, "stockLocal.updateMany": 1 },
    declara: ["IMPORTACION_PRODUCTOS", "IMPORTACION_PRODUCTOS"],
  },
  "app/api/productos/promover-a-deposito/route.js": {
    escrituras: { "stockLocal.createMany": 1 },
    declara: ["PROMOCION_A_DEPOSITO"],
  },
  "app/api/stock_locales/ajustar/route.js": {
    escrituras: { "stockLocal.createMany": 1, "stockLocal.update": 2 },
    declara: ["AJUSTE_MANUAL", "LIMITES_STOCK"],
    // La fila en cero la crea `crearFilaEnCero`, definida arriba: lo que
    // importa es que se la LLAME después de declarar.
    antesDe: [/await crearFilaEnCero\(/g, /tx\.stockLocal\.update\(/g],
  },
  "app/api/stock_locales/importar/route.js": {
    escrituras: { "stockLocal.createMany": 1 },
    declara: ["IMPORTACION_STOCK"],
  },
  "app/api/stock_locales/limites/route.js": {
    escrituras: { "stockLocal.create": 1, "stockLocal.update": 1 },
    declara: ["LIMITES_STOCK"],
    // El `update` de límites no toca cantidad ni tránsito: el Libro no anota
    // nada. Se verifica abajo, en "sin movimiento".
    antesDe: [/tx\.stockLocal\.create\(/g],
    sinMovimiento: 1,
  },
  "app/api/stock_locales/listar/route.js": {
    escrituras: { "stockLocal.createMany": 1 },
    declara: ["ALTA_AL_LISTAR_STOCK"],
  },
  "app/api/stock_locales/nuevo/route.js": {
    escrituras: { "stockLocal.create": 1 },
    declara: ["ALTA_PRODUCTO_DESDE_STOCK"],
  },
  "app/api/transferencias/cancelar/route.js": {
    escrituras: { "stockLocal.updateMany": 1 },
    declara: ["TRANSFERENCIA_CANCELACION"],
  },
  "app/api/transferencias/confirmar-recepcion/route.js": {
    escrituras: { "stockLocal.create": 1, "stockLocal.update": 1, "stockLocal.updateMany": 1, "stockLocal.upsert": 1 },
    declara: ["TRANSFERENCIA_RECEPCION"],
    // `descontarConGuardia` está definida arriba de la ruta.
    antesDe: [/await descontarConGuardia\(/g, /tx\.stockLocal\.create\(/g, /tx\.stockLocal\.upsert\(/g],
  },
  "lib/grupos.js": {
    escrituras: { "stockLocal.createMany": 1 },
    declara: ["HERENCIA_DEL_DEPOSITO"],
  },
  "lib/transferencias/crearTransferencia.js": {
    escrituras: { "stockLocal.upsert": 1 },
    declara: ["TRANSFERENCIA_ENVIO"],
  },

  // ── Heredan ─────────────────────────────────────────────────────────────
  "lib/combos/ventaConsumo.js": {
    escrituras: { "stockLocal.updateMany": 1 },
    hereda: { funcion: "aplicarConsumoStock", llamadores: ["app/api/pos-ventas/crear/route.js"] },
  },
  "lib/pos-ventas/correccionCompletaServer.js": {
    escrituras: { "stockLocal.updateMany": 1 },
    hereda: {
      funcion: "aplicarDeltaStock",
      llamadores: ["app/api/pos-ventas/venta/[id]/corregir/route.js", "lib/pos-ventas/reversionVenta.js"],
    },
  },

  // ── Declaran lo que escribe un auxiliar ─────────────────────────────────
  "app/api/pos-ventas/crear/route.js": {
    escrituras: {},
    declara: ["VENTA"],
    declaraSinEscribir: true,
    antesDe: [/aplicarConsumoStock\(tx/g],
  },
  "app/api/pos-ventas/venta/[id]/corregir/route.js": {
    escrituras: {},
    declara: ["CORRECCION_VENTA"],
    declaraSinEscribir: true,
    antesDe: [/aplicarDeltaStock\(tx/g],
  },
  "lib/pos-ventas/reversionVenta.js": {
    escrituras: {},
    declara: ["ANULACION_VENTA"],
    declaraSinEscribir: true,
    antesDe: [/aplicarDeltaStock\(tx/g],
  },
};

/** El argumento completo de una llamada, paréntesis balanceados, desde su `(`. */
function argumentoDesde(texto, abre) {
  let prof = 0;
  for (let i = abre; i < texto.length; i++) {
    if (texto[i] === "(") prof++;
    else if (texto[i] === ")" && --prof === 0) return texto.slice(abre, i + 1);
  }
  return texto.slice(abre);
}

function escrituras(texto) {
  return [...texto.matchAll(LLAMADA)].map((m) => ({
    clave: `stockLocal.${m[1]}`,
    indice: m.index,
    arg: argumentoDesde(texto, m.index + m[0].length - 1),
  }));
}
const cuentas = (es) => es.reduce((acc, e) => ({ ...acc, [e.clave]: (acc[e.clave] ?? 0) + 1 }), {});
const ordenado = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

const DECLARACION = /declararOrigenDeStock\(\s*([A-Za-z_$][\w$]*)\s*,\s*\{\s*origen:\s*ORIGEN_STOCK\.(\w+)/g;

function archivosDeLaApp() {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app", "lib", "components"],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.test\.mjs$/.test(f));
}

test("el censo de escritores de StockLocal está completo y no tiene sobrantes", () => {
  const archivos = archivosDeLaApp();
  const escriben = archivos.filter((f) => escrituras(fuente(f)).length > 0);
  const sinClasificar = escriben.filter((f) => !(f in CENSO));
  assert.deepEqual(sinClasificar, [], "escritor nuevo de StockLocal: decidí qué origen declara, o de quién lo hereda");
  const sobrantes = Object.entries(CENSO)
    .filter(([f, c]) => !c.declaraSinEscribir && !escriben.includes(f))
    .map(([f]) => f);
  assert.deepEqual(sobrantes, [], "el censo nombra un archivo que ya no escribe StockLocal");
});

test("cada archivo del censo tiene exactamente las escrituras clasificadas, y una clasificación", () => {
  for (const [archivo, c] of Object.entries(CENSO)) {
    assert.deepEqual(
      ordenado(cuentas(escrituras(fuente(archivo)))),
      ordenado(c.escrituras),
      `${archivo}: cambiaron sus escrituras. Revisá si la clasificación todavía las alcanza.`
    );
    assert.ok(c.declara || c.hereda, `${archivo}: sin clasificación`);
  }
});

test("cada declaración usa el tx y un ORIGEN_STOCK literal, y son exactamente las del censo", () => {
  // Se recorren los que declaran Y los del censo: un archivo del censo que
  // dejó de declarar también tiene que ponerse rojo, no saltearse.
  const archivos = new Set([...archivosDeLaApp(), ...Object.keys(CENSO)]);
  for (const f of archivos) {
    // La definición del helper vive en libroStock.js y no es una llamada.
    if (f === "lib/stock/libro/libroStock.js") continue;
    const texto = fuente(f);
    const todas = (texto.match(/declararOrigenDeStock\(/g) || []).length;
    if (todas === 0 && !(f in CENSO)) continue;
    const declaradas = [...texto.matchAll(DECLARACION)];
    assert.ok(f in CENSO, `${f} declara un origen de stock y no está en el censo`);
    assert.equal(todas, declaradas.length, `${f}: una declaración que no usa ORIGEN_STOCK literal`);
    assert.deepEqual(declaradas.map((m) => m[2]), CENSO[f].declara ?? [], `${f}: los orígenes declarados no son los del censo`);
    for (const m of declaradas) assert.equal(m[1], "tx", `${f}: declara con \`${m[1]}\`, no con el tx`);
  }
});

test("la declaración va ANTES de escribir: después, el trigger ya anotó el movimiento", () => {
  for (const [archivo, c] of Object.entries(CENSO)) {
    if (!c.declara) continue;
    const texto = fuente(archivo);
    const primera = texto.search(/declararOrigenDeStock\(/);
    const puntos = c.antesDe
      ? c.antesDe.flatMap((re) => [...texto.matchAll(re)].map((m) => m.index))
      : escrituras(texto).map((e) => e.indice);
    assert.ok(puntos.length > 0, `${archivo}: no se encontró dónde escribe`);
    for (const p of puntos) {
      assert.ok(primera >= 0 && primera < p, `${archivo}: escribe en la posición ${p} antes de declarar su origen`);
    }
  }
});

test("lo marcado 'sin movimiento' no toca cantidad ni tránsito: el Libro no lo anota", () => {
  for (const [archivo, c] of Object.entries(CENSO)) {
    if (!c.sinMovimiento) continue;
    const sinMov = escrituras(fuente(archivo)).filter(
      (e) => /^stockLocal\.update/.test(e.clave) && !/\b(cantidad|enTransito)\s*:/.test(e.arg)
    );
    assert.equal(sinMov.length, c.sinMovimiento, `${archivo}: cambió cuántas escrituras no mueven cantidad`);
  }
});

test("los que heredan no declaran, y tienen exactamente los llamadores del censo, que declaran antes", () => {
  for (const [archivo, c] of Object.entries(CENSO)) {
    if (!c.hereda) continue;
    assert.doesNotMatch(fuente(archivo), /declararOrigenDeStock\(/, `${archivo} hereda: no declara`);
    const llamada = new RegExp(`\\b${c.hereda.funcion}\\(`);
    const llamadores = archivosDeLaApp().filter((f) => f !== archivo && llamada.test(fuente(f)));
    assert.deepEqual(llamadores.sort(), [...c.hereda.llamadores].sort(), `${c.hereda.funcion}: llamador nuevo sin clasificar`);
    for (const l of c.hereda.llamadores) {
      assert.ok(CENSO[l]?.declara?.length, `${l} llama a ${c.hereda.funcion} sin declarar el origen`);
    }
  }
});

test("nadie escribe StockLocal por SQL crudo: el censo no lo vería", () => {
  const crudos = archivosDeLaApp().filter((f) =>
    /(UPDATE|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE(\s+TABLE)?)\s+"?StockLocal"?\b/i.test(fuente(f))
  );
  assert.deepEqual(crudos, []);
});

test("cada origen del catálogo lo declara un escritor del censo: no hay nombres adivinados", () => {
  const usados = new Set(Object.values(CENSO).flatMap((c) => c.declara ?? []));
  assert.deepEqual([...usados].sort(), Object.values(ORIGEN_STOCK).sort());
});

// ── LAS TRANSACCIONES MIXTAS ───────────────────────────────────────────────
//
// Una venta interna consume por VENTA y reserva tránsito por
// TRANSFERENCIA_ENVIO en la MISMA transacción; la cancelación de su remito
// libera el tránsito por TRANSFERENCIA_CANCELACION y devuelve lo vendido por
// ANULACION_VENTA. La configuración es de la transacción: sin volver a declarar,
// el segundo tramo quedaría a nombre del primero.

test("venta interna: VENTA antes del consumo, y crearTransferencia redeclara antes de su tránsito", () => {
  const crear = fuente("app/api/pos-ventas/crear/route.js");
  const iVenta = crear.indexOf("tx.venta.create(");
  const iDecl = crear.search(/declararOrigenDeStock\(tx, \{ origen: ORIGEN_STOCK\.VENTA, referencia: String\(nuevaVenta\.id\) \}\)/);
  const iConsumo = crear.indexOf("aplicarConsumoStock(tx");
  const iTransf = crear.indexOf("await crearTransferencia({");
  assert.ok(iVenta > 0 && iVenta < iDecl, "la venta tiene que existir antes de declararla");
  assert.ok(iDecl < iConsumo, "el consumo se escribe sin su origen");
  assert.ok(iConsumo < iTransf);

  const transf = fuente("lib/transferencias/crearTransferencia.js");
  const iCab = transf.indexOf("tx.transferencia.create(");
  const iDeclT = transf.search(/declararOrigenDeStock\(tx, \{\s*origen: ORIGEN_STOCK\.TRANSFERENCIA_ENVIO,\s*referencia: String\(cabecera\.id\)/);
  const iStock = transf.indexOf("tx.stockLocal.upsert(");
  assert.ok(iCab > 0 && iCab < iDeclT && iDeclT < iStock, "el tránsito quedaría a nombre de la venta");
});

test("cancelación de una venta interna: CANCELACION para el tránsito, y revertirVenta redeclara ANULACION_VENTA", () => {
  const cancelar = fuente("app/api/transferencias/cancelar/route.js");
  const iDecl = cancelar.search(/ORIGEN_STOCK\.TRANSFERENCIA_CANCELACION, referencia: String\(t\.id\)/);
  const iStock = cancelar.indexOf("tx.stockLocal.updateMany(");
  const iRevertir = cancelar.indexOf("await revertirVenta(tx");
  assert.ok(iDecl > 0 && iDecl < iStock && iStock < iRevertir);

  const rev = fuente("lib/pos-ventas/reversionVenta.js");
  const iMarca = rev.indexOf("tx.venta.updateMany(");
  const iRastro = rev.indexOf("tx.ventaCorreccion.create(");
  const iDeclA = rev.search(/ORIGEN_STOCK\.ANULACION_VENTA, referencia: String\(correccion\.id\)/);
  const iDelta = rev.indexOf("aplicarDeltaStock(tx");
  assert.ok(iMarca < iRastro && iRastro < iDeclA && iDeclA < iDelta, "la devolución quedaría a nombre de la cancelación");
});

test("el ajuste manual: la auditoría es el documento, y se escribe antes del origen y del cambio", () => {
  const ruta = fuente("app/api/stock_locales/ajustar/route.js");
  const iLock = ruta.indexOf("await bloquearFila(tx");
  const iAud = ruta.indexOf("tx.auditoriaStock.create(");
  const iDecl = ruta.search(/origen: ORIGEN_STOCK\.AJUSTE_MANUAL,\s*referencia: String\(auditoria\.id\)/);
  const iUpd = ruta.indexOf("tx.stockLocal.update(");
  assert.ok(iLock > 0 && iLock < iAud && iAud < iDecl && iDecl < iUpd);
  assert.match(ruta, /FOR UPDATE/, "sin bloqueo, una venta concurrente se pierde");
  assert.doesNotMatch(ruta, /motivoPrincipal[^\n]*declararOrigenDeStock|declararOrigenDeStock\([^)]*motivo/, "el motivo no se copia al Libro");
});

// ── LA COLUMNA DE LA CAUSA ─────────────────────────────────────────────────

test("el CHECK de AuditoriaStock.motivoPrincipal admite exactamente el vocabulario compartido", () => {
  const sql = readFileSync("prisma/migrations/20260930120000_auditoria_stock_motivo_principal/migration.sql", "utf8");
  const lista = sql.match(/"motivoPrincipal" IN \(([^)]*)\)/)[1];
  const valores = [...lista.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(valores, Object.values(MOTIVO_DIFERENCIA));
  assert.match(sql, /ADD COLUMN "motivoPrincipal" TEXT;/, "la columna tiene que ser nullable: las filas viejas quedan sin causa");
  assert.doesNotMatch(sql, /UPDATE\s+"AuditoriaStock"/i, "no se reconstruyen causas históricas");
});
