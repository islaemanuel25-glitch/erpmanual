// TANDAS 15 Y 16 DE LA REGLA ÚNICA DE UNIDADES: `combos/costo` DIVIDE CON LA
// PIEZA, Y EL MANÍ 1881 DEJA DE COSTEARSE A MITAD DE PRECIO EN UN LOCAL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/combos/costoConLaPieza.test.mjs
//
// La grilla es la de `lib/unidades/tanda15Arnes.mjs`, con la ficha real del
// maní (kg, factor 2, compra UNIDAD, PIEZA, peso 2 fijo, SOLO_UNIDAD).
//
// ── LO QUE CAMBIÓ EN LA TANDA 16, Y SOLO ESO ───────────────────────────────
//
// En un local, el componente maní se costeaba con su `factor_pack` 2 crudo:
// 3.000 el kilo ÷ 2 = 1.500. Ahora el bulto se lee con la pieza (`comoViene`),
// y el maní no tiene bulto: 3.000. En el depósito ya salía por pieza (6.000 la
// bolsa de 2 kg) y sigue igual.
//
// La ficha de prueba "kilo con pack" (kg, factor 2, compra por bulto) cambia
// igual, de 1.500 a 3.000, en los dos lados: para la pieza un producto por kilo
// no tiene bulto. En producción no hay ninguna ficha así (bloque 2a: solo el
// maní).
//
// TODO LO DEMÁS DA LO MISMO: la huella de la grilla sin esas entradas es la del
// código de la tanda 15, sacada corriéndolo dos veces antes de tocarlo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { BASES, costosDeComponente, huella } from "../unidades/tanda15Arnes.mjs";
import { costoUnitarioComponente } from "./costo.js";

const sinElManiNiElKiloConPack = (c) => Object.fromEntries(Object.entries(c).filter(([k]) => !/^(mani1881\|false|kgPack)\|/.test(k)));

test("el costo de cada componente, salvo el maní en un local y el kilo con pack, es el mismo que en la tanda 15 (grilla completa)", () => {
  assert.equal(huella(sinElManiNiElKiloConPack(costosDeComponente())), "a2b965a193091cfb07fc98ce32b457f8fe1efb67979a77f3b4e4bb1e5ac4e053");
  assert.equal(huella(costosDeComponente()), "b039a6951512cc5886c33bdc7462b1b9fab81c062327b83e08ea85952b76d0cb");
});

test("los casos de la tanda", () => {
  const c = costosDeComponente();
  assert.equal(c["pack12|false|undefined"], 3200, "38.400 ÷ 12");
  assert.equal(c["sueltos|false|undefined"], 600, "el suelto: 120.000 ÷ 10 ÷ 20");
  assert.equal(c["kilo|false|undefined"], 8000);
  assert.equal(c["fiambrePieza|true|undefined"], 31500, "en el depósito, la pieza de 3,5 kg");
  assert.equal(c["mani1881|true|undefined"], 6000, "en el depósito, la bolsa de 2 kg");
  assert.equal(c["mani1881|false|undefined"], 3000, "TANDA 16: en un local, el kilo sin dividir por 2 (antes 1.500)");
  assert.equal(c["mani1881|false|1480"], 1480, "con costo del local, tampoco se divide (antes 740)");
  assert.equal(c["kgPack|false|undefined"], 3000, "antes 1.500");
});

test("TANDA 16: con la ficha real, el maní en un local cuesta 3.000 y el pack de 12 y el kilo siguen igual", () => {
  assert.equal(BASES.mani1881.unidad_medida, "kg");
  assert.equal(BASES.mani1881.factor_pack, 2);
  assert.equal(BASES.mani1881.modoCompraProveedor, "UNIDAD");
  assert.equal(costoUnitarioComponente({ base: BASES.mani1881, productoLocal: null, esDeposito: false }), 3000);
  assert.equal(costoUnitarioComponente({ base: BASES.pack12, productoLocal: null, esDeposito: false }), 3200);
  assert.equal(costoUnitarioComponente({ base: BASES.kilo, productoLocal: null, esDeposito: false }), 8000);
});

test("el costo del componente lee el bulto con la pieza y divide con ella, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./costo.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ comoViene, unidadDelBulto \} from "\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.match(fuente, /const factor = comoViene\(base\)\.factor;/);
  assert.ok(!/factor_pack\) \|\| 1/.test(fuente), "volvió a leer el factor crudo");
  assert.ok(!/costo \/ factor/.test(fuente), "volvió a dividir a mano");
});
