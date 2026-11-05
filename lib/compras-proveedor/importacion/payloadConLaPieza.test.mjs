// TANDA 11 DE LA REGLA ÚNICA DE UNIDADES: `importacion/payload` CONSOLIDA CON LA
// PIEZA Y DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/importacion/payloadConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 11
// (`lib/unidades/tanda11Arnes.mjs`).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { consolidaciones, huella } from "../../unidades/tanda11Arnes.mjs";

test("la consolidación de renglones repetidos es la misma que antes de la tanda 11 (grilla completa)", () => {
  assert.equal(huella(consolidaciones()), "4be5a44afa0fd0010845e27f009ff917a49e938bfdd68452ee6e12283d1da07e");
});

test("los casos de la tanda", () => {
  const c = consolidaciones();
  const resumen = (k) => c[k].map((x) => [x.cantidad, x.unidad]);
  assert.deepEqual(resumen("pack12|BULTO2+UNIDAD5"), [[29, "UNIDAD"]], "2 bultos de 12 más 5 unidades");
  assert.deepEqual(resumen("pack24|UNIDAD5+BULTO2"), [[53, "UNIDAD"]]);
  assert.deepEqual(resumen("pack12|BULTO1+BULTO3"), [[4, "BULTO"]]);
  assert.deepEqual(resumen("mani1881|BULTO2+UNIDAD5"), [[7, "UNIDAD"]], "el maní no multiplica: 2 más 5");
});

test("la consolidación convierte con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./payload.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ cantidadEnUnidades \} from "\.\.\/\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/cantidad \* factor/.test(fuente), "volvió a multiplicar a mano");
});
