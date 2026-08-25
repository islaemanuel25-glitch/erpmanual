// CANDADOS FUNCIONALES DEL DEPÓSITO: SE EJERCE `mapStockItemDeposito`, NO SE LEE.
//
// ── EL DEFECTO QUE ESTO IMPIDE, Y NO LO ATRAPABA NINGÚN REGEX ─────────────
//
// La rama LOCAL del listado traía `limitesConfiguradosAt` en su `select` y la
// rama DEPÓSITO no. `mapStockItemDeposito` lo recibía `undefined`, y como el
// mapeo pregunta `!= null`, un `undefined` es exactamente igual de válido que un
// null: **todo el depósito quedaba como "límites sin ajustar"**, aunque tuviera
// límites cargados. Y `faltante` no se disparaba nunca, así que la card de "Bajo
// mínimo" contaba bien y la lista mostraba otra cosa.
//
// No fallaba en ningún lado. Un candado que mirara el texto del `route.js`
// tampoco: la línea existía, solo le faltaba un campo adentro. Por eso acá se
// llama a la función con las formas de dato REALES y se mira lo que devuelve.
//
// Los cinco casos son los que el encargo pidió cubrir para depósito.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { mapStockItemDeposito, mapStockItemLocal } from "@/lib/stock/mapItem";
import { estadosDeLaFila, ESTADO_STOCK } from "@/lib/stock/estadosDeStock";
import {
  formatLimiteStock,
  getUnidadDeposito,
  getUnidadLocal,
  presentacionCantidadStock,
} from "@/lib/stock/presentacion";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) =>
  fs.readFileSync(path.join(RAIZ, ruta), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** Una base de depósito mínima pero con la forma real. */
const base = (o = {}) => ({
  id: 10,
  nombre: "Producto de prueba",
  codigo_barra: "779",
  categoria_id: 1,
  proveedor_id: 2,
  area_fisica_id: null,
  unidad_medida: "unidad",
  factor_pack: 1,
  precio_costo: 100,
  precio_venta: 150,
  redondeo_100: false,
  modoCompraProveedor: "UNIDAD",
  pesoReferenciaKg: null,
  pesoEsFijo: false,
  modoVentaDeposito: "UNIDAD",
  ...o,
});
const pl = (o = {}) => ({ id: 55, localId: 1, margen: 50, base: base(), ...o });

/** La fila de stock tal como la devuelve el `select` del listado de depósito. */
const filaStock = (o = {}) => ({
  cantidad: 10,
  stockMin: null,
  stockMax: null,
  limitesConfiguradosAt: null,
  ...o,
});

test("DEP1. LÍMITE 0 CONFIGURADO: llega como 0 y como configurado", () => {
  // El caso que motivó toda la tanda, del lado del depósito.
  const item = mapStockItemDeposito(
    pl(),
    base(),
    filaStock({ cantidad: 5, stockMin: 0, stockMax: 0, limitesConfiguradosAt: new Date("2026-05-21") }),
    1
  );
  assert.equal(item.limitesConfigurados, true, "un 0 configurado se leyó como sin ajustar");
  assert.equal(item.stockMin, 0, "el 0 se aplanó o se perdió");
  assert.equal(item.stockMax, 0);
  assert.ok(
    !estadosDeLaFila(item).includes(ESTADO_STOCK.LIMITES_SIN_AJUSTAR),
    "el depósito manda un 0 deliberado a 'Límites sin ajustar'"
  );
});

test("DEP2. LÍMITE null SIN CONFIGURAR: null de verdad, no 0", () => {
  const item = mapStockItemDeposito(pl(), base(), filaStock({ cantidad: 5 }), 1);
  assert.equal(item.limitesConfigurados, false);
  assert.equal(item.stockMin, null, "un límite sin configurar llegó como 0 y se ve como un mínimo real");
  assert.equal(item.stockMax, null);
  assert.ok(estadosDeLaFila(item).includes(ESTADO_STOCK.LIMITES_SIN_AJUSTAR));
  // Y NO cuenta como faltante: sin mínimo configurado no hay nada por debajo.
  assert.equal(item.faltante, false, "sin mínimo igual dijo faltante");
});

test("DEP3. FALTANTE CONFIGURADO: por debajo del mínimo, y lo dice", () => {
  const item = mapStockItemDeposito(
    pl(),
    base(),
    filaStock({ cantidad: 2, stockMin: 5, stockMax: 50, limitesConfiguradosAt: new Date() }),
    1
  );
  assert.equal(item.faltante, true, "el depósito no marca faltante con límites configurados");
  assert.ok(estadosDeLaFila(item).includes(ESTADO_STOCK.BAJO_MINIMO));
});

test("DEP4. SOBRE MÁXIMO", () => {
  const item = mapStockItemDeposito(
    pl(),
    base(),
    filaStock({ cantidad: 90, stockMin: 5, stockMax: 50, limitesConfiguradosAt: new Date() }),
    1
  );
  assert.ok(estadosDeLaFila(item).includes(ESTADO_STOCK.SOBRE_MAXIMO));
  assert.equal(item.faltante, false);
});

test("DEP5. LA FILA QUE FALTA: sin stock, sin límites y sin explotar", () => {
  // Un producto de depósito sin fila de `StockLocal` todavía. `stock` llega
  // `undefined`, que es como lo entrega un `take: 1` vacío.
  const item = mapStockItemDeposito(pl(), base(), undefined, 1);
  assert.equal(item.stock, 0);
  assert.equal(item.stockMin, null);
  assert.equal(item.limitesConfigurados, false);
  assert.ok(estadosDeLaFila(item).includes(ESTADO_STOCK.SIN_STOCK));
  assert.ok(estadosDeLaFila(item).includes(ESTADO_STOCK.LIMITES_SIN_AJUSTAR));
});

test("DEP6. REPRESENTACIÓN MÓVIL: lo que la tarjeta va a dibujar", () => {
  // ── SE COMPRUEBA EL DATO QUE LA TARJETA RECIBE, NO SU JSX ───────────────
  //
  // La tarjeta muestra "Sin ajustar" cuando `limitesConfigurados` es false y el
  // número cuando es true. Si el mapeo miente, la tarjeta dibuja bien un dato
  // equivocado — que es el modo en que esto llegaba a la pantalla sin fallar.
  const sinAjustar = mapStockItemDeposito(pl(), base(), filaStock(), 1);
  const conCero = mapStockItemDeposito(
    pl(), base(), filaStock({ stockMin: 0, stockMax: 0, limitesConfiguradosAt: new Date() }), 1
  );

  // Lo que decide el texto de la tarjeta, sacado de su propia regla.
  const texto = (valor, configurados) =>
    !configurados ? "Sin ajustar" : valor === null || valor === undefined ? "—" : String(valor);

  assert.equal(texto(sinAjustar.stockMin, sinAjustar.limitesConfigurados), "Sin ajustar");
  assert.equal(
    texto(conCero.stockMin, conCero.limitesConfigurados),
    "0",
    "un 0 configurado se dibujaría como 'Sin ajustar' en el depósito"
  );
});

test("DEP7. DEPÓSITO Y LOCAL CONTESTAN LO MISMO SOBRE LOS LÍMITES", () => {
  // ── LA ASIMETRÍA ERA EL DEFECTO ────────────────────────────────────────
  //
  // Las dos ramas del listado usan mapeos distintos —precio de bulto contra
  // precio unitario— pero los límites son el MISMO dato. Que una rama los leyera
  // y la otra no es justo lo que pasó.
  const s = filaStock({ cantidad: 2, stockMin: 5, stockMax: 50, limitesConfiguradosAt: new Date() });
  const local = mapStockItemLocal(pl(), base(), s);
  const depo = mapStockItemDeposito(pl(), base(), s, 1);

  for (const campo of ["stockMin", "stockMax", "limitesConfigurados", "faltante"]) {
    assert.deepEqual(depo[campo], local[campo], `depósito y local difieren en ${campo}`);
  }
});

test("DEP8. Y EL `select` DEL LISTADO TRAE LA COLUMNA EN LAS DOS RAMAS", () => {
  // Los siete de arriba prueban el mapeo. Éste prueba que el dato LLEGUE: si el
  // `select` no lo pide, Prisma devuelve la fila sin el campo y el mapeo correcto
  // igual contesta mal. Son dos preguntas distintas y las dos hacen falta.
  const listar = leer("app/api/stock_locales/listar/route.js");
  const selects = listar.match(/select: \{ cantidad: true[\s\S]{0,200}?\}/g) || [];
  const conCantidad = listar.match(/cantidad: true, stockMin: true, stockMax: true[^}]*/g) || [];
  assert.ok(conCantidad.length >= 2, `se esperaban 2 selects de stock y hay ${conCantidad.length}`);
  for (const s of conCantidad) {
    assert.match(
      s,
      /limitesConfiguradosAt: true/,
      "una de las dos ramas del listado no trae `limitesConfiguradosAt`: esa mitad va a decir 'sin ajustar' para todo"
    );
  }
});

