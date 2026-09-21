// LOS NÚMEROS SON LOS DEL COMPROBANTE 5 DEL PEDIDO 232, MEDIDOS.
//
// Tres de sus quince líneas, con los dos precios que la pantalla muestra. No se
// escribió ninguno a mano: un fixture "razonable" es cómo tres candados de este
// repo quedaron verdes para siempre probando una combinación que el endpoint no
// manda nunca.
//
// Y el total de las quince, medido contra producción el 2026-09-20, está al
// final: factura 2.700.500,00 · interno 2.801.001,60 · ganancia 100.501,60.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  gananciaDelDeposito,
  motivoFueraDeLaCuenta,
  textoDeLaCuenta,
} from "@/lib/compras-proveedor/gananciaDelDeposito";

/** Una fila con la forma que arma `filasDeConciliacion`. */
const fila = (extra = {}) => ({
  lineaId: 110,
  producto: "Philips 10",
  productoLocalId: 6079,
  pedidoDetalleId: 2574,
  cantidad: 80,
  cantidadPedida: 8,
  unidad: { unidad: "POR_UNIDAD", lecturas: { porUnidad: { bultos: 8 }, porBulto: { bultos: 80 } } },
  costoFactura: 33600,
  costoCatalogo: 34603.2,
  subtotal: 268800,
  esFiambre: false,
  decisionPrecio: null,
  ...extra,
});

test("los tres números salen de la MISMA cantidad de los dos lados", () => {
  // 8 bultos —no los 80 del papel— por cada precio. Si un lado usara la
  // cantidad cruda, la resta no sería una ganancia sino una diferencia de
  // escalas, y daría diez veces el número real.
  const r = gananciaDelDeposito([fila()]);
  assert.equal(r.facturado, 8 * 33600);
  assert.equal(r.interno, 8 * 34603.2);
  assert.equal(Math.round(r.ganancia * 100) / 100, 8025.6);
  assert.equal(r.enLaCuenta, 1);
  assert.equal(r.afuera, 0);
});

test("EL PORCENTAJE COINCIDE EN MAGNITUD CON EL DE LA LÍNEA", () => {
  // La tarjeta de esa misma línea dice "bajó 3,0 %" —calculado sobre el precio
  // interno— y el pie tiene que decir la misma magnitud con el signo dado
  // vuelta: uno nombra el cambio de precio y el otro la ganancia.
  const r = gananciaDelDeposito([fila()]);
  const deLaLinea = ((33600 - 34603.2) / 34603.2) * 100;
  assert.equal(Math.round(r.porcentaje * 10) / 10, Math.round(-deLaLinea * 10) / 10);
});

test("una línea con el precio ya aceptado aporta CERO", () => {
  // Al aceptar, el interno pasó a ser el de la factura: los dos números son el
  // mismo. No hay nada especial programado para este caso y esa es la prueba.
  const r = gananciaDelDeposito([fila({ costoCatalogo: 33600 })]);
  assert.equal(r.ganancia, 0);
  assert.equal(r.porcentaje, 0);
  assert.equal(r.enLaCuenta, 1);
});

test("sin precio interno la línea no entra, y se cuenta afuera", () => {
  // Es el caso de una línea sin vincular: la hoja tampoco la compara.
  const sinInterno = fila({ costoCatalogo: null, pedidoDetalleId: null });
  assert.equal(motivoFueraDeLaCuenta(sinInterno), "SIN_PRECIO_INTERNO");
  const r = gananciaDelDeposito([fila(), sinInterno]);
  assert.equal(r.enLaCuenta, 1);
  assert.equal(r.afuera, 1);
  assert.equal(r.sinPrecioInterno, 1);
  assert.equal(r.facturado, 8 * 33600, "la que no entra no suma de ningún lado");
});

