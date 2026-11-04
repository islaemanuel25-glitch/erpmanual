// CANDADOS DE LA CARGA MANUAL CON TERCER NIVEL DE EMPAQUE (tanda 6 —
// docs/roadmap/tercer-nivel-empaque.md).
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/cargaEnSueltos.test.mjs
//
// El ajuste, los límites y el conteo de un control aceptan "unidades + sueltos"
// por una sola pieza del embudo, `cantidadDeStockDeUnaCarga`. Lo que esa pieza
// promete, y sobre todo lo que NO cambia: un producto sin el dato acepta
// exactamente lo de hoy. El camino por las rutas, contra Postgres, lo recorre
// `scripts/pruebas-db/tercerNivelEmpaque.mjs` (secciones E y F).

import test from "node:test";
import assert from "node:assert/strict";

import {
  cantidadDeStockDeUnaCarga,
  esCargaEnSueltos,
  TEXTO_CARGA_DOBLE,
  TEXTO_CARGA_INVALIDA,
  TEXTO_CARGA_SIN_SUELTOS,
} from "../conversiones/stock.js";
import { interpretarLimite, interpretarLimiteDeUnaCarga, ACCION_LIMITE } from "./limites.js";

const CON = { sueltos_por_unidad: 20, unidad_medida: "pack" };
const SIN = { sueltos_por_unidad: null, unidad_medida: "pack" };

test("9 atados y 15 sueltos son 195", () => {
  assert.deepEqual(cantidadDeStockDeUnaCarga({ unidades: 9, sueltos: 15, base: CON }), { ok: true, cantidad: 195 });
  assert.deepEqual(cantidadDeStockDeUnaCarga({ unidades: 10, base: CON }), { ok: true, cantidad: 200 }, "sin sueltos es cero");
  assert.deepEqual(cantidadDeStockDeUnaCarga({ sueltos: 7, base: CON }), { ok: true, cantidad: 7 }, "sin unidades es cero");
});

test("la cantidad de siempre pasa TAL CUAL, con o sin sueltos en la ficha", () => {
  for (const cantidad of [undefined, null, "", 0, 5, "12.5", -3, "abc"]) {
    assert.deepEqual(cantidadDeStockDeUnaCarga({ cantidad, base: SIN }), { ok: true, cantidad }, `cantidad=${cantidad}`);
    assert.deepEqual(cantidadDeStockDeUnaCarga({ cantidad, base: CON }), { ok: true, cantidad });
  }
});

test("los rechazos dicen qué pasó", () => {
  assert.deepEqual(cantidadDeStockDeUnaCarga({ unidades: 9, sueltos: 15, base: SIN }), { ok: false, error: TEXTO_CARGA_SIN_SUELTOS });
  assert.deepEqual(cantidadDeStockDeUnaCarga({ cantidad: 195, unidades: 9, base: CON }), { ok: false, error: TEXTO_CARGA_DOBLE });
  for (const [u, s] of [[1.5, 0], [-1, 0], [1, 2.5], [1, -2], ["a", 0]]) {
    assert.deepEqual(cantidadDeStockDeUnaCarga({ unidades: u, sueltos: s, base: CON }), { ok: false, error: TEXTO_CARGA_INVALIDA }, `u=${u} s=${s}`);
  }
  // El kilo no tiene sueltos, aunque la columna dijera un número.
  assert.equal(cantidadDeStockDeUnaCarga({ unidades: 1, base: { sueltos_por_unidad: 20, unidad_medida: "kg" } }).ok, false);
});

test("un límite en unidades + sueltos se guarda en sueltos; cualquier otra forma es la de siempre", () => {
  assert.deepEqual(interpretarLimiteDeUnaCarga({ unidades: 30, sueltos: 5 }, CON), { accion: ACCION_LIMITE.FIJAR, valor: 605 });
  for (const crudo of [undefined, null, "", 0, 40, "abc"]) {
    assert.deepEqual(interpretarLimiteDeUnaCarga(crudo, SIN), interpretarLimite(crudo), `crudo=${crudo}`);
  }
  assert.deepEqual(interpretarLimiteDeUnaCarga({ unidades: 2 }, SIN), { error: TEXTO_CARGA_SIN_SUELTOS });
});

test("esCargaEnSueltos solo reconoce un objeto con unidades o sueltos", () => {
  assert.equal(esCargaEnSueltos({ unidades: 0 }), true);
  assert.equal(esCargaEnSueltos({ sueltos: 3 }), true);
  for (const v of [undefined, null, 5, "5", {}, { cantidad: 5 }]) assert.equal(esCargaEnSueltos(v), false);
});
