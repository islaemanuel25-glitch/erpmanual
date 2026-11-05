// LA REGLA ÚNICA DE UNIDADES, TANDA 6: STOCK. MISMO NÚMERO QUE ANTES, CON LA PIEZA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/unidades/stockConLaPieza.test.mjs
//
// ── DE DÓNDE SALEN LOS NÚMEROS ─────────────────────────────────────────────
//
// De correr las tres rutas reales con el código ANTERIOR, el 2026-11-05, contra
// un Postgres local con seis productos sembrados —en un local y en el depósito—
// para estos casos: pack de 12, pack de 24 con redondeo a 100, sueltos (tercer
// nivel), stock negativo, la ficha contradictoria (compra por UNIDAD con pack
// de 12, de pieza fija) y "unidad" con factor 12. Las rutas: `listar` (que arma
// el ítem con `stock/mapItem`), `obtener` y `buscar-producto`. Después del
// cambio se volvió a pedir lo mismo y las 30 respuestas dieron idénticas; con la
// división rota a propósito, 24 de 30 cambiaban, así que la captura miraba lo
// que tenía que mirar.
//
// La tanda 6 no cambiaba ningún resultado. La TANDA 7 cambia uno solo, a
// propósito, y es el caso E: la ficha de pieza fija con un `factor_pack`
// cargado. Compras la trataba como fiambre (costo por kilo) y stock dividía por
// 12, así que el unitario salía a la doceava parte. Desde la tanda 7 stock lee
// la ficha con `comoViene`, igual que compras, y no divide: E pasa de $750 a
// $9.000 el costo y de $1.000 a $12.000 la venta, en el local. En el depósito
// no cambia, porque ahí ya iba por pieza. Los otros cinco casos siguen dando lo
// mismo que el código anterior a la tanda 6, y son la contraprueba de que un
// pack común no se movió. El caso real que lo destapó, el MANI CON CASCARA X2KG,
// está en `stockPesoFijo.test.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { fromUnidades, precioDeLaUnidadDeStock, toUnidades } from "./reglaDeUnidades.js";
import * as stock from "../conversiones/stock.js";
import { mapStockItemLocal } from "../stock/mapItem.js";
import { precioUnitarioDeObtener, preciosDeVentaDeLaBusqueda } from "../stock/preciosDeStock.js";

/** La ficha de cada caso, con los campos que la base trae para estas rutas. */
const FICHAS = {
  A: { unidad_medida: "pack", factor_pack: 12, precio_costo: 38400, precio_venta: 50000 },
  B: { unidad_medida: "pack", factor_pack: 24, precio_costo: 45600, precio_venta: 60001 },
  C: { unidad_medida: "pack", factor_pack: 12, sueltos_por_unidad: 10, precio_costo: 12000, precio_venta: 15000 },
  D: { unidad_medida: "pack", factor_pack: 12, precio_costo: 24000, precio_venta: 31000 },
  E: { unidad_medida: "kg", factor_pack: 12, modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoReferenciaKg: 0.5, precio_costo: 9000, precio_venta: 12000 },
  F: { unidad_medida: "unidad", factor_pack: 12, precio_costo: 6000, precio_venta: 8000 },
};
const STOCK = { A: 30, B: 49, C: 125, D: -5, E: 7, F: 3 };

// `redondeo_100` en true: es el default de la columna (`@default(true)`) y así
// quedaron los seis productos con que se corrieron las rutas.
function base(caso) {
  return {
    id: 1, nombre: `T6 ${caso}`, codigo_barra: `T6-${caso}`, redondeo_100: true, modoCompraProveedor: "BULTO",
    modoVentaDeposito: "PESO", pesoReferenciaKg: null, pesoEsFijo: false, sueltos_por_unidad: null,
    ...FICHAS[caso],
  };
}
function pl(caso) {
  const b = base(caso);
  return { id: 1, localId: 2, baseId: 1, precio_costo: b.precio_costo, precio_venta: b.precio_venta, margen: null, base: b };
}

test("stock/mapItem (listar, en el local): el mismo stock y los mismos unitarios que el código anterior", () => {
  const esperado = {
    A: [30, 3200, 4200], B: [49, 1900, 2600], C: [125, 1000, 1300],
    // E, desde la tanda 7: sin dividir por el factor (ver el encabezado).
    D: [-5, 2000, 2600], E: [7, 9000, 12000], F: [3, 500, 700],
  };
  for (const [caso, [cantidad, costoUnit, ventaUnit]] of Object.entries(esperado)) {
    const item = mapStockItemLocal(pl(caso), base(caso), { cantidad: STOCK[caso], stockMin: 2, stockMax: 100, limitesConfiguradosAt: null });
    assert.deepEqual([item.stock, item.precioUnitario, item.precioVentaUnitario], [cantidad, costoUnit, ventaUnit], caso);
  }
});

