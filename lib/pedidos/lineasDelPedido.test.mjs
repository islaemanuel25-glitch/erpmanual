// LAS LÍNEAS DEL PEDIDO: UNA POR PRODUCTO, CON LA CANTIDAD SUMADA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pedidos/lineasDelPedido.test.mjs
//
// Con las respuestas REALES del recorrido del celular sobre erpazul_al
// (`scripts/pruebas-db/pedidosEnviarCancelar.mjs`, sección 7): dos toques
// rápidos al + sobre "9 DE ORO AGRIDULCE" dejaron dos líneas, de 1 y de 2.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { juntarPorProducto, claveDeLoEnviado, cantidadEnPantalla } from "./lineasDelPedido.js";

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));
const ORO = "9 DE ORO AGRIDULCE";

test("el recorrido real dejó dos líneas del mismo producto", () => {
  assert.equal(real.recorridoFilasDuplicadas.filas, 2, "la carrera no se reprodujo");
  const deOro = real.recorridoRevision.cuerpo.items.filter((i) => i.nombre === ORO);
  assert.deepEqual(deOro.map((i) => i.sugerido).sort(), [1, 2]);
  assert.equal(real.recorridoTrasEnviar.cuerpo.pendiente.items.filter((i) => i.nombre === ORO).length, 2);
});

test("Ver mi pedido: una línea por producto, y la de dos líneas suma", () => {
  const lineas = juntarPorProducto(real.recorridoRevision.cuerpo.items, (i) => i.productoLocalId);
  assert.equal(lineas.length, 5, "cinco productos");
  assert.equal(new Set(lineas.map((l) => l.productoLocalId)).size, 5, "un producto se repite");
  const oro = lineas.find((l) => l.nombre === ORO);
  assert.equal(oro.cantidad, 3, "1 + 2");
  assert.equal(oro.lineas, 2);
  assert.ok(lineas.filter((l) => l.nombre !== ORO).every((l) => l.cantidad === 2 && l.lineas === 1));
});

test("el pedido enviado: lo mismo, con la clave que trae la ruta", () => {
  const enviados = juntarPorProducto(real.recorridoTrasEnviar.cuerpo.pendiente.items, claveDeLoEnviado);
  assert.equal(enviados.length, 5);
  assert.equal(new Set(enviados.map((l) => l.nombre)).size, 5);
  assert.equal(enviados.find((l) => l.nombre === ORO).cantidad, 3);
});

test("suma en la unidad de la pantalla: un bulto y una línea vieja en unidades", () => {
  // La forma real de una línea por bulto (del agua de la sección 1), una vez en
  // BULTO y otra en UNIDAD como las guardaba la versión vieja: 2 bultos + 12
  // unidades de un pack de 6 son 4 bultos.
  const agua = real.carritoBorrador.cuerpo.items.find((i) => i.nombre === "Agua x6");
  const vieja = { ...agua, sugerido: 12, unidadSugerida: "UNIDAD" };
  assert.equal(cantidadEnPantalla(vieja), 2);
  const [una] = juntarPorProducto([agua, vieja], (i) => i.productoLocalId);
  assert.equal(una.cantidad, 4);
});

test("sin repetidos no cambia nada", () => {
  const items = real.carritoBorrador.cuerpo.items;
  const lineas = juntarPorProducto(items, (i) => i.productoLocalId);
  assert.equal(lineas.length, items.length);
  assert.deepEqual(lineas.map((l) => l.cantidad), items.map(cantidadEnPantalla));
});
