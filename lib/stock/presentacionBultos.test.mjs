// CANDADO: "1 BULTO", NO "1 BULTOS", EN TODO STOCK LOCALES Y EL VALOR DEL STOCK.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/presentacionBultos.test.mjs
//
// El cambio es SOLO de la palabra: el número, el signo y el desglose en bultos +
// sueltas siguen saliendo de `fromUnidades`, igual que antes. Había tres lugares
// de Stock Locales que escribían "N bultos" por su cuenta; ahora los tres usan la
// regla de `lib/stock/presentacion.js`. Los que leen código lo leen sin
// comentarios (regla 5).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { palabraDeBultos, presentacionCantidadStock, textoDeBultos } from "@/lib/stock/presentacion";

const pack12 = (stock) => ({ stock, unidadMedida: "pack", factorPack: 12 });
const sinComentarios = (t) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

test("1 bulto, 2 bultos, y el negativo también en singular", () => {
  assert.equal(presentacionCantidadStock(pack12(12), true).texto, "1 bulto");
  assert.equal(presentacionCantidadStock(pack12(14), true).texto, "1 bulto + 2 uds");
  assert.equal(presentacionCantidadStock(pack12(24), true).texto, "2 bultos");
  assert.equal(presentacionCantidadStock(pack12(-12), true).texto, "-1 bulto");
  assert.equal(presentacionCantidadStock(pack12(-26), true).texto, "-2 bultos + -2 uds");
  assert.deepEqual([textoDeBultos(1), textoDeBultos(0.5), textoDeBultos(3)], ["1 bulto", "0.5 bultos", "3 bultos"]);
});

test("la palabra no cambia el número: bultos y sueltas son los de siempre", () => {
  const p = presentacionCantidadStock(pack12(14), true);
  assert.deepEqual([p.esDesglose, p.bultos, p.sueltas], [true, 1, 2]);
  // En un local un pack sigue en unidades: no hay bultos que nombrar.
  assert.equal(presentacionCantidadStock(pack12(12), false).texto, "12 uds");
});

test("la tabla y el modal de ajuste de Stock Locales usan la misma regla, no su propio 'bultos'", () => {
  const tabla = sinComentarios(readFileSync("components/stock_locales/TablaStock.jsx", "utf8"));
  assert.match(tabla, /palabraDeBultos\(bultos\)/);
  assert.doesNotMatch(tabla, /\{bultos\} bultos/);
  const modal = sinComentarios(readFileSync("components/stock_locales/ModalAjuste.jsx", "utf8"));
  assert.match(modal, /textoDeBultos\(bultos\)/);
  assert.doesNotMatch(modal, /\$\{bultos\} bultos/);
  assert.equal(palabraDeBultos(1), "bulto");
});
