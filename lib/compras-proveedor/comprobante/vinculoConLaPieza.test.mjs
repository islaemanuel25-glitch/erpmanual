// TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: `precioCuadra` (vínculo del
// comprobante) LLEVA AL BULTO CON LA PIEZA Y DECIDE LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/vinculoConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 13
// (`lib/unidades/tanda13Arnes.mjs`): 360 combinaciones de factor, importe,
// cantidad, costo y variación.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { vinculos, huella } from "../../unidades/tanda13Arnes.mjs";
import { precioCuadra } from "./vinculo.js";

test("el precio que cuadra para vincular es el mismo que antes de la tanda 13 (grilla completa)", () => {
  assert.equal(huella(vinculos()), "8dedfa94596481a17ef0a1ae0a142423983bf8651cfff95c529d209be0cbb92a");
});

test("los casos de la tanda", () => {
  assert.equal(precioCuadra({ precio: { importe: 3200, cantidad: 1 }, linea: { precioCostoDelPedido: 38400, factorPack: 12 } }), true, "la unidad de un pack de 12 cuadra con el costo del bulto");
  assert.equal(precioCuadra({ precio: { importe: 116700, cantidad: 30 }, linea: { precioCostoDelPedido: 40140, factorPack: 6 } }), false, "Santa Julia de Pablo #337");
  assert.equal(precioCuadra({ precio: { importe: 3000, cantidad: 1 }, linea: { precioCostoDelPedido: 3000, factorPack: 2 } }), true);
});

test("el vínculo lleva al bulto con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./vinculo.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ costoEnLaUnidad \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/(unitario|costo) \* factor/.test(fuente), "volvió a multiplicar a mano");
});