test("el que NO tiene los kilos queda afuera con su propio motivo", () => {
  // ── ESTE CANDADO CAMBIÓ DE CRITERIO A PROPÓSITO ──────────────────────
  //
  // Decía "el fiambre queda afuera" y afirmaba `esFiambre: true`. Era verdad a
  // medias: lo que no se puede valorizar es un producto por kilo SIN los kilos,
  // y el papel puede traerlos impresos. En el #242 venían en tres de los
  // cuatro, y la pantalla igual los dejaba afuera y decía "4 de fiambre".
  //
  // Ahora el motivo mira si los kilos ESTÁN, no si el producto ES fiambre.
  const f = fila({ porKilo: true, faltanKilos: true });
  assert.equal(motivoFueraDeLaCuenta(f), "SIN_KILOS");
  const r = gananciaDelDeposito([f]);
  assert.equal(r.enLaCuenta, 0);
  assert.equal(r.sinKilos, 1);
  assert.equal(r.porcentaje, null, "sin líneas no hay porcentaje que inventar");
});

test("y un producto por kilo CON los kilos del papel entra en la cuenta", () => {
  // La otra mitad, que es la que estaba mal. Los dos precios de la fila están
  // por kilo, así que el multiplicador son los kilos del papel.
  const conKilos = fila({ porKilo: true, faltanKilos: false, peso: 11.685, costoFactura: 11018.49, costoCatalogo: 10120 });
  assert.equal(motivoFueraDeLaCuenta(conKilos), null, "un producto pesado quedó afuera");
  const r = gananciaDelDeposito([conKilos]);
  assert.equal(r.enLaCuenta, 1);
  assert.equal(r.sinKilos, 0);
  assert.equal(Math.round(r.facturado), Math.round(11.685 * 11018.49));
  assert.equal(Math.round(r.interno), Math.round(11.685 * 10120));
});

test("el texto dice cuántos entraron Y cuántos no", () => {
  // DOS RENGLONES DE DOS PRODUCTOS. Es la forma real: en el comprobante 5, los
  // trece renglones vinculados son trece productos distintos, medido.
  const todas = gananciaDelDeposito([fila(), fila({ lineaId: 111, productoLocalId: 6081 })]);
  assert.equal(textoDeLaCuenta(todas), "2 de 2 productos en la cuenta");

  const conAfuera = gananciaDelDeposito([
    fila(),
    fila({ lineaId: 122, productoLocalId: 6086, costoCatalogo: null, pedidoDetalleId: null }),
    fila({ lineaId: 130, productoLocalId: 6090, porKilo: true, faltanKilos: true }),
  ]);
  assert.match(
    textoDeLaCuenta(conAfuera),
    /^1 de 3 productos en la cuenta/,
    "arranca por lo que sí entró"
  );
  assert.match(textoDeLaCuenta(conAfuera), /1 sin precio interno/);
  // Ya no dice "de fiambre": dice qué falta y qué hacer.
  assert.match(textoDeLaCuenta(conAfuera), /1 espera que lo peses/);
  assert.match(textoDeLaCuenta(conAfuera), /el papel no trae los kilos/);
});

test("EL TEXTO CUENTA PRODUCTOS, NO RENGLONES: dos renglones del mismo producto son UNO", () => {
  // La contraprueba de la palabra. Con el conteo por renglón, esta frase diría
  // "2 de 2 productos" sobre UN solo producto — que es exactamente la
  // afirmación falsa que la tanda de la palabra vino a sacar.
  const mismoProducto = gananciaDelDeposito([fila(), fila({ lineaId: 111 })]);
  assert.equal(mismoProducto.total, 2, "los renglones se siguen contando, y son dos");
  assert.equal(mismoProducto.productos, 1);
  assert.equal(textoDeLaCuenta(mismoProducto), "1 de 1 productos en la cuenta");
  // Y LA PLATA NO SE AGRUPA: son dos partidas facturadas del mismo producto y
  // las dos se pagan. Agrupar acá sería perder la mitad de la factura.
  assert.equal(mismoProducto.facturado, 2 * 8 * 33600);
});

