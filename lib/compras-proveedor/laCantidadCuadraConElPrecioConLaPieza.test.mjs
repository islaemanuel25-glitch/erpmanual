// TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: `laCantidadCuadraConElPrecio` CUENTA
// CON LA PIEZA Y DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/laCantidadCuadraConElPrecioConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 13
// (`lib/unidades/tanda13Arnes.mjs`).
//
// ── EL MANÍ, QUE SE ARREGLÓ EN QUIEN LLAMA ─────────────────────────────────
//
// Llamada con el `factor_pack` 2 crudo del maní 1881, la función espera 6
// unidades por 3 bolsas, y eso es lo que fija la grilla. Desde la tanda 16 la
// hoja ya no la llama así: le pasa el bulto leído con la pieza
// (`bultoDeLaFila`), que para el maní es 1. El caso, con la ficha real, está en
// `components/compras-proveedor/HojaCorregirLinea.conLaPieza.test.mjs`. El
// cierre de la recepción no llega a esta función con el maní: va por peso.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { cuadres, huella } from "../unidades/tanda13Arnes.mjs";

test("el control de cantidad contra precio da lo mismo que antes de la tanda 13 (grilla completa)", () => {
  assert.equal(huella(cuadres()), "d4bae0a32fa06304a1793311397bb669f22ec3ae1763fc408f70d22b4d87f39c");
});

test("los casos de la tanda", () => {
  const c = cuadres();
  assert.deepEqual(c["pack12|BULTO|6|120|6136|36817|20"], { aplica: true, cuadra: true, esperado: 120, valuado: 36817, precioUnitario: 306.80833333333334, subtotal: 36817 }, "el Queso Rallado del 242: 6 bultos de 20");
  assert.deepEqual(c["pack12|BULTO|3|36|38400|115200|12"], { aplica: true, cuadra: true, esperado: 36, valuado: 115200, precioUnitario: 3200, subtotal: 115200 });
  assert.deepEqual(c["pack24|BULTO|8|48|2300|18400|24"], { aplica: true, cuadra: true, esperado: 192, valuado: 110400, precioUnitario: 2300, subtotal: 18400 }, "el Gancia de DYSSA, por pack de 6 en bulto de 24");
  assert.equal(c["kilo|UNIDAD|3|3|9000|27000|1"].aplica, false);
  assert.equal(c["mani1881|UNIDAD|3|3|9000|27000|2"].esperado, 6, "con el factor crudo, 3 bolsas del maní esperan 6 unidades (la hoja ya no lo pasa)");
});

test("el control convierte con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./laCantidadCuadraConElPrecio.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ bultosEnFraccion, cantidadEnUnidades, unidadDelBulto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/fis \/ (factor|k)\b/.test(fuente), "volvió a dividir a mano");
  assert.ok(!/cant \* factor|precioUnitario \/ factor/.test(fuente), "volvió a contar a mano");
});
