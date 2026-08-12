import test from "node:test";
import assert from "node:assert/strict";

import { filasDeConciliacion } from "@/lib/compras-proveedor/comprobante/filasDeConciliacion";

// Dos comprobantes que traen la MISMA línea del pedido partida: es el caso que
// obliga a repetir la cantidad pedida y a mostrar el acumulado.
const DETALLES = [
  { id: 1, productoBaseId: 2044, nombre: "Chester 10", cantidad: 10, precioCosto: 100, unidad: "UNIDAD" },
  { id: 2, productoBaseId: 2037, nombre: "Chester 20 común", cantidad: 5, precioCosto: 200, unidad: "UNIDAD" },
  { id: 3, productoBaseId: 2161, nombre: "Marlboro 10", cantidad: 7, precioCosto: 300, unidad: "UNIDAD" },
];

const linea = (id, texto, cantidad, pedidoDetalleId, extra = {}) => ({
  id, textoCrudo: texto, cantidad,
  pedidoDetalleId,
  pedidoDetalle: pedidoDetalleId ? DETALLES.find((d) => d.id === pedidoDetalleId) : null,
  subtotalImpreso: cantidad * 100,
  ...extra,
});

const COMPROBANTES = [
  {
    id: 11, estado: "CARGADO", tipo: "A", puntoVenta: "0011", numero: "00794708",
    lineas: [linea(101, "CHESTERFIELD 10", 6, 1), linea(102, "CHESTERFIELD 20 KS", 5, 2)],
  },
  {
    id: 12, estado: "CARGADO", tipo: "A", puntoVenta: "0011", numero: "00794709",
    lineas: [linea(103, "CHESTERFIELD 10", 2, 1)],
  },
];

// ── LA CANTIDAD PEDIDA SE REPITE, Y EL ACUMULADO VA APARTE ─────────────────

test("la misma línea del pedido en dos comprobantes REPITE la cantidad pedida", () => {
  // Mostrarla solo en la primera obligaría a recordar, mirando la segunda,
  // cuánto se había pedido.
  const r = filasDeConciliacion({ comprobantes: COMPROBANTES, detalles: DETALLES });
  const primera = r.grupos[0].filas.find((f) => f.lineaId === 101);
  const segunda = r.grupos[1].filas.find((f) => f.lineaId === 103);
  assert.equal(primera.cantidadPedida, 10);
  assert.equal(segunda.cantidadPedida, 10, "la segunda también dice cuánto se pidió");
});

test("EL ACUMULADO ES ENTRE TODOS LOS COMPROBANTES, para no sumar de memoria", () => {
  const r = filasDeConciliacion({ comprobantes: COMPROBANTES, detalles: DETALLES });
  const primera = r.grupos[0].filas.find((f) => f.lineaId === 101);
  const segunda = r.grupos[1].filas.find((f) => f.lineaId === 103);
  // 6 en un comprobante + 2 en el otro = 8, en las DOS filas.
  assert.equal(primera.recibidoEntreTodos, 8);
  assert.equal(segunda.recibidoEntreTodos, 8);
  assert.match(primera.textoAcumulado, /Pediste 10, entre los comprobantes vinieron 8/);
});

test("cuando la fila trae todo lo que su comprobante aporta, no se repite el acumulado", () => {
  // Si el acumulado coincide con lo de esta fila, decirlo es ruido.
  const r = filasDeConciliacion({
    comprobantes: [{ id: 11, lineas: [linea(101, "CHESTERFIELD 20 KS", 5, 2)] }],
    detalles: DETALLES,
  });
  assert.equal(r.grupos[0].filas[0].textoAcumulado, null);
});

// ── EL GRUPO FINAL ─────────────────────────────────────────────────────────

test("las líneas que ningún comprobante trajo van APARTE, y solo si hay", () => {
  const r = filasDeConciliacion({ comprobantes: COMPROBANTES, detalles: DETALLES });
  assert.equal(r.hayFaltantes, true);
  assert.deepEqual(r.sinComprobante.map((x) => x.producto), ["Marlboro 10"]);
  assert.equal(r.totales.sinComprobante, 1);
});

test("sin faltantes, el grupo final NO existe", () => {
  const r = filasDeConciliacion({
    comprobantes: [{ id: 11, lineas: DETALLES.map((d, i) => linea(200 + i, d.nombre, d.cantidad, d.id)) }],
    detalles: DETALLES,
  });
  assert.equal(r.hayFaltantes, false);
  assert.deepEqual(r.sinComprobante, []);
});

test("dos líneas del MISMO producto en el pedido son dos líneas, no una", () => {
  // Se comparan por id del detalle, no por producto: si se comparara por
  // producto, traer una taparía la otra y el faltante desaparecería.
  const detalles = [
    { id: 1, productoBaseId: 2044, nombre: "Chester 10", cantidad: 10, precioCosto: 100 },
    { id: 9, productoBaseId: 2044, nombre: "Chester 10", cantidad: 3, precioCosto: 100 },
  ];
  const r = filasDeConciliacion({
    comprobantes: [{ id: 11, lineas: [linea(101, "CHESTERFIELD 10", 10, 1)] }],
    detalles,
  });
  assert.equal(r.sinComprobante.length, 1);
  assert.equal(r.sinComprobante[0].pedidoDetalleId, 9);
});

