// TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: `gananciaDelDeposito` VALORIZA CON LA
// PIEZA Y DA LA MISMA GANANCIA QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/gananciaDelDepositoConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 13
// (`lib/unidades/tanda13Arnes.mjs`).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { ganancias, huella } from "../unidades/tanda13Arnes.mjs";

// 2026-11-11 (Mauro #590): la cuenta suma lo que factura el papel entero
// (`delPapel`) y lo que facturan los que quedan afuera, por qué quedan. Medido
// contra la grilla anterior (`51c8a7cf…`): los cinco totales ganan esos tres
// campos y no cambia ningún otro.
//
// 2026-11-25 (factura P 0100-00189744): la cuenta gana `porqueAfuera`, el
// motivo común de los que quedan afuera, para que el texto no diga "sin tu
// precio" por cualquier motivo. Medido: sacando ese campo de cada total, la
// grilla vuelve a dar `d313cb83…`, la huella de antes. No cambia ningún número.
test("lo que se valoriza y la ganancia del depósito son los mismos que antes de la tanda 13 (grilla completa)", () => {
  assert.equal(huella(ganancias()), "e3c54ec894ce4fbbc5415d549a6f4e0c59cae426db49f01f81f7b4cf784349d3");
});

test("los casos de la tanda: las sueltas se valorizan como fracción del bulto", () => {
  const g = ganancias();
  assert.equal(g["0|pack12|BULTO|2.5|2|6|30"].valoriza, 2.5, "2 bultos y 6 sueltas de 12");
  assert.equal(g["0|pack24|BULTO|2.5|2|6|30"].valoriza, 1.25, "30 unidades de 24");
  assert.equal(g["0|pack12|BULTO|3|0|3|3"].valoriza, 0.25, "0 bultos y 3 sueltas de 12");
  assert.equal(g["0|kilo|UNIDAD|3|3|0|null"].valoriza, 3);
  assert.equal(g["0|fiambrePieza|UNIDAD|3|3|0|null"].valoriza, 3);
  assert.equal(g["0|mani1881|UNIDAD|3|3|0|null"].valoriza, 3);
  assert.equal(g["total|pack12"].ganancia, -23404.79999999993);
});

test("las sueltas pasan a bultos con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./gananciaDelDeposito.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ bultosEnFraccion \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/(sueltas|fisicas) \/ factor/.test(fuente), "volvió a dividir a mano");
});
