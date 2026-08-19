// EL CRITERIO DE "LISTA AL COSTO" ES UNO SOLO, Y LO USAN LOS DOS LADOS.
//
// `esListaAlCosto` no se escribió para el catálogo: se EXTRAJO de la rama COSTO
// de `calcularPrecioConLista`, que ya decidía exactamente eso para elegir entre
// COSTO_PURO y COSTO_MAS_MARGEN.
//
// Lo que estos candados defienden no es la función sino que siga habiendo UN
// criterio. Si alguien vuelve a escribir la condición inline en el `switch`, los
// dos lados quedan libres de divergir: el POS cobraría según una regla y la
// tarjeta mostraría según otra, sobre el mismo producto y sin que nada falle.
//
// Por eso hay dos clases de candado acá: los de comportamiento —que la función
// conteste bien— y uno que mira el CÓDIGO, para que la rama no se despegue.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { calcularPrecioConLista, esListaAlCosto } from "./calcularPrecioConLista.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const ARCHIVO = "lib/precios/calcularPrecioConLista.js";

// ── El predicado ────────────────────────────────────────────────────────────

test("una lista COSTO sin margen es al costo", () => {
  assert.equal(esListaAlCosto({ tipoBase: "COSTO", margenPorcentaje: null }), true);
});

test("una lista COSTO con margen 0 TAMBIÉN es al costo", () => {
  // Es el caso real de producción: la lista 2, "Costo", tiene margen 0.00 y no
  // nulo. Si este candado se cae, el depósito deja de reconocerse.
  assert.equal(esListaAlCosto({ tipoBase: "COSTO", margenPorcentaje: 0 }), true);
});

test("el margen llega como Decimal de Prisma —string— y sigue contando como cero", () => {
  // Prisma devuelve Decimal(6,2), que en JS llega como string "0.00". Comparar
  // con === 0 sin convertir daría false y el depósito se leería como si tuviera
  // margen.
  assert.equal(esListaAlCosto({ tipoBase: "COSTO", margenPorcentaje: "0.00" }), true);
});

test("una lista COSTO CON margen real no es al costo", () => {
  assert.equal(esListaAlCosto({ tipoBase: "COSTO", margenPorcentaje: 25 }), false);
});

test("una lista PRECIO_VENTA no es al costo, tenga el margen que tenga", () => {
  assert.equal(esListaAlCosto({ tipoBase: "PRECIO_VENTA", margenPorcentaje: 0 }), false);
});

test("sin lista no es al costo —y no explota—", () => {
  // El resolver devuelve `lista: null` en todo local sin cliente. Es el camino
  // más transitado de los dos, así que tiene que contestar false y no romper.
  assert.equal(esListaAlCosto(null), false);
  assert.equal(esListaAlCosto(undefined), false);
});

// ── La coherencia con el precio que se cobra ────────────────────────────────

test("cuando el predicado dice que sí, el precio calculado ES el costo", () => {
  // Éste es el que ata las dos mitades: no alcanza con que el predicado conteste
  // bien, tiene que coincidir con lo que el motor de precios efectivamente cobra.
  const lista = { id: 2, tipoBase: "COSTO", margenPorcentaje: 0 };
  assert.equal(esListaAlCosto(lista), true);

  const r = calcularPrecioConLista({ precioVenta: 31900, costo: 24000, lista });
  assert.equal(r.precioFinal, 24000, "el POS cobra el costo, así que la tarjeta tiene que mostrar el costo");
  assert.equal(r.tipoPrecioAplicado, "COSTO_PURO");
});

test("cuando dice que no, el precio NO es el costo", () => {
  const lista = { id: 9, tipoBase: "COSTO", margenPorcentaje: 25 };
  assert.equal(esListaAlCosto(lista), false);

  const r = calcularPrecioConLista({ precioVenta: 31900, costo: 24000, lista });
  assert.equal(r.precioFinal, 30000);
  assert.equal(r.tipoPrecioAplicado, "COSTO_MAS_MARGEN");
});

// ── Que el criterio NO se duplique ──────────────────────────────────────────

test("la rama COSTO llama al predicado, no reescribe la condición", () => {
  // ⚠️ LOS COMENTARIOS SE SACAN ANTES DE MIRAR. Este mismo archivo y el de al
  // lado nombran `esListaAlCosto` en prosa varias veces, y un candado que mire el
  // texto crudo encontraría esas menciones y daría VERDE con la llamada sacada.
  // Es el falso verde del candado de `Escape`, que ya pasó tres veces.
  const src = fs
    .readFileSync(path.join(RAIZ, ARCHIVO), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(
    src,
    /case\s+"COSTO":[\s\S]{0,200}?if\s*\(\s*esListaAlCosto\(/,
    "la rama COSTO dejó de llamar a esListaAlCosto: el criterio se duplicó y la tarjeta y el POS pueden divergir"
  );

  assert.doesNotMatch(
    src,
    /if\s*\(\s*margen\s*==\s*null\s*\|\|\s*margen\s*===\s*0\s*\)/,
    "volvió la condición inline en el switch: hay dos criterios otra vez"
  );
});

test("EL CANDADO SABE MIRAR: encuentra la rama que sí está", () => {
  // Su par. Sin esto, un `replace` mal escrito o una ruta equivocada dan el mismo
  // vacío que "la llamada no está", y ese vacío se lee como la respuesta que uno
  // esperaba.
  const src = fs.readFileSync(path.join(RAIZ, ARCHIVO), "utf8");
  assert.match(src, /case\s+"COSTO":/, "el archivo no tiene la rama COSTO: el candado está mirando el lugar equivocado");
  assert.match(src, /export function esListaAlCosto/, "la función no está exportada donde el candado la busca");
});
