// TANDA 9 DE LA REGLA ÚNICA DE UNIDADES: `lineasDelPedido` CUENTA CON LA PIEZA Y
// DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/lineasDelPedidoConLaPieza.test.mjs
//
// Los números son los del código anterior a la tanda 9, sacados corriéndolo:
// `lib/unidades/tanda9.lineaBase.json`. Los casos y la forma de cada línea, en
// `lib/unidades/tanda9Arnes.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { LINEAS, LINEA_BASE, lineaDelDetalle, funcionesDeLineas } from "../unidades/tanda9Arnes.mjs";

for (const [nombre, caso, cant] of LINEAS) {
  test(`lineasDelPedido igual que antes de la tanda 9 — ${nombre}`, () => {
    const { cantidadEnPantalla, salePorBulto } = LINEA_BASE.pedidos[nombre];
    assert.deepEqual(funcionesDeLineas(lineaDelDetalle(caso, cant)), { cantidadEnPantalla, salePorBulto });
  });
}

test("lineasDelPedido divide en bultos con la pieza, no a mano", () => {
  const fuente = fs
    .readFileSync(new URL("./lineasDelPedido.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ fromUnidades \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/\/\s*it\.factorPack/.test(fuente), "volvió a dividir por el factor a mano");
});
