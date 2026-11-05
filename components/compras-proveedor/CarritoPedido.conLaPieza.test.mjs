// TANDA 11 DE LA REGLA ÚNICA DE UNIDADES: `CarritoPedido` MUESTRA EL BULTO CON
// LA PIEZA Y DICE LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/CarritoPedido.conLaPieza.test.mjs
//
// El carrito se dibuja con sus dos variantes y se leen los números de cada
// línea. La huella es de la corrida con el código anterior a la tanda 11
// (`lib/unidades/tanda11Arnes.mjs`).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { carrito, huella } from "../../lib/unidades/tanda11Arnes.mjs";

test("el carrito dice los mismos números que antes de la tanda 11", () => {
  assert.equal(huella(carrito()), "0b67cb64b4bf752d4c509c88f5a19a3525b107e6e9dfcc81c4e77f9d313e1434");
});

test("los casos de la tanda: el pack de 12 y de 24 por bulto dicen su equivalencia; el kilo, el fiambre y el maní no", () => {
  const { aside } = carrito();
  assert.deepEqual(aside.slice(0, 5), ["7 productos", "Gaseosa x12", "$115.200", "1 pack = 12 un", "· equivale a 36 un"]);
  assert.ok(aside.includes("1 pack = 24 un") && aside.includes("· equivale a 48 un"), "2 bultos de 24 son 48");
  assert.ok(!aside.some((s) => /1 pack = 2 un/.test(s)), "el maní no se muestra como pack de 2");
});

test("el carrito cuenta el bulto con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./CarritoPedido.jsx", import.meta.url), "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ bultoDeLaFicha, cantidadEnUnidades \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/qtyNum \* factor/.test(fuente), "volvió a multiplicar a mano");
  assert.ok(!/Math\.max\(1, Number\(i\.factorPack\)/.test(fuente), "volvió a leer el factor crudo de la línea");
});