test("un renglón sin vincular cuenta como propio: no se puede probar que sea otro", () => {
  const r = gananciaDelDeposito([
    fila({ productoLocalId: null, costoCatalogo: null, pedidoDetalleId: null }),
    fila({ lineaId: 113, productoLocalId: null, costoCatalogo: null, pedidoDetalleId: null }),
  ]);
  assert.equal(r.productos, 2, "dos renglones del papel sin vínculo son dos cosas distintas");
});

test("sin ningún producto con los dos precios, lo dice en vez de mostrar cero", () => {
  const r = gananciaDelDeposito([fila({ costoCatalogo: null, pedidoDetalleId: null })]);
  assert.equal(r.enLaCuenta, 0);
  assert.match(textoDeLaCuenta(r), /Ninguno de los 1 productos/);
});

// ── EL TOTAL MEDIDO CONTRA PRODUCCIÓN ─────────────────────────────────────

test("las quince líneas del comprobante 5 dan lo medido", () => {
  // Los pares (cantidad en la escala del pedido, costo de factura, costo del
  // ERP) de las quince líneas, leídos de la conciliación de producción el
  // 2026-09-20. Si la fórmula cambia, este total deja de dar y hay que mirar.
  const medidas = [
    [8, 33600, 34603.2],
    [5, 34000, 35078.4],
    [10, 22500, 26460],
    [6, 52500, 54594],
    [1, 30100, 30780],
    [1, 30100, 30780],
    [5, 46500, 46980],
    [2, 46500, 46980],
    [4, 58000, 60480],
    [1, 62000, 65880],
    // Ésta va al revés: la factura trae 40.500 contra 39.420 del ERP, o sea que
    // el depósito compra POR ENCIMA de su propio precio y aporta ganancia
    // negativa. El total de abajo la incluye, que es lo que hace que sea un
    // total y no un resumen de las que convienen.
    [1, 40500, 39420],
    [2, 40500, 40500],
    [2, 40500, 40500],
    [12, 36500, 37260],
    [11, 36500, 37260],
  ];
  const filas = medidas.map(([bultos, factura, erp], i) => ({
    lineaId: 110 + i,
    pedidoDetalleId: 2500 + i,
    productoLocalId: 6000 + i,
    cantidad: bultos,
    cantidadPedida: bultos,
    costoFactura: factura,
    costoCatalogo: erp,
    esFiambre: false,
  }));

  const r = gananciaDelDeposito(filas);
  assert.equal(r.enLaCuenta, 15);
  assert.equal(r.afuera, 0);
  assert.equal(Math.round(r.facturado * 100) / 100, 2700500);
  assert.equal(Math.round(r.interno * 100) / 100, 2801001.6);
  assert.equal(Math.round(r.ganancia * 100) / 100, 100501.6);
  assert.equal(Math.round(r.porcentaje * 10) / 10, 3.6);
});

test("CONTRAPRUEBA: contando una línea sin precio interno, el total cambia", () => {
  // Si `sePuedeCompararElPrecio` dejara pasar una línea sin los dos precios, el
  // interno sumaría cero por ella y la ganancia saldría MENOR de lo que es. Sin
  // esta prueba, el filtro podría no estar filtrando nada.
  const buena = fila();
  const rota = fila({ lineaId: 122, costoCatalogo: null, pedidoDetalleId: null });
  const conFiltro = gananciaDelDeposito([buena, rota]);
  const sinFiltro =
    8 * 34603.2 + 0 - (8 * 33600 + 8 * 33600); // lo que daría contándola a mano
  assert.notEqual(Math.round(conFiltro.ganancia * 100) / 100, Math.round(sinFiltro * 100) / 100);
  assert.equal(Math.round(conFiltro.ganancia * 100) / 100, 8025.6);
});
