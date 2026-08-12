// Candados de la cobertura del pedido.
//
// Lo que se protege: que una factura PARCIAL no se lea como una falta. Un pedido
// se cubre con varias facturas —el de Mauro tiene 34 líneas y el comprobante que
// llegó trajo 21— y contar cada comprobante contra el pedido entero haría que
// toda entrega parcial pareciera incompleta.
//
// Un aviso que siempre dice que falta algo deja de significar que falta algo.

import { test } from "node:test";
import assert from "node:assert/strict";

import { coberturaDelPedido, textoDeCobertura } from "./cobertura.js";

const pedidoDe = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, productoBaseId: 100 + i, nombre: `Producto ${i + 1}` }));

test("UNA FACTURA PARCIAL NO ES UNA FALTA: se cuenta contra TODOS los comprobantes", () => {
  // El caso de Mauro, con los números reales: 34 líneas de pedido, 21 en el
  // primer comprobante.
  const detalles = pedidoDe(34);
  const primerComprobante = detalles.slice(0, 21).map((d) => ({ productoBaseId: d.productoBaseId, comprobanteId: 1 }));

  const soloUno = coberturaDelPedido({ detalles, lineasDeComprobantes: primerComprobante });
  assert.equal(soloUno.totalPedido, 34);
  assert.equal(soloUno.cubiertas, 21);
  assert.equal(soloUno.sinCubrir, 13);

  // Llega la segunda factura con el resto: se completa.
  const segundo = detalles.slice(21).map((d) => ({ productoBaseId: d.productoBaseId, comprobanteId: 2 }));
  const conLosDos = coberturaDelPedido({ detalles, lineasDeComprobantes: [...primerComprobante, ...segundo] });
  assert.equal(conLosDos.cubiertas, 34);
  assert.equal(conLosDos.sinCubrir, 0);
});

test("NO SUENA A ERROR MIENTRAS FALTEN COMPROBANTES POR LEER", () => {
  // Es la mitad que importa: el número tiene que estar a la vista sin que se lea
  // como un problema, o se aprende a ignorarlo.
  const c = coberturaDelPedido({
    detalles: pedidoDe(34),
    lineasDeComprobantes: pedidoDe(21).map((d) => ({ productoBaseId: d.productoBaseId })),
  });

  const conPendientes = textoDeCobertura(c, { comprobantesSinLeer: 2 });
  assert.equal(conPendientes.esAviso, false);
  assert.match(conPendientes.texto, /21 de 34/);
  assert.match(conPendientes.texto, /puede estar ahí/i);

  const sinPendientes = textoDeCobertura(c, { comprobantesSinLeer: 0, pedidoCerrado: false });
  assert.equal(sinPendientes.esAviso, false);
  assert.match(sinPendientes.texto, /todavía no se subió/i);
});

test("RECIÉN CON EL PEDIDO CERRADO una línea sin cubrir es una pregunta", () => {
  const c = coberturaDelPedido({
    detalles: pedidoDe(10),
    lineasDeComprobantes: pedidoDe(7).map((d) => ({ productoBaseId: d.productoBaseId })),
  });
  const t = textoDeCobertura(c, { comprobantesSinLeer: 0, pedidoCerrado: true });
  assert.equal(t.esAviso, true);
  assert.match(t.texto, /sin ningún comprobante que las respalde/i);
});

test("cubierto del todo se dice como tal", () => {
  const detalles = pedidoDe(5);
  const c = coberturaDelPedido({
    detalles,
    lineasDeComprobantes: detalles.map((d) => ({ productoBaseId: d.productoBaseId })),
  });
  const t = textoDeCobertura(c, { comprobantesSinLeer: 0 });
  assert.equal(t.tono, "ok");
  assert.match(t.texto, /Está todo cubierto/);
});

test("LO QUE VINO Y NO ESTABA PEDIDO SE CUENTA APARTE", () => {
  // No es una línea del pedido sin cubrir: es un agregado del proveedor, y
  // mezclarlo haría que el número de faltantes mintiera en las dos direcciones.
  const detalles = pedidoDe(3);
  const c = coberturaDelPedido({
    detalles,
    lineasDeComprobantes: [
      { productoBaseId: 100 },
      { productoBaseId: 999 }, // no estaba pedido
    ],
  });
  assert.equal(c.cubiertas, 1);
  assert.equal(c.sinCubrir, 2);
  assert.equal(c.deMas, 1);
});

test("una línea vinculada dos veces no cuenta doble", () => {
  const detalles = pedidoDe(3);
  const c = coberturaDelPedido({
    detalles,
    lineasDeComprobantes: [
      { productoBaseId: 100, comprobanteId: 1 },
      { productoBaseId: 100, comprobanteId: 2 },
    ],
  });
  assert.equal(c.cubiertas, 1);
});

test("cada línea dice si está cubierta, para poder mostrarlas", () => {
  const detalles = pedidoDe(3);
  const c = coberturaDelPedido({ detalles, lineasDeComprobantes: [{ productoBaseId: 101 }] });
  assert.deepEqual(c.lineas.map((l) => l.cubierta), [false, true, false]);
});

test("sin pedido no hay cobertura que informar", () => {
  assert.equal(textoDeCobertura(coberturaDelPedido({ detalles: [] }), {}), null);
  assert.equal(textoDeCobertura(null, {}), null);
});

test("basura no rompe nada", () => {
  for (const v of [null, undefined, "no soy lista"]) {
    const c = coberturaDelPedido({ detalles: v, lineasDeComprobantes: v });
    assert.equal(c.totalPedido, 0);
    assert.equal(c.cubiertas, 0);
  }
});