// ── LO QUE LA FILA MUESTRA ─────────────────────────────────────────────────

test("la fila trae lo del papel Y lo del pedido, apareado", () => {
  const r = filasDeConciliacion({ comprobantes: COMPROBANTES, detalles: DETALLES });
  const f = r.grupos[0].filas[0];
  assert.equal(f.textoCrudo, "CHESTERFIELD 10", "lo que dice el papel");
  assert.equal(f.cantidad, 6, "lo que vino");
  assert.equal(f.cantidadPedida, 10, "lo que se había pedido");
  assert.equal(f.costoCatalogo, 100, "el costo del catálogo");
  assert.equal(f.pedidoDetalleId, 1);
});

test("LA UNIDAD DEL PEDIDO Y EL VEREDICTO DE LA FACTURA NO COMPARTEN NOMBRE", () => {
  // Se llamaban las dos `unidad` y la segunda pisaba a la primera: la unidad de
  // compra del pedido desaparecía sin que nada lo dijera. Son dos hechos
  // distintos —cómo se compró y cómo cobra la factura— y van en dos claves.
  const detalles = [{ id: 1, nombre: "Mortadela", cantidad: 4, precioCosto: 100, unidad: "UNIDAD", esFiambre: true }];
  const r = filasDeConciliacion({
    comprobantes: [{
      id: 11,
      lineas: [{
        id: 101, textoCrudo: "MORTADELA", cantidad: 4, pedidoDetalleId: 1,
        pedidoDetalle: detalles[0],
        // El veredicto de la lectura, que es lo OTRO que se llamaba igual.
        unidad: { unidad: "POR_BULTO", requiereDecision: false },
      }],
    }],
    detalles,
  });
  const f = r.grupos[0].filas[0];
  assert.equal(f.unidadPedido, "UNIDAD", "cómo se compró");
  assert.equal(f.unidad?.unidad, "POR_BULTO", "cómo cobra la factura");
});

test("el fiambre llega hasta la fila, en las dos partes de la lista", () => {
  // Si el dato no llegara, la columna de kilos no se dibuja y alguien recibe
  // fiambre sin poder cargar el peso. Ya costó un arreglo entero.
  const detalles = [
    { id: 1, nombre: "Mortadela", cantidad: 4, precioCosto: 100, unidad: "UNIDAD", esFiambre: true },
    { id: 2, nombre: "Queso", cantidad: 2, precioCosto: 50, unidad: "UNIDAD", esFiambre: true },
  ];
  const r = filasDeConciliacion({
    comprobantes: [{ id: 11, lineas: [{ id: 101, cantidad: 4, pedidoDetalleId: 1, pedidoDetalle: detalles[0] }] }],
    detalles,
  });
  assert.equal(r.grupos[0].filas[0].esFiambre, true, "en la fila de la factura");
  assert.equal(r.sinComprobante[0].esFiambre, true, "y en la que nadie trajo");
});

test("una línea sin vincular no inventa datos del pedido", () => {
  const r = filasDeConciliacion({
    comprobantes: [{ id: 11, lineas: [linea(101, "ALGO RARO", 3, null)] }],
    detalles: DETALLES,
  });
  const f = r.grupos[0].filas[0];
  assert.equal(f.cantidadPedida, null);
  assert.equal(f.costoCatalogo, null);
  assert.equal(f.recibidoEntreTodos, null, "sin línea de pedido no hay acumulado");
  assert.equal(f.textoAcumulado, null);
});

test("los grupos van por comprobante, con su identidad legible", () => {
  const r = filasDeConciliacion({ comprobantes: COMPROBANTES, detalles: DETALLES });
  assert.equal(r.grupos.length, 2);
  assert.equal(r.grupos[0].comprobante.identidad, "A 0011-00794708");
  assert.equal(r.grupos[0].filas.length, 2);
});

test("un comprobante sin número todavía leído lo dice, no muestra un guion", () => {
  const r = filasDeConciliacion({ comprobantes: [{ id: 11, lineas: [] }], detalles: [] });
  assert.equal(r.grupos[0].comprobante.identidad, "Sin número todavía");
});

test("una cantidad que no es número no rompe el acumulado", () => {
  const r = filasDeConciliacion({
    comprobantes: [{ id: 11, lineas: [linea(101, "X", "no se lee", 1)] }],
    detalles: DETALLES,
  });
  assert.equal(r.grupos[0].filas[0].recibidoEntreTodos, 0);
  assert.equal(Number.isNaN(r.grupos[0].filas[0].recibidoEntreTodos), false);
});
