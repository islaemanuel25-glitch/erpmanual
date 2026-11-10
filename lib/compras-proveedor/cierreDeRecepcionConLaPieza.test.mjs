// TANDA 13 DE LA REGLA ÚNICA DE UNIDADES: EL CIERRE DE RECEPCIÓN NO CAMBIA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/cierreDeRecepcionConLaPieza.test.mjs
//
// `cierreDeRecepcion` es el único de los siete archivos de la tanda que NO pasó a
// la pieza: `partirEnBultos` y el "completan" parten con `Math.floor`, y
// `fromUnidades` parte un negativo distinto. Un papel con cantidad negativa —una
// nota de crédito— hoy queda en -1 bulto y el cierre lo frena por negativo; con
// la pieza quedaría en 0 y -6 sueltas, y el freno podría no saltar. Este candado
// fija lo que da hoy, negativo incluido, para que una migración no lo cambie
// sin que se vea. La huella es de la grilla corrida antes de la tanda 13.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { cierres, huella } from "../unidades/tanda13Arnes.mjs";
import { recibidosDelCierre, sueltasDelCierre } from "./cierreDeRecepcion.js";

test("lo que entra por línea al cerrar es lo mismo que antes de la tanda 13 (grilla completa)", () => {
  assert.equal(huella(cierres()), "2b88764e2afd59bb3696d81204eb4707aebdf73ea57927bd3d9893833a33e084");
});

test("los casos de la tanda", () => {
  const c = cierres();
  assert.deepEqual(c["0|pack12|BULTO|2.5|2|6|30"], { recibidos: { 1: 2 }, sueltas: { 1: 6 } }, "2,5 bultos de 12 son 2 y 6 sueltas");
  assert.deepEqual(c["0|pack24|BULTO|2.5|2|6|30"], { recibidos: { 1: 2 }, sueltas: { 1: 12 } });
  assert.deepEqual(c["0|kilo|UNIDAD|3|3|0|null"], { recibidos: { 1: 3 }, sueltas: {} });
  assert.deepEqual(c["0|mani1881|UNIDAD|3|3|0|null"], { recibidos: { 1: 3 }, sueltas: {} });
});

test("CONTRADICCIÓN FIJADA COMO ESTÁ: -0,5 bultos de 12 del papel quedan en -1 bulto y 6 sueltas", () => {
  const fila = { pedidoDetalleId: 1, factorPack: 12, unidadPedido: "BULTO", unidad: "BULTO", cantidad: -0.5, cantidadEnKilos: false, esFiambre: false, porKilo: false };
  assert.deepEqual(recibidosDelCierre({ filas: [fila] }), { 1: -1 });
  assert.deepEqual(sueltasDelCierre({ filas: [fila] }), { 1: 6 });
});

test("partirEnBultos parte con PISO, y desde la tanda 17 lo pide a la pieza", () => {
  // Antes la cuenta estaba a mano acá "a propósito": la pieza solo tenía
  // `fromUnidades`, que trunca los negativos. Desde la tanda 17 la pieza tiene
  // también `bultosYSueltas`, que parte con piso: el mismo resultado —lo fija
  // el candado de arriba, -1 bulto y 6 sueltas— desde un solo lugar.
  const fuente = fs.readFileSync(new URL("./cierreDeRecepcion.js", import.meta.url), "utf8");
  assert.match(fuente, /const \{ completos, sueltas \} = bultosYSueltas\(\{ unidades: exactas, factor \}\);/);
  assert.ok(!/Math\.floor\(exactas \/ factor\)/.test(fuente), "volvió a partir a mano");
  const pieza = fs.readFileSync(new URL("../unidades/reglaDeUnidades.js", import.meta.url), "utf8");
  const i = pieza.indexOf("export function bultosYSueltas");
  assert.match(pieza.slice(i, i + 400), /Math\.floor\(u \/ f\)/);
});
