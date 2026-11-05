// TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: LA HOJA DE CORREGIR CUENTA CON LA
// PIEZA, CON LA MISMA FUNCIÓN QUE LA TARJETA, Y DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/HojaCorregirLinea.conLaPieza.test.mjs
//
// Las dos cuentas viven adentro de un `useMemo` del componente. El candado
// afirma que la hoja las hace con `enUnidadesDeLaFila` —la de
// `estadoDeLineaFacturada`, que es la de la tarjeta— y que esa función da
// exactamente lo que daban las expresiones de antes: `b * factor + s` y
// `cantidadDeLaFactura * factor`, con el factor tal como lo arma la hoja.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { enUnidadesDeLaFila } from "../../lib/compras-proveedor/estadoDeLineaFacturada.js";

const comoLoArmaLaHoja = (vaPorPack, factorPack) => (vaPorPack ? Number(factorPack) || 1 : 1);

test("enUnidadesDeLaFila da lo mismo que las cuentas de antes de la hoja, en toda la grilla", () => {
  for (const vaPorPack of [true, false]) for (const crudo of [null, 1, 2, 6, 12, 24, "12"]) for (const b of [0, 1, 2, 2.5, -1, 7]) for (const s of [0, 3, 6, 11]) {
    const factor = comoLoArmaLaHoja(vaPorPack, crudo);
    assert.equal(enUnidadesDeLaFila(b, factor) + s, b * factor + s, `${b} bultos y ${s} sueltas, factor ${crudo}`);
  }
});

test("los casos de la tanda: 2 bultos y 6 sueltas de 12 son 30; 2 de 24, 48; el maní, sin pack, cuenta tal cual", () => {
  assert.equal(enUnidadesDeLaFila(2, 12) + 6, 30);
  assert.equal(enUnidadesDeLaFila(2, 24), 48);
  assert.equal(enUnidadesDeLaFila(3, comoLoArmaLaHoja(false, 2)), 3);
});

test("la hoja cuenta con la función compartida, no a mano, y sigue sin escribir el factor del producto", () => {
  const fuente = fs.readFileSync(new URL("./HojaCorregirLinea.jsx", import.meta.url), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /return enUnidadesDeLaFila\(b, factor\) \+ s;/);
  assert.match(fuente, /const ofrecidas = enUnidadesDeLaFila\(Number\(cantidadDeLaFactura\) \|\| 0, factor\);/);
  assert.ok(!/b \* factor|\) \* factor/.test(fuente), "volvió a multiplicar a mano");
  assert.ok(!/factor_pack:\s/.test(fuente));
});