test("DEP9. UN PACK ROTO SE LEE EN BULTOS + SUELTAS EN DEPÓSITO", () => {
  // El defecto llegó a producción así: Lucky 10 tenía 45 unidades físicas,
  // factor 10, y la tarjeta decía "45 uds" aunque escritorio decía el desglose.
  // Se usa el mapper real para que la prueba tenga la forma que entrega la API.
  const producto = base({ unidad_medida: "pack", factor_pack: 10 });
  const item = mapStockItemDeposito(
    pl({ base: producto }),
    producto,
    filaStock({ cantidad: 45, stockMin: 60, stockMax: 60, limitesConfiguradosAt: new Date() }),
    1
  );

  assert.equal(presentacionCantidadStock(item, true).texto, "4 bultos + 5 uds");
  assert.equal(getUnidadDeposito(item), "Pack x10");
  assert.equal(formatLimiteStock(item.stockMin, item, true), "6");
  assert.equal(formatLimiteStock(item.stockMax, item, true), "6");
});

test("DEP10. EL MISMO PRODUCTO EN UN LOCAL SIGUE MIDIÉNDOSE EN UNIDADES", () => {
  const producto = base({ unidad_medida: "pack", factor_pack: 10 });
  const item = mapStockItemLocal(
    pl({ base: producto }),
    producto,
    filaStock({ cantidad: 45, stockMin: 60, stockMax: 60, limitesConfiguradosAt: new Date() })
  );

  assert.equal(presentacionCantidadStock(item, false).texto, "45 uds");
  assert.equal(getUnidadLocal(item), "Unidad");
  assert.equal(formatLimiteStock(item.stockMin, item, false), "60 uds");
});
