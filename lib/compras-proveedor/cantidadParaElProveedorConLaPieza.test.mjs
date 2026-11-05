// TANDA 11 DE LA REGLA ÚNICA DE UNIDADES: `cantidadParaElProveedor` CUENTA CON
// LA PIEZA Y DICE LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/cantidadParaElProveedorConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 11
// (`lib/unidades/tanda11Arnes.mjs`).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { cantidadesParaElProveedor, huella } from "../unidades/tanda11Arnes.mjs";

test("el texto para el proveedor es el mismo que antes de la tanda 11 (grilla completa)", () => {
  assert.equal(huella(cantidadesParaElProveedor()), "1deb80f08efd99b824ffd1d8ac6636a1f9819ba9d813b30a958e054377520e99");
});

test("los casos de la tanda", () => {
  const c = cantidadesParaElProveedor();
  assert.equal(c["pack12|BULTO|3"], "3 × 12 = 36 unidades");
  assert.equal(c["pack24|BULTO|2.5"], "2,5 × 24 = 60 unidades");
  assert.equal(c["pack12|UNIDAD|3"], "3 unidades");
  assert.equal(c["cajon6|BULTO|-2"], "-2 × 6 = -12 unidades", "la cuenta conserva el signo, como antes");
  assert.equal(c["unidad12|BULTO|3"], "3 unidades");
  assert.equal(c["kilo|BULTO|3"], "3 kg");
  assert.equal(c["fiambrePieza|UNIDAD|1"], "1 kg");
  assert.equal(c["mani1881|BULTO|3"], "3 kg");
});

test("cantidadParaElProveedor multiplica con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./cantidadParaElProveedor.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ cantidadEnUnidades \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/cant \* factor/.test(fuente), "volvió a multiplicar a mano");
});
