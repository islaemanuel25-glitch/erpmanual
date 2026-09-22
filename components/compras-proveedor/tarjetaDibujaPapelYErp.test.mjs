// LA TARJETA DIBUJA PAPEL Y ERP. NO "LOS CALCULA": LOS DIBUJA.
//
//   node --import ./scripts/alias-loader.mjs --test components/compras-proveedor/tarjetaDibujaPapelYErp.test.mjs
//
// ── POR QUÉ ESTE CANDADO EXISTE ───────────────────────────────────────────
//
// La tarjeta con las líneas "Papel" y "ERP" se desplegó y NO apareció en el
// celular. Lo que se había medido eran sus NÚMEROS —llamando a
// `renglonesDeLaTarjeta` desde afuera con los datos del servidor— y eso
// contesta "la cuenta da bien", no "la pantalla lo dibuja".
//
// La causa: una rama anterior para `sinPedidoPrevio` —un pedido que NACIÓ de la
// factura, como el #242— dibujaba "Factura 12" y nada más. Los candados de los
// números estaban todos en verde y el renglón que los dibuja no corría nunca.
//
// Es la regla 2 de CLAUDE.md: los candados prueban piezas, la pantalla prueba
// el camino, y los defectos viven entre las piezas. Así que acá se RENDERIZA el
// componente y se lee el texto que produce.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TarjetaLineaFactura from "./TarjetaLineaFactura.jsx";

/**
 * La fila de Papas Congeladas del #242, como la manda el servidor. Los valores
 * salen de la conciliación medida en producción, no están escritos de memoria:
 * el costo del ERP llega YA convertido a la unidad del depósito ($9.500 la
 * bolsa, que son $3.800 el kilo × 2,5 kg).
 */
const FILA = {
  lineaId: 101,
  producto: "Papas Congeladas",
  textoCrudo: "BUTLER C. TRAD 9MM X2.5KG -6-",
  cantidad: 12,
  cantidadPedida: 12,
  unidadPedido: "BULTO",
  factorPack: null,
  porKilo: false,
  faltanKilos: false,
  productoLocalId: 6211,
  productoBaseId: 2105,
  pedidoDetalleId: 900,
  subtotal: 97998.47,
  costoFactura: 97998.47 / 12,
  costoCatalogo: 9500,
};

const aLaVista = (props) =>
  renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: FILA, ...props }))
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

test("CON PEDIDO PREVIO, LA TARJETA DIBUJA FACTURA, PAPEL Y ERP", () => {
  const texto = aLaVista({});
  assert.match(texto, /Papas Congeladas/);
  assert.match(texto, /Factura/);
  assert.match(texto, /Papel/);
  assert.match(texto, /ERP/);
  // Los importes, con su unidad al lado, y el porcentaje contra el ERP.
  assert.match(texto, /8\.166,54/);
  assert.match(texto, /9\.500,00/);
  assert.match(texto, /\/ u/);
  assert.match(texto, /\+14,0 %/);
  // Y el pie: la acción a la izquierda, el total a la derecha.
  assert.match(texto, /Corregir/);
  assert.match(texto, /97\.998,47/);
});

test("Y SIN PEDIDO PREVIO TAMBIÉN — QUE ES EL CASO DEL #242", () => {
  // ── EL CANDADO QUE FALTABA ──────────────────────────────────────────
  //
  // El #242 nació de una factura, así que entra por acá. Antes esta rama
  // dibujaba "Factura 12" y el total, sin ningún precio: el papel contra el
  // precio interno NO depende de haber pedido nada, y era justamente la
  // pantalla donde más falta hacen.
  const texto = aLaVista({ sinPedidoPrevio: true });
  assert.match(texto, /Papel/, "la rama del pedido nacido de factura no dibuja el Papel");
  assert.match(texto, /ERP/, "la rama del pedido nacido de factura no dibuja el ERP");
  assert.match(texto, /8\.166,54/);
  assert.match(texto, /9\.500,00/);
  assert.match(texto, /\+14,0 %/);
});

test("SIN PEDIDO PREVIO NO SE DICE «falta» NI «sobra»", () => {
  // Comparan contra un pedido que no existió: serían afirmaciones falsas sobre
  // la mercadería que se está recibiendo.
  const faltando = { ...FILA, cantidadPedida: 20 };
  const conPedido = renderToStaticMarkup(
    React.createElement(TarjetaLineaFactura, { fila: faltando })
  ).replace(/<[^>]*>/g, " ");
  assert.match(conPedido, /falta/, "con pedido previo sí se dice");

  const sinPedido = renderToStaticMarkup(
    React.createElement(TarjetaLineaFactura, { fila: faltando, sinPedidoPrevio: true })
  ).replace(/<[^>]*>/g, " ");
  assert.ok(!/falta \d/.test(sinPedido), "se dijo «falta» sobre un pedido que no existió");
});

test("SIN ERP COMPARABLE SE DIBUJA EL PAPEL SOLO", () => {
  const texto = renderToStaticMarkup(
    React.createElement(TarjetaLineaFactura, { fila: { ...FILA, costoCatalogo: null } })
  ).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  assert.match(texto, /Papel/);
  assert.ok(!/\bERP\b/.test(texto), "se dibujó una comparación contra nada");
});

test("Y NO VOLVIERON EL TACHADO NI «YA DECIDIDO»", () => {
  const html = renderToStaticMarkup(React.createElement(TarjetaLineaFactura, { fila: FILA }));
  assert.ok(!/line-through/.test(html), "volvió el precio tachado");
  assert.ok(!/Ya decidido/.test(html));
});
