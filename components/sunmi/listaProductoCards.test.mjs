// LA GRILLA DE TARJETAS: IGUALA ALTOS SALVO QUE SE PIDA LO CONTRARIO.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/listaProductoCards.test.mjs
//
// Productos, Stock, Ofertas y el Control de stock cuentan con `auto-rows-fr`.
// Pedidos pidió que cada tarjeta mida lo suyo: es una opción, apagada.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { default: SunmiListaProductoCards } = await import("./SunmiListaProductoCards.jsx");
const pintar = (props) => renderToStaticMarkup(React.createElement(SunmiListaProductoCards, props, React.createElement("i")));

test("sin la opción, la grilla de siempre, letra por letra", () => {
  assert.equal(pintar({}), '<div class="grid grid-cols-1 auto-rows-fr sunmi-product-list"><i></i></div>');
});

test("con mismoAlto={false}, el mismo hueco y sin igualar altos", () => {
  const html = pintar({ mismoAlto: false });
  assert.doesNotMatch(html, /auto-rows-fr/);
  assert.match(html, /class="grid grid-cols-1 sunmi-product-list"/, "se perdió la grilla o el hueco del kit");
});