test("stock_locales/obtener: el mismo costo por unidad que el código anterior", () => {
  // E, desde la tanda 7: sin dividir por el factor (ver el encabezado).
  const esperado = { A: 3200, B: 1900, C: 1000, D: 2000, E: 9000, F: 6000 };
  for (const [caso, costoUnit] of Object.entries(esperado)) {
    assert.equal(Number(precioUnitarioDeObtener(pl(caso)).precioUnitario.toFixed(2)), costoUnit, caso);
  }
});

test("stock_locales/buscar-producto: los mismos precios de venta que el código anterior, en el local y en el depósito", () => {
  // [unitario, bulto, unidad de medida] — en el local (id 2) y en el depósito (id 1).
  const enElLocal = {
    A: [4200, 50000, "pack"], B: [2600, 60001, "pack"], C: [1300, 15000, "pack"],
    // E, desde la tanda 7: el kilo vale lo que dice la ficha, sin dividir.
    D: [2600, 31000, "pack"], E: [12000, 12000, "kg"], F: [8000, 8000, "unidad"],
  };
  const enElDeposito = { ...enElLocal, E: [6000, 6000, "unidad"] };
  for (const [esDeposito, esperado] of [[false, enElLocal], [true, enElDeposito]]) {
    for (const [caso, [unitario, bulto, unidad]] of Object.entries(esperado)) {
      const r = preciosDeVentaDeLaBusqueda(pl(caso), esDeposito);
      assert.deepEqual([r.precioVentaUnitario, r.precioVentaBulto, r.unidadMedida], [unitario, bulto, unidad], `${caso}, depósito ${esDeposito}`);
    }
  }
});

test("LAS RUTAS CORREN ESA MISMA CUENTA, NO UNA COPIA", () => {
  const sinComentarios = (rel) =>
    fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const obtener = sinComentarios("app/api/stock_locales/obtener/route.js");
  assert.match(obtener, /precioUnitarioDeObtener\(pl\)/);
  assert.ok(!/\/\s*factorPack/.test(obtener), "obtener volvió a dividir a mano");
  const buscar = sinComentarios("app/api/stock_locales/buscar-producto/route.js");
  assert.match(buscar, /preciosDeVentaDeLaBusqueda\(pl, esDeposito\)/);
  assert.ok(!/\/\s*factorPack/.test(buscar), "buscar-producto volvió a dividir a mano");
  assert.ok(!/\/\s*factor\b/.test(sinComentarios("lib/stock/mapItem.js")), "mapItem volvió a dividir a mano");
});

test("EL CONVERSOR DE CANTIDADES DEL STOCK ESTÁ EN LA PIEZA Y ES EL MISMO, NO UNA COPIA", () => {
  assert.equal(toUnidades, stock.toUnidades);
  assert.equal(fromUnidades, stock.fromUnidades);
  // Pack de 12 y de 24, negativo y sueltos, con el conversor de la pieza.
  assert.equal(toUnidades({ cantidad: 2, unidad: "BULTO", factorPack: 12 }), 24);
  assert.equal(toUnidades({ cantidad: 3, unidad: "BULTO", factorPack: 24 }), 72);
  assert.deepEqual(fromUnidades({ unidades: 30, factorPack: 12 }), stock.fromUnidades({ unidades: 30, factorPack: 12 }));
  assert.deepEqual(fromUnidades({ unidades: -5, factorPack: 12 }), stock.fromUnidades({ unidades: -5, factorPack: 12 }));
  assert.deepEqual(fromUnidades({ unidades: 125, factorPack: 12, sueltosPorUnidad: 10 }), stock.fromUnidades({ unidades: 125, factorPack: 12, sueltosPorUnidad: 10 }));
  // Y desde la tanda 7 la división del unitario lee la ficha como compras: el
  // fiambre con pack de 12 no divide; el pack común de 12, sí.
  assert.equal(precioDeLaUnidadDeStock({ precio: 9000, base: base("E") }), 9000);
  assert.equal(precioDeLaUnidadDeStock({ precio: 38400, base: base("A") }), 3200);
});
