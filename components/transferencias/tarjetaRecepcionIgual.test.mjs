// LA TARJETA DE LA RECEPCIÓN SE DIBUJA IGUAL QUE ANTES DE SACARLE LA FORMA.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/tarjetaRecepcionIgual.test.mjs
//
// El 2026-10-22 la forma de la tarjeta —abierta y colapsada— y sus dos clases
// de acción salieron de `TarjetaRecepcionMovil.jsx` a
// `components/revision/PiezasDeRevision.jsx`, para que el depósito prepare con
// la misma mecánica. La condición era que la recepción no cambiara en nada.
//
// `tarjetaRecepcionAntes.fixture.json` es el HTML que dibujaba la tarjeta ANTES
// de sacarla (tomado sobre 4cd3ba7), para cada línea REAL de una transferencia
// de la sección 14 de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`: recién
// enviada (cinco abiertas, una por bulto) y con dos ya revisadas (una que
// coincide y una corregida a 0, Faltante), cada una con y sin permiso de
// recibir. Cada caso guarda su línea y su HTML juntos: no se regenera con el
// script, que produciría líneas nuevas para un HTML viejo.
//
// Se compara el HTML ENTERO, carácter por carácter. Una clase de más, un
// atributo en otro orden o un nodo de texto partido distinto ya es otra cosa.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaRecepcionMovil from "./TarjetaRecepcionMovil.jsx";

const foto = JSON.parse(readFileSync("components/transferencias/tarjetaRecepcionAntes.fixture.json", "utf8"));

const pintar = ({ d, puedeRecibir }) =>
  renderToStaticMarkup(
    React.createElement(TarjetaRecepcionMovil, { d, puedeRecibir, guardando: false, onRevisar: () => {}, onAbrirFicha: () => {} })
  );

test("la foto cubre las dos formas: abierta y colapsada, coincidente y corregida, con y sin permiso", () => {
  assert.equal(foto.casos.length, 20);
  const colapsadas = foto.casos.filter((c) => /<svg/.test(c.html));
  assert.equal(colapsadas.length, 4, "faltan las colapsadas (coincide y corregida, con y sin permiso)");
  assert.ok(foto.casos.some((c) => /sunmi-state-warning/.test(c.html)), "falta la corregida");
  assert.ok(foto.casos.some((c) => /✓ Coincide/.test(c.html)), "falta la abierta con Coincide");
  assert.ok(foto.casos.some((c) => c.puedeRecibir === false), "falta sin permiso");
  assert.ok(foto.casos.some((c) => c.nombre === "AGUA X6"), "falta la de bulto");
});

for (const caso of foto.casos) {
  test(`${caso.momento} · ${caso.nombre} · ${caso.puedeRecibir ? "con" : "sin"} permiso: el mismo HTML`, () => {
    assert.equal(pintar(caso), caso.html);
  });
}
