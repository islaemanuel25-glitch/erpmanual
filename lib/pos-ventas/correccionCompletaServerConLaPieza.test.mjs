// TANDA 14 DE LA REGLA ÚNICA DE UNIDADES: `correccionCompletaServer` TOMA EL
// COSTO DE RESPALDO CON LA PIEZA Y RESUELVE LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/correccionCompletaServerConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 14
// (`lib/unidades/tanda14Arnes.mjs`): 120 líneas del editor de la corrección.
//
// ── LA CONTRADICCIÓN QUE QUEDA ─────────────────────────────────────────────
//
// Una línea del maní 1881 que llega sin costo del cliente toma de respaldo el
// costo del bulto dividido por su `factor_pack` 2 crudo: 3.000 ÷ 2 = 1.500. La
// pieza no le ve bulto. Es la misma cuenta de la venta al crearse
// (`combos/ventaConsumo`, otra tanda). Se fija como está.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { lineasCorregidas, huella } from "../unidades/tanda14Arnes.mjs";

test("las líneas corregidas se resuelven igual que antes de la tanda 14 (grilla completa)", async () => {
  assert.equal(huella(await lineasCorregidas()), "16d1b86f5acaf7f19601b792b760cead491c2dfb4000f66909401a147324bb31");
});

test("los casos de la tanda: sin costo del cliente, el respaldo es el bulto dividido por el factor", async () => {
  const l = await lineasCorregidas();
  assert.equal(l["true|pack12|undefined|NORMAL"][0].costoUnitario, 3200, "38.400 ÷ 12");
  assert.equal(l["false|pack12|undefined|NORMAL"][0].costoUnitario, 3200);
  assert.equal(l["false|kilo|undefined|NORMAL"][0].costoUnitario, 8000);
  assert.equal(l["true|pack12|3200|NORMAL"][0].costoUnitario, 3200, "con costo del cliente, ése");
  assert.equal(l["true|mani1881|undefined|NORMAL"][0].costoUnitario, 1500, "CONTRADICCIÓN FIJADA: 3.000 ÷ 2");
});

test("el respaldo del costo va con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./correccionCompletaServer.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ unidadDelBulto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/costoBulto \/ factorPack/.test(fuente), "volvió a dividir a mano");
});
