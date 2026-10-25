// EL RENGLÓN DE UN PEDIDO AL DEPÓSITO TRAE SU CATEGORÍA CUANDO LA BASE LA TRAE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/itemDelPedido.test.mjs
//
// La columna CATEGORÍA de "Lo que pedí", en la computadora
// (`components/pedidos/PedidosEscritorio.jsx`), lee `categoriaNombre` del
// carrito. La ruta del carrito pide la categoría de la base
// (`BASE_CON_CATEGORIA`); el detalle del historial no, y ahí va `null`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { itemDelPedido, BASE_CON_CATEGORIA } from "./itemDelPedido.js";

const linea = (base) => ({ id: 1, productoId: 7, sugerido: 2, preparado: 0, unidadSugerida: "UNIDAD", producto: { baseId: 3, nombre: "Coca 2L", base } });

test("con la categoría en la base, va su nombre", () => {
  assert.equal(itemDelPedido(linea({ factor_pack: 1, categoria: { nombre: "Bebidas" } })).categoriaNombre, "Bebidas");
});

test("sin categoría pedida, o sin categoría, va null", () => {
  assert.equal(itemDelPedido(linea({ factor_pack: 1 })).categoriaNombre, null);
  assert.equal(itemDelPedido(linea({ factor_pack: 1, categoria: null })).categoriaNombre, null);
});

test("BASE_CON_CATEGORIA pide el nombre de la categoría de la base, y con eso sale categoriaNombre", () => {
  assert.deepEqual(BASE_CON_CATEGORIA, { base: { include: { categoria: { select: { nombre: true } } } } });
});

test("la ruta del carrito la pide en las DOS consultas —el borrador y el enviado— y el detalle de un pedido en la suya", () => {
  const sin = (f) => readFileSync(f, "utf8").replace(/\/\/[^\n]*/g, "");
  const carrito = sin("app/api/pedidos/carrito/route.js");
  assert.equal((carrito.match(/include: BASE_CON_CATEGORIA/g) || []).length, 2);
  assert.doesNotMatch(carrito, /include: \{ base: true \}/, "quedó una consulta del carrito sin la categoría");
  const detalle = sin("app/api/pedidos/historial/[id]/route.js");
  assert.match(detalle, /producto: \{ include: BASE_CON_CATEGORIA \}/);
  assert.doesNotMatch(detalle, /include: \{ base: true \}/, "el detalle sigue sin la categoría");
});
