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

// ── Y LO QUE CAMBIÓ CON EL MANÍ DE PROD NAT (2026-11-05) ──────────────────
//
// Un producto que la pieza lee sin pack no tiene escala que adivinar: lo que no
// cuadra es el precio, y se ofrece como un salto. El maní 1881 es uno —factor_pack
// 2 crudo, se compra por unidad—, así que en sus filas `loQueNoCuadra` pasa de
// ESCALA a PRECIO, el motivo pasa a ser la frase del precio y el salto se puede
// aceptar. Sin esos tres campos del maní, la grilla es la del commit anterior
// (`d77f1bbb` + el UxB), sacada corriéndolo dos veces antes de tocarlo.
const CAMPOS_DEL_MANI = ["precioDeUnaUnidad", "loQueNoCuadra", "motivoSinComparacion", "saltoDePrecioAceptable"];
const sinElPrecioDelMani = (e) =>
  Object.fromEntries(
    Object.entries(e).map(([k, v]) => [
      k,
      k.split("|")[1] === "mani1881" ? { ...v, ...Object.fromEntries(CAMPOS_DEL_MANI.map((c) => [c, "—"])) } : v,
    ])
  );

// ── Y LO QUE CAMBIÓ CON LA MORTADELA PALADINI (2026-11-06) ────────────────
//
// `loQueNoCuadra` dejó de tomar k = 1 como ambigüedad de escala: dos precios
// por unidad que coinciden dentro de la variación son la MISMA escala y una
// variación de precio. Medido renglón por renglón contra la grilla anterior
// (`fed8f430…` / `e21d7c7b…`): cambian 30 filas, todas del pack de 12 pedido por
// UNIDAD con el papel a $3.273,60 contra $3.200,00 la unidad, y en las 30 solo
// tres campos —`loQueNoCuadra` y `motivoSinComparacion` pasan de "No se puede
// saber en qué viene" a "El papel cobra $3.273,60 la unidad y vos la tenés a
// $3.200,00 (2 % más)", y `saltoDePrecioAceptable` de false a true—. Nada más.
// ── Y LO QUE CAMBIÓ CON EL COLON TINTO DULCE (2026-11-07) ─────────────────
//
// Regla de Emanuel: gana la lectura que deja menos diferencia contra tu costo.
// Medido renglón por renglón contra la grilla anterior (`2e7d9c6d…` /
// `678abeaa…`), sin las dos funciones nuevas: cambian 30 filas de 151, todas
// del pack de 12 pedido por UNIDAD con el papel a $3.273,60 contra $3.200,00 la
// unidad, y en las 30 un solo campo —`precioDistintoDentroDeLaVariacion` pasa
// de false a true—: con la línea del pedido en otra escala que el papel, un
// +2,3 % por unidad es un precio común y la tarjeta no va en tono de alerta.
// ── Y LO QUE CAMBIÓ CON EL CHEDDAR TONADITA (2026-11-09) ──────────────────
//
// Entra una función de fila nueva, `bultoDelPapelSinBultoEnLaFicha`, y el arnés
// la evalúa sobre todas. Medido renglón por renglón contra la grilla anterior
// (`6c25ecc1…` / `ba1edd37…`): las 150 filas ganan ese campo, en las 150 vale
// null —ninguna de la grilla es un POR_PRESENTACION sin bulto en la ficha— y no
// cambia ningún otro campo.
// ── Y LO QUE CAMBIÓ CON EL SIGNO DEL ERP (2026-11-10) ─────────────────────
//
// Entra `erpContraElPapelPct`, que recibe `{ papel, erp }` y no una fila: el
// arnés la evalúa igual y da null. Medido contra la grilla anterior
// (`26b32221…` / `e0a0f917…`): las 150 filas ganan ese campo en null y no
// cambia ningún otro.
test("los estados y avisos de cada línea, salvo el precio del maní, son los mismos de antes (grilla completa)", () => {
  const e = estados();
  assert.equal(huella(sinElPrecioDelMani(e)), "24f157272fd7eb6f45e5aef8e3b91aa5d0a97af5f3dfec85e95e8271430fa30b");
  assert.equal(huella(e), "9eb7956fb7f4c5b56a55a9c1e2b62d72aeada65b5977b899de5ade13f255d739");
  assert.equal(e["0|pack12|UNIDAD|3|3|0|null"].precioDistintoDentroDeLaVariacion, true, "el +2,3 % por unidad es un precio común");
  // El cambio, dicho y no solo sellado en la huella.
  const pack12 = e["0|pack12|UNIDAD|3|3|0|null"];
  assert.equal(pack12.loQueNoCuadra.que, "PRECIO", "un 2 % de diferencia por unidad no es otra escala");
  assert.equal(pack12.saltoDePrecioAceptable, true);
});

test("EL MANÍ 1881, SIN PACK PARA LA PIEZA: lo que no cuadra es el precio, no la escala", () => {
  const e = estados();
  const f = e["0|mani1881|UNIDAD|3|3|0|null"];
  assert.equal(f.loQueNoCuadra.que, "PRECIO");
  assert.equal(f.saltoDePrecioAceptable, true);
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
  // Desde la tanda 17 también los bultos y sueltas (`bultosYSueltas`).
  assert.match(fuente, /import \{ bultosYSueltas, cantidadEnUnidades, comoViene, unidadDelBulto \} from "@\/lib\/unidades\/reglaDeUnidades";/);
  assert.ok(!/Math\.floor\(\w+ \/ factor\)/.test(fuente), "volvió a partir a mano");
  assert.match(fuente, /const factor = bultoDeLaFila\(fila\);/, "el precio de una unidad lee el bulto con la pieza");
  assert.ok(!/(enEscala|pedida) \* factor/.test(fuente), "volvió a multiplicar a mano");
  assert.ok(!/costo \/ factor/.test(fuente), "volvió a dividir a mano");
});
