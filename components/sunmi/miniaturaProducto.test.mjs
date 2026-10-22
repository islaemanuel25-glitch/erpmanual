// LA MINIATURA DEL PRODUCTO: CON FOTO, LA FOTO; SIN FOTO, NADA O LA INICIAL.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/miniaturaProducto.test.mjs
//
// `MiniaturaProductoTarjeta` sin foto devolvía null, y así la siguen usando
// `TarjetaProductoMovil` y el resto. Pedidos al depósito pidió conservar el
// cuadrado con la inicial: es una opción, `conservaLugar`, apagada por defecto.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { MiniaturaProductoTarjeta } = await import("./SunmiProductoCard.jsx");

const pintar = (props) => renderToStaticMarkup(React.createElement(MiniaturaProductoTarjeta, props));
const FOTO = "/uploads/productos/agua-x6.jpg";

// Capturado en 758f559, ANTES de agregar la opción, montando la pieza con
// `renderToStaticMarkup`. No transcrito a mano.
const CONGELADO_CON_FOTO =
  '<img data-tarjeta-foto="true" src="/uploads/productos/agua-x6.jpg" alt="" aria-hidden="true" loading="lazy" decoding="async" class="sunmi-product-thumbnail shrink-0 rounded-lg object-contain"/>';

test("con la opción apagada, la miniatura es la de siempre: la foto, o nada", () => {
  assert.equal(pintar({ url: FOTO }), CONGELADO_CON_FOTO, "cambió la foto de los que no piden la opción");
  assert.equal(pintar({ url: null }), "", "sin foto tiene que seguir sin dibujar nada");
  assert.equal(pintar({ url: null, nombre: "Coca 2L" }), "", "el nombre solo no prende la inicial");
});

test("con conservaLugar y foto, la foto, igual que siempre", () => {
  assert.equal(pintar({ url: FOTO, conservaLugar: true, nombre: "Agua x6" }), CONGELADO_CON_FOTO);
});

test("con conservaLugar y sin foto, la inicial en el mismo cuadrado", () => {
  const html = pintar({ url: null, conservaLugar: true, nombre: "coca 2L" });
  assert.match(html, /data-tarjeta-inicial/);
  // El mismo lado que la foto —el token del kit— y el fondo de control del tema.
  assert.match(html, /class="sunmi-product-thumbnail shrink-0 rounded-lg sunmi-control /, "no es el mismo cuadrado");
  assert.match(html, /flex items-center justify-center/, "la inicial va centrada");
  assert.match(html, /sunmi-text-muted/, "la inicial va en texto suave");
  assert.match(html, />C<\/span>$/, "la inicial es la del nombre, en mayúscula");
  // Sin nombre, un signo: el cuadrado no queda vacío.
  assert.match(pintar({ url: "", conservaLugar: true }), />\?<\/span>$/);
});
