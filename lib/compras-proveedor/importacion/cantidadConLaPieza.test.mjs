// TANDA 11 DE LA REGLA ÚNICA DE UNIDADES: `importacion/cantidad` PARTE EN BULTOS
// CON LA PIEZA Y PROPONE LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/importacion/cantidadConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 11
// (`lib/unidades/tanda11Arnes.mjs`): 1.008 propuestas.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { propuestas, huella } from "../../unidades/tanda11Arnes.mjs";

test("las propuestas del importador son las mismas que antes de la tanda 11 (grilla completa)", () => {
  assert.equal(huella(propuestas()), "0d8b6c90588d7f37c449d69363e6672febea4464e4805aefb57f1b3d4981939a");
});

test("los casos de la tanda", () => {
  const p = propuestas();
  assert.deepEqual(p["pack12|UNIDAD|null|24"], { cantidad: 2, unidad: "BULTO", requiereRevision: false, motivo: null, equivalencia: "24 un = 2 bultos de 12" });
  assert.equal(p["pack12|UNIDAD|null|25"].motivo, "25 unidades no equivalen a bultos enteros de 12.");
  assert.deepEqual(p["pack24|UNIDAD|null|24"], { cantidad: 1, unidad: "BULTO", requiereRevision: false, motivo: null, equivalencia: "24 un = 1 bulto de 24" });
  assert.equal(p["pack24|UNIDAD|null|36"].requiereRevision, true);
  assert.deepEqual(p["kilo|UNIDAD|null|24"], { cantidad: 24, unidad: "UNIDAD", requiereRevision: false, motivo: null });
  assert.equal(p["fiambrePieza|BULTO|null|3"].unidad, "UNIDAD");
  assert.deepEqual(p["mani1881|UNIDAD|null|24"], { cantidad: 24, unidad: "UNIDAD", requiereRevision: false, motivo: null }, "el maní no se parte en bultos de 2");
  assert.equal(p["mani1881|BULTO|null|3"].unidad, "UNIDAD");
});

test("el importador parte en bultos con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./cantidad.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /bultosDe\(\{ unidades: numero, base: baseDeProducto\(producto\) \}\)/);
  assert.ok(!/numero [%/] factor/.test(fuente), "volvió a dividir a mano");
});
