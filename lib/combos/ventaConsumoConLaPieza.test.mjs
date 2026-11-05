// TANDA 15 DE LA REGLA ÚNICA DE UNIDADES: LA VENTA CON COMBO (`ventaConsumo`)
// TOMA EL COSTO DE RESPALDO CON LA PIEZA Y CONSUME LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/combos/ventaConsumoConLaPieza.test.mjs
//
// La huella es de la venta corrida con el código anterior a la tanda 15
// (`lib/unidades/tanda15Arnes.mjs`): un combo con un componente de cada ficha y
// una línea suelta de cada una, en un local y en el depósito, con y sin costo del
// cliente. Las líneas comerciales y el consumo de stock consolidado.
//
// ── LA CONTRADICCIÓN QUE QUEDA ─────────────────────────────────────────────
//
// Sin costo del cliente, el maní 1881 toma de respaldo 3.000 ÷ 2 = 1.500, con su
// `factor_pack` crudo; es la misma cuenta que la corrección de una venta (tanda
// 14). Se fija como está.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ventas, huella } from "../unidades/tanda15Arnes.mjs";

test("la venta con combo cobra, costea y consume lo mismo que antes de la tanda 15", async () => {
  assert.equal(huella(await ventas()), "5e9bee27c096ae72b566f6ad2daacef00f11504f6cea79e018ee06ae5470e56d");
});

test("los casos de la tanda: el costo del combo, el respaldo y el consumo del depósito", async () => {
  const v = await ventas();
  assert.equal(v["true|false"].lineasComerciales[0].costoUnitario, 53200, "el combo en el depósito");
  assert.equal(v["false|false"].lineasComerciales[0].costoUnitario, 26200, "el combo en un local");
  const respaldo = Object.fromEntries(v["false|false"].lineasComerciales.slice(1).map((l) => [l.nombre, l.costoUnitario]));
  assert.deepEqual(respaldo, { pack12: 3200, sueltos: 12000, kilo: 8000, fiambrePieza: 9000, mani1881: 1500, kgPack: 1500, unidad12: 500 });
  const consumo = Object.fromEntries(v["true|false"].consumoFisicoConsolidado.map((c) => [c.productoBaseId, c.cantidad]));
  assert.deepEqual(consumo, { 101: 40, 102: 606, 103: 4, 104: 5, 1881: 5, 105: 8, 106: 11 });
});

test("el respaldo del costo va con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./ventaConsumo.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ unidadDelBulto \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/costoBulto \/ factorPack/.test(fuente), "volvió a dividir a mano");
});
