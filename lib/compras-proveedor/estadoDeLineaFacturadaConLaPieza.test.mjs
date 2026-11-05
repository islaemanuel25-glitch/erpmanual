// TANDAS 13 Y 16 DE LA REGLA ÚNICA DE UNIDADES: `estadoDeLineaFacturada`
// CONVIERTE CON LA PIEZA, Y EL MANÍ 1881 DEJA DE SALIR A MITAD DE PRECIO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/estadoDeLineaFacturadaConLaPieza.test.mjs
//
// Las huellas son de la grilla de `lib/unidades/tanda13Arnes.mjs`: todas las
// funciones de fila y todos los filtros, sobre 150 filas con la forma de la
// conciliación real.
//
// ── LO QUE NO PASA A LA PIEZA, A PROPÓSITO ─────────────────────────────────
//
// `contadoEnLaEscala` parte con `Math.floor`, y `fromUnidades` parte un negativo
// distinto. Queda como está y su candado lo fija.
//
// ── LO QUE CAMBIÓ EN LA TANDA 16, Y SOLO ESO ───────────────────────────────
//
// La fila del maní lleva su `factor_pack` 2 crudo (`aplanarDetalles`), y el
// precio de una unidad del ERP lo dividía por 2. Ahora el bulto se lee con la
// pieza (`bultoDeLaFila`): el maní se compra por unidad y no tiene bulto.
//
// Por el camino real el costo maestro del maní ya llega por bolsa —el depósito
// cuenta piezas, `costoDelCatalogoEnLaUnidadDelDeposito` lo pasa a 6.000 la
// bolsa de 2 kg—, así que antes la hoja decía 3.000 contra un papel que cobra
// por bolsa, y ahora dice 6.000. En la grilla, que trae el costo por kilo
// crudo, el mismo arreglo lleva 1.500 a 3.000.
//
// TODO LO DEMÁS DA LO MISMO: la huella de la grilla SIN el precio de una unidad
// del maní es la del código de la tanda 15, sacada corriéndolo dos veces antes
// de tocarlo.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { estados, huella } from "../unidades/tanda13Arnes.mjs";
import { aplanarDetalles } from "./comprobante/analisisDeComprobante.js";
import { bultoDeLaFila, contadoEnLaEscala, precioDeUnaUnidad } from "./estadoDeLineaFacturada.js";
import P from "../unidades/posVentaConLaPieza.productos.json" with { type: "json" };

// La fila, armada desde la ficha con la misma función que la conciliación.
const filaDe = (base) => aplanarDetalles([{ id: 1, cantidad: 3, precioCosto: base.precio_costo, producto: { baseId: base.id, base } }])[0];

const sinElPrecioDelMani = (e) =>
  Object.fromEntries(Object.entries(e).map(([k, v]) => [k, k.split("|")[1] === "mani1881" ? { ...v, precioDeUnaUnidad: "—" } : v]));

test("los estados y avisos de cada línea, salvo el precio del maní, son los mismos que en la tanda 15 (grilla completa)", () => {
  assert.equal(huella(sinElPrecioDelMani(estados())), "a15fbcf889ac20d74bd94a5e3cddbebe39dc25046a4a15df607701aa16ba98f7");
  assert.equal(huella(estados()), "3079f2229aa3b386bbdb87a8dc06f349aa5e7cc57ea5937f6b4a7fed01cde687");
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
  assert.equal(e["0|mani1881|UNIDAD|3|3|0|null"].precioDeUnaUnidad.erp, 3000, "el kilo crudo de la grilla, sin dividir por 2");
});

test("TANDA 16: con la ficha real del maní, el precio de una unidad del ERP es el de la bolsa, no la mitad", () => {
  const fila = filaDe(P.base_mani1881);
  assert.equal(fila.factorPack, 2, "la fila sigue llevando el factor crudo");
  assert.equal(fila.esFiambre, true);
  assert.equal(bultoDeLaFila(fila), 1, "para la pieza el maní no tiene bulto");
  assert.deepEqual(precioDeUnaUnidad({ ...fila, importeDelPapel: 18000 }), { papel: 6000, erp: 6000 }, "antes: erp 3.000");
});

test("TANDA 16, CONTRAPRUEBA: el pack de 12 y el producto por kilo siguen igual", () => {
  const pack = filaDe(P.base_pack12);
  assert.equal(bultoDeLaFila(pack), 12);
  assert.deepEqual(precioDeUnaUnidad({ ...pack, importeDelPapel: 115200 }), { papel: 38400, erp: 3200 });
  const kilo = filaDe(P.base_kilo);
  assert.equal(bultoDeLaFila(kilo), 1);
  assert.deepEqual(precioDeUnaUnidad({ ...kilo, importeDelPapel: 24000 }), { papel: 8000, erp: 8000 });
});

test("contadoEnLaEscala sigue partiendo con Math.floor, también un negativo", () => {
  const fila = (unidadesFisicas) => ({ unidadesFisicas, factorPack: 12, unidadPedido: "BULTO", unidad: "BULTO" });
  assert.deepEqual(contadoEnLaEscala(fila(30)), { completos: 2, sueltas: 6 });
  assert.deepEqual(contadoEnLaEscala(fila(-30)), { completos: -3, sueltas: 6 }, "con la pieza serían -2 y -6");
});

test("las multiplicaciones y el precio de una unidad van con la pieza, no a mano", () => {
  const fuente = fs.readFileSync(new URL("./estadoDeLineaFacturada.js", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /import \{ cantidadEnUnidades, comoViene, unidadDelBulto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.match(fuente, /const factor = bultoDeLaFila\(fila\);/, "el precio de una unidad lee el bulto con la pieza");
  assert.ok(!/(enEscala|pedida) \* factor/.test(fuente), "volvió a multiplicar a mano");
  assert.ok(!/costo \/ factor/.test(fuente), "volvió a dividir a mano");
});
