// TANDA 11 DE LA REGLA ÚNICA DE UNIDADES: `importacion/merge` SUMA CON LA PIEZA
// Y DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/importacion/mergeConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 11
// (`lib/unidades/tanda11Arnes.mjs`).
//
// ── LA CONTRADICCIÓN QUE QUEDA, A PROPÓSITO ────────────────────────────────
//
// `importar/aplicar` le pasa a `sumarCantidadesImportadas` el `factor_pack`
// crudo de la ficha. Con el maní 1881 (factor 2), una línea del borrador en
// BULTO más una importada en UNIDAD se suman contando 2 unidades por bulto. La
// pieza lee al maní sin bulto (factor 1), y la consolidación de la pantalla
// (`payload`) también. La tanda 11 no lo arregla; el último candado fija lo que
// da hoy.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { sumas, huella, PRODUCTOS } from "../../unidades/tanda11Arnes.mjs";
import { sumarCantidadesImportadas, baseDeProducto } from "./merge.js";
import { comoViene } from "../../unidades/reglaDeUnidades.js";

test("las sumas de la importación son las mismas que antes de la tanda 11 (grilla completa)", () => {
  assert.equal(huella(sumas()), "d6342541d1f570c06beb6a7633133e915a21ed795f30c43dcfe15f04c79dddee");
});

test("los casos de la tanda", () => {
  const s = sumas();
  assert.deepEqual(s["pack12|BULTO5+UNIDAD24|false"], { cantidad: 7, unidad: "BULTO", unidadCambio: false, precioCosto: 38400 });
  assert.deepEqual(s["pack12|BULTO5+UNIDAD25|false"], { cantidad: 85, unidad: "UNIDAD", unidadCambio: true, precioCosto: 3200 });
  assert.deepEqual(s["pack12|UNIDAD2+BULTO1|false"], { cantidad: 14, unidad: "UNIDAD", unidadCambio: false, precioCosto: 3200 });
  assert.deepEqual(s["pack24|BULTO5+UNIDAD24|true"], { cantidad: 6, unidad: "BULTO", unidadCambio: false, precioCosto: 79200 });
});

test("LA CONTRADICCIÓN CON LA PIEZA, FIJADA COMO ESTÁ: el maní 1881 en BULTO más UNIDAD se suma con factor 2", () => {
  const mani = PRODUCTOS.mani1881;
  const sumar = (factorPack) => sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 3000 }, importada: { cantidad: 3, unidad: "UNIDAD", precioCosto: 3000 },
    factorPack, producto: mani, costoMaestro: 3000,
  });
  const hoy = sumar(mani.factor_pack);
  assert.deepEqual([hoy.cantidad, hoy.unidad], [7, "UNIDAD"], "hoy: 2 bultos de 2 más 3 unidades");
  const conLaPieza = sumar(comoViene(baseDeProducto(mani)).factor);
  assert.deepEqual([conLaPieza.cantidad, conLaPieza.unidad], [5, "BULTO"], "con el factor de la pieza serían 5");
});

test("la suma convierte con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./merge.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ bultosDe, cantidadEnUnidades, costoEnLaUnidad \} from "\.\.\/\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/cantidad(Nueva|Actual) [*%/] factor/.test(fuente), "volvió a contar a mano");
});
