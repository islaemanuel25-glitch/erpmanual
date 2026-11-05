// TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: `estadoDeLineaFacturada` CONVIERTE CON
// LA PIEZA Y DA LOS MISMOS ESTADOS Y AVISOS QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/estadoDeLineaFacturadaConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 13
// (`lib/unidades/tanda13Arnes.mjs`): todas las funciones de fila y todos los
// filtros, sobre 150 filas con la forma de la conciliación real.
//
// ── LO QUE NO PASA A LA PIEZA, A PROPÓSITO ─────────────────────────────────
//
// `contadoEnLaEscala` parte con `Math.floor`, y `fromUnidades` parte un negativo
// distinto. Queda como está y su candado lo fija.
//
// ── LA CONTRADICCIÓN QUE QUEDA ─────────────────────────────────────────────
//
// La fila del maní 1881 lleva su `factor_pack` 2 crudo, así que el precio de una
// unidad del ERP sale dividido por 2 (3.000 el kilo se muestra 1.500). La pieza
// no le ve bulto. No se arregla en la tanda 13: se fija como está.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { estados, huella } from "../unidades/tanda13Arnes.mjs";
import { contadoEnLaEscala, precioDeUnaUnidad } from "./estadoDeLineaFacturada.js";

test("los estados y avisos de cada línea son los mismos que antes de la tanda 13 (grilla completa)", () => {
  assert.equal(huella(estados()), "607fe2138a33b859f75a968ffa348d882cb91496f6e3a9c54e2a3d3920b27db0");
});

test("los casos de la tanda: pack de 12 y de 24 por bulto con sueltas y por unidad, kilo, fiambre y maní", () => {
  const e = estados();
  assert.equal(e["0|pack12|BULTO|2.5|2|6|30"].unidadesFisicasEsperadas, 30, "2,5 bultos de 12");
  assert.equal(e["0|pack24|BULTO|2.5|2|6|30"].unidadesFisicasEsperadas, 60);
  assert.equal(e["0|pack12|UNIDAD|30|25|0|25"].unidadesFisicasEsperadas, 30);
  assert.deepEqual(e["0|pack12|BULTO|2.5|2|6|30"].precioDeUnaUnidad, { papel: 39283.2, erp: 3200 });
  assert.equal(e["0|kilo|UNIDAD|3|3|0|null"].unidadesFisicasEsperadas, 3);
  assert.equal(e["0|fiambrePieza|UNIDAD|3|3|0|null"].unidadesFisicasEsperadas, 3);
  assert.equal(e["0|mani1881|UNIDAD|3|3|0|null"].unidadesFisicasEsperadas, 3);
});

test("CONTRADICCIÓN FIJADA COMO ESTÁ: el precio de una unidad del maní 1881 sale dividido por su factor 2", () => {
  const e = estados();
  assert.equal(e["0|mani1881|UNIDAD|3|3|0|null"].precioDeUnaUnidad.erp, 1500, "3.000 el kilo ÷ 2");
  assert.deepEqual(precioDeUnaUnidad({ cantidad: 3, importeDelPapel: 9000, costoMaestroHoy: 3000, factorPack: 2 }).erp, 1500);
});

test("contadoEnLaEscala sigue partiendo con Math.floor, también un negativo", () => {
  const fila = (unidadesFisicas) => ({ unidadesFisicas, factorPack: 12, unidadPedido: "BULTO", unidad: "BULTO" });
  assert.deepEqual(contadoEnLaEscala(fila(30)), { completos: 2, sueltas: 6 });
  assert.deepEqual(contadoEnLaEscala(fila(-30)), { completos: -3, sueltas: 6 }, "con la pieza serían -2 y -6");
});

test("las multiplicaciones y el precio de una unidad van con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./estadoDeLineaFacturada.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ cantidadEnUnidades, unidadDelBulto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/(enEscala|pedida) \* factor/.test(fuente), "volvió a multiplicar a mano");
  assert.ok(!/costo \/ factor/.test(fuente), "volvió a dividir a mano");
});
