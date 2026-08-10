// Qué tiene que seguir funcionando después de vaciarle el código de barra a un
// producto.
//
// La migración 20260810210000 le puso el código en NULL a 33 productos cuyo
// código era el nombre del producto volcado —más de 8 caracteres—. Son
// productos VIVOS:
// 41 de los 57 que quedan y 20 de los 33 que se vacían tienen ventas, varias
// del mismo día de la medición. Vaciarles el código no puede dejarlos sin encontrar ni sin vender.
//
// Estos candados no miran la migración —esa se aplica una sola vez y después no
// existe más— sino la propiedad que la migración da por cierta: que el código de
// barra NO es lo que hace encontrable ni vendible a un producto. Si mañana
// alguien hace depender la búsqueda o la venta del código, estos se ponen rojos
// y avisan que hay 33 productos que quedarían fuera.
//
// Los nombres y códigos que aparecen acá son reales, de la lista que está en
// docs/business-rules/codigos-vaciados-2026-08-10.md.
//
// NO se usan acá las abreviaturas cortas —bica, chori, camel10— porque esas NO
// se vacían: salieron del vaciado al cambiar el criterio a "más de 8
// caracteres", justamente por parecerse a un atajo de tecleo en uso.

import { test } from "node:test";
import assert from "node:assert/strict";

import { rankearProductos } from "@/lib/pos-ventas/rankearProductos";
import { subtotalLinea } from "@/lib/pos-ventas/lineaPorImporte";

// Tres de los 33, como quedan DESPUÉS de vaciarles el código. Los tres se
// venden: Mortadela Paladini tenía 82 ventas y BARRA TREMBLAY 201.
const sinCodigo = [
  { id: 2099, nombre: "Mortadela Paladini", codigoBarra: null },
  { id: 79, nombre: "BARRA TREMBLAY", codigoBarra: null },
  { id: 2297, nombre: "Medialunas Saladas Congeladas x75", codigoBarra: null },
];
// Un producto cualquiera con código bueno, para que la comparación tenga sentido.
const conCodigo = { id: 1, nombre: "Coca Cola 500ml", codigoBarra: "7790895641749" };

const primero = (items, q) => rankearProductos(items, q)[0];

test("un producto sin código se sigue encontrando por su nombre exacto", () => {
  const items = [conCodigo, ...sinCodigo];
  assert.equal(primero(items, "Mortadela Paladini").id, 2099);
  assert.equal(primero(items, "BARRA TREMBLAY").id, 79);
});

test("un producto sin código se sigue encontrando escribiendo el principio", () => {
  // Es como se buscaban antes: "mortadela" era el código y también el principio
  // del nombre. Al vaciar el código, tiene que seguir apareciendo igual.
  const items = [conCodigo, ...sinCodigo];
  assert.equal(primero(items, "mortadela").id, 2099);
  assert.equal(primero(items, "BARRA").id, 79);
  assert.equal(primero(items, "Medialunas").id, 2297);
});

test("se encuentra por una palabra del medio del nombre", () => {
  const items = [conCodigo, ...sinCodigo];
  assert.equal(primero(items, "Saladas").id, 2297);
});

test("vaciar el código NO empuja al producto abajo de uno que conservó basura", () => {
  // El riesgo concreto: si el que quedó con un código-basura ganara por tener
  // algo en ese campo, el producto limpio se hundiría en la lista.
  const conBasura = { id: 999, nombre: "Otro producto", codigoBarra: "mortadelapaladini" };
  const orden = rankearProductos([conBasura, sinCodigo[0]], "Mortadela Paladini");
  assert.equal(orden[0].id, 2099, "el que coincide por nombre tiene que ir primero");
});

test("un código vacío no matchea una búsqueda vacía ni cualquier texto", () => {
  // `(p.codigoBarra || "")` convierte null en "". Si esa cadena vacía se
  // comparara suelta contra la consulta, todos los productos sin código
  // empatarían en el primer puesto con cualquier búsqueda.
  const items = [conCodigo, ...sinCodigo];
  assert.equal(primero(items, "Coca Cola 500ml").id, 1);
  assert.equal(primero(items, "7790895641749").id, 1, "el código exacto sigue ganando");
  // Consulta vacía: devuelve la lista tal cual, sin reordenar por códigos vacíos.
  assert.deepEqual(rankearProductos(items, "").map((p) => p.id), items.map((p) => p.id));
  assert.deepEqual(rankearProductos(items, "   ").map((p) => p.id), items.map((p) => p.id));
});

test("null y undefined en el código se tratan igual que ausente", () => {
  const a = { id: 10, nombre: "Producto A", codigoBarra: null };
  const b = { id: 11, nombre: "Producto B" }; // sin la propiedad
  assert.equal(primero([a, b], "Producto B").id, 11);
  assert.equal(primero([a, b], "Producto A").id, 10);
});

test("un producto sin código se puede vender: la plata de la línea no lo mira", () => {
  // Vendible = la línea calcula su importe. Ninguno de los dos caminos —precio
  // por cantidad, o importe fijado— lee el código.
  assert.equal(subtotalLinea({ precio: 1500, cantidad: 3, codigoBarra: null }), 4500);
  assert.equal(subtotalLinea({ precio: 1500, cantidad: 3 }), 4500);
  assert.equal(
    subtotalLinea({ precio: 1500, cantidad: 3, codigoBarra: "7790895641749" }),
    subtotalLinea({ precio: 1500, cantidad: 3, codigoBarra: null }),
    "tener o no código no puede cambiar el importe"
  );
});

test("una venta por kilo sin código también calcula", () => {
  assert.equal(subtotalLinea({ precio: 8000, cantidad: 0.75, codigoBarra: null }), 6000);
});
