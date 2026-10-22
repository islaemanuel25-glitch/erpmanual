// LA FICHA (LA HOJA DE CORRECCIÓN) DE LA RECEPCIÓN SE DIBUJA IGUAL QUE ANTES.
//
//   node --import ./scripts/alias-loader.mjs --test components/transferencias/fichaRecepcionIgual.test.mjs
//
// El 2026-10-22 el par de campos de cantidad —completos y sueltas, al 35 % cada
// uno— salió de `FichaProductoRecepcion.jsx` a `ParDeCantidades` y
// `CajaDeCantidad` (`components/revision/PiezasDeRevision.jsx`), para que el
// depósito corrija lo que prepara con la misma hoja. La recepción no cambia.
//
// `fichaRecepcionAntes.fixture.json` es el HTML de la ficha ANTES de sacarlo
// (tomado sobre 5b6235b), para cada línea REAL de la transferencia de la
// sección 14 de `scripts/pruebas-db/pedidosEnviarCancelar.mjs`, recién enviada
// y con dos revisadas, con y sin permiso, en la hoja del teléfono y en la
// computadora. Cada caso guarda su línea y su HTML juntos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Ficha from "./FichaProductoRecepcion.jsx";

const foto = JSON.parse(readFileSync("components/transferencias/fichaRecepcionAntes.fixture.json", "utf8"));

const pintar = ({ d, puedeRecibir, enHoja }) =>
  renderToStaticMarkup(
    React.createElement(Ficha, { producto: d, puedeRecibir, enHoja, guardando: false, onRevisar: () => {}, onQuitar: () => {} })
  );

test("la foto cubre el par de campos, con y sin permiso, en la hoja y en la computadora", () => {
  assert.equal(foto.casos.length, 40);
  assert.equal(foto.casos.filter((c) => c.html.includes('class="w-35p"')).length, 20, "faltan las fichas con el par de campos");
  assert.ok(foto.casos.some((c) => c.enHoja && c.puedeRecibir && /<input/.test(c.html)), "falta la hoja con los campos");
  assert.ok(foto.casos.some((c) => c.nombre === "AGUA X6" && c.enHoja && /Unidades sueltas/.test(c.html)), "falta la de bulto con sueltas");
});

for (const caso of foto.casos) {
  test(`${caso.momento} · ${caso.nombre} · ${caso.puedeRecibir ? "con" : "sin"} permiso · ${caso.enHoja ? "hoja" : "computadora"}: el mismo HTML`, () => {
    assert.equal(pintar(caso), caso.html);
  });
}
