// TANDA 11 DE LA REGLA ÚNICA DE UNIDADES: `importacion/merge` SUMA CON LA PIEZA
// Y DA LO MISMO QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/importacion/mergeConLaPieza.test.mjs
//
// La huella es de la grilla corrida con el código anterior a la tanda 11
// (`lib/unidades/tanda11Arnes.mjs`).
//
// ── LA CONTRADICCIÓN DE LA TANDA 11, ARREGLADA EN LA TANDA 12 ──────────────
//
// `importar/aplicar` le pasa a `sumarCantidadesImportadas` el `factor_pack`
// crudo de la ficha, y con el maní 1881 (factor 2) una línea del borrador en
// BULTO más una importada en UNIDAD se sumaban contando 2 por bulto: 2 + 3 = 7.
// Desde la tanda 12 la suma lee el bulto de la ficha del producto con la pieza,
// que no le ve bulto al maní: da 5, como la consolidación de la pantalla. La
// huella de la grilla se volvió a sacar: cambian solo las 20 claves del maní
// con unidades distintas; el resto es idéntico a la tanda 11.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { sumas, huella } from "../../unidades/tanda11Arnes.mjs";
import { sumarCantidadesImportadas, baseDeProducto } from "./merge.js";
import { comoViene } from "../../unidades/reglaDeUnidades.js";

test("la grilla de sumas de la importación (tanda 12: el maní sin bulto)", () => {
  assert.equal(huella(sumas()), "e2550c9c908246217f51efb53bdde0d740bd78a45f701bfe69d6cf58674fb36a");
});

test("los casos de la tanda", () => {
  const s = sumas();
  assert.deepEqual(s["pack12|BULTO5+UNIDAD24|false"], { cantidad: 7, unidad: "BULTO", unidadCambio: false, precioCosto: 38400 });
  assert.deepEqual(s["pack12|BULTO5+UNIDAD25|false"], { cantidad: 85, unidad: "UNIDAD", unidadCambio: true, precioCosto: 3200 });
  assert.deepEqual(s["pack12|UNIDAD2+BULTO1|false"], { cantidad: 14, unidad: "UNIDAD", unidadCambio: false, precioCosto: 3200 });
  assert.deepEqual(s["pack24|BULTO5+UNIDAD24|true"], { cantidad: 6, unidad: "BULTO", unidadCambio: false, precioCosto: 79200 });
});

// El producto como lo arma `importar/aplicar` (`productoParaCosto`), con la ficha real del maní.
const MANI_1881 = { factor_pack: 2, unidad_medida: "kg", modoCompraProveedor: "UNIDAD", precio_costo: 3000 };

test("TANDA 12 — el maní 1881: 2 en BULTO del borrador más 3 importadas en UNIDAD dan 5, no 7", () => {
  const r = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 3000 }, importada: { cantidad: 3, unidad: "UNIDAD", precioCosto: 3000 },
    factorPack: MANI_1881.factor_pack, producto: MANI_1881, costoMaestro: 3000,
  });
  assert.equal(r.cantidad, 5);
  assert.equal(r.precioCosto, 3000, "el costo no se multiplica por 2");
  // Y al revés: 3 en UNIDAD más 2 importadas en BULTO, también 5.
  const alReves = sumarCantidadesImportadas({
    actual: { cantidad: 3, unidad: "UNIDAD", precioCosto: 3000 }, importada: { cantidad: 2, unidad: "BULTO", precioCosto: 3000 },
    factorPack: MANI_1881.factor_pack, producto: MANI_1881, costoMaestro: 3000,
  });
  assert.equal(alReves.cantidad, 5);
  assert.equal(comoViene(baseDeProducto(MANI_1881)).factor, 1, "la pieza no le ve bulto");
});

test("TANDA 12 — contraprueba: el pack de 12 sigue sumando 12 por bulto, y el kilo igual que antes", () => {
  const pack = { factor_pack: 12, unidad_medida: "pack", modoCompraProveedor: "BULTO", precio_costo: 38400 };
  const r = sumarCantidadesImportadas({
    actual: { cantidad: 2, unidad: "BULTO", precioCosto: 38400 }, importada: { cantidad: 3, unidad: "UNIDAD", precioCosto: 3200 },
    factorPack: 12, producto: pack, costoMaestro: 38400,
  });
  assert.deepEqual([r.cantidad, r.unidad], [27, "UNIDAD"], "2 bultos de 12 más 3 unidades");
  const s = sumas();
  assert.deepEqual(s["kilo|BULTO2+UNIDAD1|false"], { cantidad: 3, unidad: "BULTO", unidadCambio: false, precioCosto: 38400 });
  assert.deepEqual(s["pack12|BULTO5+UNIDAD25|false"], { cantidad: 85, unidad: "UNIDAD", unidadCambio: true, precioCosto: 3200 });
});

test("la suma convierte con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./merge.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ bultosDe, cantidadEnUnidades, costoEnLaUnidad \} from "\.\.\/\.\.\/unidades\/reglaDeUnidades\.js";/);
  assert.ok(!/cantidad(Nueva|Actual) [*%/] factor/.test(fuente), "volvió a contar a mano");
});
