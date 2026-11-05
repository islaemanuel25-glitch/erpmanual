// TANDA 14 DE LA REGLA ÚNICA DE UNIDADES: `motorCorreccion` CUENTA CON LA PIEZA
// Y RECONSTRUYE LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/motorCorreccionConLaPieza.test.mjs
//
// Las huellas son de las grillas corridas con el código anterior a la tanda 14
// (`lib/unidades/tanda14Arnes.mjs`): 1.152 reconstrucciones del consumo de una
// venta vieja y una venta corregida con cambio de cantidad y de producto.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { reconstrucciones, ventaCorregida, huella } from "../unidades/tanda14Arnes.mjs";

test("la reconstrucción del consumo de una venta es la misma que antes de la tanda 14 (grilla completa)", () => {
  assert.equal(huella(reconstrucciones()), "0e82ca9a641c7398c29175950ada56a33537b0c01a8e462da68f7dfae2faf403");
});

test("los casos de la tanda: pack de 12 por bulto y por unidad en el depósito, y en un local", () => {
  const r = reconstrucciones();
  assert.deepEqual(r["true|12|null|38400|38400|null|false"].consumo, [{ productoLocalId: 11, cantidad: 36 }], "costo del bulto: 3 bultos son 36");
  assert.deepEqual(r["true|12|null|3200|38400|null|false"].consumo, [{ productoLocalId: 11, cantidad: 3 }], "costo de la unidad: 3 unidades");
  assert.deepEqual(r["false|12|null|38400|38400|null|false"].consumo, [{ productoLocalId: 11, cantidad: 3 }], "en un local, la cantidad tal cual");
  assert.equal(r["true|2|SOLO_UNIDAD|38400|38400|null|true"].reconstruccion, "AUTO_PIEZA", "el maní en el depósito va por pieza");
  assert.deepEqual(r["true|12|MIXTO|100|38400|null|false"].modalidadesPosibles.map((m) => m.cantidadStock), [36, 3]);
});

test("la venta corregida devuelve y descuenta lo mismo que antes", async () => {
  const v = await ventaCorregida();
  assert.equal(huella(v), "10944598193e7d876fc2b62fa5b5e47a9ad1fc41e930c9486c418dc4bde77a7c");
  // Depósito: el pack de 12 devuelve 2 bultos y descuenta 3 (-12), el maní devuelve 3 bolsas, el fiambre descuenta 2.
  assert.deepEqual(v.deposito.delta, [[1010, -12], [18810, 3], [1040, -2]]);
  assert.deepEqual(v.local.delta, [[1010, -1], [18810, 3], [1040, -2]]);
});

test("el motor cuenta con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./motorCorreccion.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ cantidadEnUnidades, unidadDelBulto \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/cantidad \* factor|costoBulto \/ factor/.test(fuente), "volvió a contar a mano");
});
