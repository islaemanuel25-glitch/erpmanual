// CANDADOS DE CÓMO SE ESCRIBE EL STOCK CON TERCER NIVEL DE EMPAQUE (tanda 7 —
// docs/roadmap/tercer-nivel-empaque.md).
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/stockEnTresNiveles.test.mjs
//
// La regla de Emanuel: el stock nunca se muestra en la unidad más chica pelada.
// En el depósito "1 cartón"; en el local "10 atados", y si se abrió uno "9 atados
// y 15 sueltos". El suelto aparece solo como RESTO: "15 sueltos" solo cuando no
// hay un atado entero; "200 sueltos" no se escribe nunca.
//
// Y lo que no cambia: un producto sin sueltos se escribe EXACTAMENTE como hoy.

import test from "node:test";
import assert from "node:assert/strict";

import {
  formatLimiteStock,
  pluralDe,
  presentacionCantidadStock,
  textoDeStockEnTresNiveles,
} from "./presentacion.js";
import { fromUnidades } from "../conversiones/stock.js";

// El cartón de 10 atados de 20 cigarrillos, con sus nombres.
const CIGARRILLOS = { factorPack: 10, unidadMedida: "pack", sueltosPorUnidad: 20, nombreUnidad: "atado", nombreBulto: "cartón" };
const con = (stock) => ({ ...CIGARRILLOS, stock });

test("200 sueltos: \"1 cartón\" en el depósito y \"10 atados\" en el local", () => {
  assert.equal(textoDeStockEnTresNiveles(con(200), true), "1 cartón");
  assert.equal(textoDeStockEnTresNiveles(con(200), false), "10 atados");
});

test("195 sueltos: \"9 atados y 15 sueltos\", en el local y en el depósito (no llega a un cartón)", () => {
  assert.equal(textoDeStockEnTresNiveles(con(195), false), "9 atados y 15 sueltos");
  assert.equal(textoDeStockEnTresNiveles(con(195), true), "9 atados y 15 sueltos");
});

test("15 sueltos: \"15 sueltos\", porque no hay un atado entero", () => {
  assert.equal(textoDeStockEnTresNiveles(con(15), false), "15 sueltos");
  assert.equal(textoDeStockEnTresNiveles(con(1), false), "1 suelto");
});

test("el suelto NUNCA es el total: en ningún stock aparece más de 19 sueltos", () => {
  for (let s = 0; s <= 1000; s++) {
    for (const deposito of [true, false]) {
      const texto = textoDeStockEnTresNiveles(con(s), deposito);
      const m = /(\d+) sueltos?$/.exec(texto);
      assert.ok(!m || Number(m[1]) < 20, `${s} se escribió "${texto}"`);
    }
  }
});

test("los tres niveles juntos, el cero, el negativo y el singular", () => {
  assert.equal(textoDeStockEnTresNiveles(con(230), true), "1 cartón, 1 atado y 10 sueltos");
  assert.equal(textoDeStockEnTresNiveles(con(400), true), "2 cartones");
  assert.equal(textoDeStockEnTresNiveles(con(20), false), "1 atado");
  assert.equal(textoDeStockEnTresNiveles(con(0), true), "0 cartones");
  assert.equal(textoDeStockEnTresNiveles(con(0), false), "0 atados");
  assert.equal(textoDeStockEnTresNiveles(con(-25), false), "-1 atado y 5 sueltos");
});

test("sin nombres cargados: el bulto es \"bulto\" y la unidad \"unidad\"", () => {
  const sinNombres = { ...con(230), nombreUnidad: null, nombreBulto: "  " };
  assert.equal(textoDeStockEnTresNiveles(sinNombres, true), "1 bulto, 1 unidad y 10 sueltos");
  assert.equal(textoDeStockEnTresNiveles({ ...sinNombres, stock: 200 }, false), "10 unidades");
});

test("el plural en castellano de los nombres que cargue la ficha", () => {
  const casos = { cartón: "cartones", atado: "atados", caja: "cajas", unidad: "unidades", pack: "packs", bulto: "bultos", paquete: "paquetes", "pack de 10": "packs de 10", lápiz: "lápices" };
  for (const [singular, plural] of Object.entries(casos)) assert.equal(pluralDe(singular), plural);
});

test("presentacionCantidadStock y formatLimiteStock escriben en tres niveles con sueltos", () => {
  assert.deepEqual(presentacionCantidadStock(con(195), false), { esDesglose: false, bultos: 0, sueltas: 0, texto: "9 atados y 15 sueltos" });
  assert.equal(formatLimiteStock(40, CIGARRILLOS, false), "2 atados");
  assert.equal(formatLimiteStock(null, CIGARRILLOS, false), null);
});

test("fromUnidades en tres niveles: 230 sueltos son 1 cartón, 1 atado y 10 sueltos", () => {
  assert.deepEqual(fromUnidades({ unidades: 230, factorPack: 10, sueltosPorUnidad: 20 }), { bultos: 1, sueltas: 1, sueltos: 10, totalUnidades: 230 });
  assert.deepEqual(fromUnidades({ unidades: 195, factorPack: 1, sueltosPorUnidad: 20 }), { bultos: 0, sueltas: 9, sueltos: 15, totalUnidades: 195 });
});

// ── CONTRAPRUEBA: SIN SUELTOS NADA CAMBIA ──────────────────────────────────

test("CONTRAPRUEBA: sin sueltos no hay texto de tres niveles, y cada superficie escribe lo de hoy", () => {
  const pack = { factorPack: 10, unidadMedida: "pack", stock: 45 };
  assert.equal(textoDeStockEnTresNiveles(pack, true), null);
  assert.equal(textoDeStockEnTresNiveles({ ...pack, sueltosPorUnidad: 1 }, true), null, "un 1 escrito es como el vacío");
  // El kilo no tiene sueltos aunque la columna dijera un número.
  assert.equal(textoDeStockEnTresNiveles({ stock: 2.5, unidadMedida: "kg", sueltosPorUnidad: 20 }, false), null);

  assert.equal(presentacionCantidadStock(pack, true).texto, "4 bultos + 5 uds");
  assert.equal(presentacionCantidadStock(pack, false).texto, "45 uds");
  assert.equal(formatLimiteStock(40, pack, true), "4");
  // Y fromUnidades sin sueltos devuelve el objeto de siempre, sin la clave nueva.
  assert.deepEqual(fromUnidades({ unidades: 45, factorPack: 10 }), { bultos: 4, sueltas: 5, totalUnidades: 45 });
});

test("CONTRAPRUEBA: los nombres del producto mandan; sin ellos no aparece ningún \"cartón\"", () => {
  assert.doesNotMatch(textoDeStockEnTresNiveles({ ...con(200), nombreBulto: null }, true), /cartón/);
  assert.equal(textoDeStockEnTresNiveles({ ...con(200), nombreBulto: "caja grande" }, true), "1 caja grande");
});
