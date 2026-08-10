// Qué tiene que seguir funcionando después de vaciarle el código de barra a un
// producto.
//
// La migración 20260810210000 le puso el código en NULL a 29 productos que
// tenían basura en esa columna y NINGUNA VENTA. Los otros 61 quedaron intactos
// justamente por tener ventas: no hay regla de forma que separe un atajo de
// tecleo en uso de una basura heredada, y la que sí separa es el uso.
//
// Vaciarles el código a esos 29 no puede dejarlos sin encontrar ni sin vender:
// diez tienen stock y cinco están pedidos al proveedor, así que van a volver a
// pasar por el mostrador aunque todavía no hayan vendido nada.
//
// Estos candados no miran la migración —esa se aplica una sola vez y después no
// existe más— sino la propiedad que la migración da por cierta: que el código de
// barra NO es lo que hace encontrable ni vendible a un producto. Si mañana
// alguien hace depender la búsqueda o la venta del código, estos se ponen rojos
// y avisan que hay 29 productos que quedarían fuera.
//
// Los nombres y códigos que aparecen acá son reales, de la lista que está en
// docs/business-rules/codigos-vaciados-2026-08-10.md.
//
// NO se usan acá productos con ventas —ni bica, ni mortadela, ni BARRATREMBLAY—
// porque esos NO se vacían. Los tres de abajo tienen cero ventas y son los que
// la migración toca de verdad.

import { test } from "node:test";
import assert from "node:assert/strict";

import { rankearProductos } from "@/lib/pos-ventas/rankearProductos";
import { subtotalLinea } from "@/lib/pos-ventas/lineaPorImporte";

// Tres de los 29, como quedan DESPUÉS de vaciarles el código. Sus códigos eran
// "bizcochocongelado", "BOCADITO CHOC BLANCO" y "medialunassaladas".
const sinCodigo = [
  { id: 2295, nombre: "Bizcocho Congelado", codigoBarra: null },
  { id: 1800, nombre: "GRANIX BOCADITO CHOC. BLANCO 2KG", codigoBarra: null },
  { id: 2297, nombre: "Medialunas Saladas Congeladas x75", codigoBarra: null },
];
// Un producto cualquiera con código bueno, para que la comparación tenga sentido.
const conCodigo = { id: 1, nombre: "Coca Cola 500ml", codigoBarra: "7790895641749" };

const primero = (items, q) => rankearProductos(items, q)[0];

test("un producto sin código se sigue encontrando por su nombre exacto", () => {
  const items = [conCodigo, ...sinCodigo];
  assert.equal(primero(items, "Bizcocho Congelado").id, 2295);
  assert.equal(primero(items, "Medialunas Saladas Congeladas x75").id, 2297);
});

test("un producto sin código se sigue encontrando escribiendo el principio", () => {
  // Es como se buscaban antes: "bizcochocongelado" era el código y también el
  // principio del nombre sin espacios. Al vaciar el código, el producto tiene que
  // seguir apareciendo escribiendo el principio del nombre.
  const items = [conCodigo, ...sinCodigo];
  assert.equal(primero(items, "Bizcocho").id, 2295);
  assert.equal(primero(items, "GRANIX").id, 1800);
  assert.equal(primero(items, "Medialunas").id, 2297);
});

test("se encuentra por una palabra del medio del nombre", () => {
  const items = [conCodigo, ...sinCodigo];
  assert.equal(primero(items, "Saladas").id, 2297);
  assert.equal(primero(items, "BOCADITO").id, 1800);
});

test("vaciar el código NO empuja al producto abajo de uno que conservó basura", () => {
  // El riesgo concreto: si el que quedó con un código-basura ganara por tener
  // algo en ese campo, el producto limpio se hundiría en la lista.
  const conBasura = { id: 999, nombre: "Otro producto", codigoBarra: "bizcochocongelado" };
  const orden = rankearProductos([conBasura, sinCodigo[0]], "Bizcocho Congelado");
  assert.equal(orden[0].id, 2295, "el que coincide por nombre tiene que ir primero");
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
