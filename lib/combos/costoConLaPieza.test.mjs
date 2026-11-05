// TANDA 15 DE LA REGLA ÚNICA DE UNIDADES: `combos/costo` DIVIDE CON LA PIEZA Y
// COSTEA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/combos/costoConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 15
// (`lib/unidades/tanda15Arnes.mjs`).
//
// ── LA CONTRADICCIÓN QUE QUEDA ─────────────────────────────────────────────
//
// En un local, un componente maní 1881 se costea con su `factor_pack` 2 crudo:
// 3.000 el kilo ÷ 2 = 1.500 por kilo de stock. La pieza no le ve bulto. Lo mismo
// el kilo con pack. Se fija como está.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { costosDeComponente, huella } from "../unidades/tanda15Arnes.mjs";

test("el costo de cada componente de un combo es el mismo que antes de la tanda 15 (grilla completa)", () => {
  assert.equal(huella(costosDeComponente()), "e949c6e09b4a85132b70ea74eb8f3deb2dd57e7632580c3ddb84504b100a75b0");
});

test("los casos de la tanda", () => {
  const c = costosDeComponente();
  assert.equal(c["pack12|false|undefined"], 3200, "38.400 ÷ 12");
  assert.equal(c["sueltos|false|undefined"], 600, "el suelto: 120.000 ÷ 10 ÷ 20");
  assert.equal(c["kilo|false|undefined"], 8000);
  assert.equal(c["fiambrePieza|true|undefined"], 31500, "en el depósito, la pieza de 3,5 kg");
  assert.equal(c["mani1881|true|undefined"], 6000, "en el depósito, la bolsa de 2 kg");
  assert.equal(c["mani1881|false|undefined"], 1500, "CONTRADICCIÓN FIJADA: en un local, 3.000 ÷ 2");
});

test("el costo del componente divide con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./costo.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ unidadDelBulto \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/costo \/ factor/.test(fuente), "volvió a dividir a mano");
});
