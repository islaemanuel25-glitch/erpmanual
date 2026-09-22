// VARIAS FACTURAS EN UN MISMO PEDIDO: QUÉ FOTO ES HOJA DE CUÁL.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/comprobante/agruparHojas.test.mjs
//
// ── EL CASO ───────────────────────────────────────────────────────────────
//
// Un pedido de Arcor de 50 productos llega con cuatro facturas. El que recibe
// saca las fotos en orden y no contesta nada: la primera factura son dos hojas
// —la segunda trae el total—, la segunda es una sola hoja, la tercera son tres,
// y la cuarta una.
//
// Lo que decide es el papel: una foto con total impreso cierra su factura.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  agruparHojas,
  fusionesPendientes,
  lecturaUnida,
} from "@/lib/compras-proveedor/comprobante/agruparHojas";
import { hojaDesdeLaFila } from "@/lib/compras-proveedor/comprobante/fusionarHojas";

/** Una foto leída: `con` trae total impreso, `sin` no. */
const sin = (id) => ({ id, leido: true, tieneTotal: false });
const con = (id) => ({ id, leido: true, tieneTotal: true });

test("LAS DOCE FOTOS DE ARCOR SE PARTEN EN CUATRO FACTURAS", () => {
  const r = agruparHojas([
    sin(1), con(2), // factura 1: dos hojas
    con(3),         // factura 2: una hoja
    sin(4), sin(5), con(6), // factura 3: tres hojas
    con(7),         // factura 4: una hoja
  ]);

  assert.equal(r.facturas.length, 4);
  assert.deepEqual(r.facturas.map((f) => f.hojaIds), [[1, 2], [3], [4, 5, 6], [7]]);
  // La factura sobrevive en la PRIMERA de sus hojas: es la que tiene el
  // encabezado, y así el orden de las páginas queda como el de las fotos.
  assert.deepEqual(r.facturas.map((f) => f.destinoId), [1, 3, 4, 7]);
  assert.deepEqual(r.abierta, []);
});

test("Y SOLO SE FUSIONA LO QUE TIENE ALGO QUE MOVER", () => {
  // Las de una sola hoja ya están bien como están: tocarlas sería escribir en
  // la base sin motivo.
  const f = fusionesPendientes([sin(1), con(2), con(3), sin(4), sin(5), con(6)]);
  assert.deepEqual(f.map((x) => x.hojaIds), [[1, 2], [4, 5, 6]]);
});

test("LA ÚLTIMA SIN TOTAL QUEDA ABIERTA: PUEDE FALTAR LA HOJA QUE LA CIERRA", () => {
  // No se fusiona y no se inventa un cierre. Fusionarla afirmaría que la
  // factura está entera cuando puede faltar fotografiar la última hoja.
  const r = agruparHojas([con(1), sin(2), sin(3)]);
  assert.deepEqual(r.facturas.map((f) => f.hojaIds), [[1]]);
  assert.deepEqual(r.abierta, [2, 3]);
});

test("UNA FOTO SIN LEER CORTA: NO SE PEGA POR ENCIMA DE UN AGUJERO", () => {
  // La 2 no se leyó todavía. Pegar la 1 con la 3 sería afirmar que la 2 no
  // existe, y la 2 puede ser la que trae el total de la primera factura.
  const r = agruparHojas([sin(1), { id: 2, leido: false, tieneTotal: false }, con(3)]);
  assert.deepEqual(r.sinLeer, [2]);
  // La 3 arranca una corrida nueva y se cierra sola.
  assert.deepEqual(r.facturas.map((f) => f.hojaIds), [[3]]);
  assert.deepEqual(r.abierta, []);
});

test("UNA MAL LEÍDA TAMPOCO DECIDE NADA", () => {
  // MAL_LEIDO no sabe si el papel traía total: puede que lo tuviera y no se
  // haya podido leer. Tratarla como "sin total" la pegaría a la siguiente
  // sobre un dato que no se tiene.
  const hojas = [
    { id: 1, estado: "CARGADO", leidoEn: new Date(), totalLeido: 100 },
    { id: 2, estado: "MAL_LEIDO", leidoEn: new Date(), totalLeido: null },
    { id: 3, estado: "CARGADO", leidoEn: new Date(), totalLeido: 200 },
  ].map(hojaDesdeLaFila);

  assert.equal(hojas[1].leido, false, "una mal leída entró como leída");
  const r = agruparHojas(hojas);
  assert.deepEqual(r.sinLeer, [2]);
  assert.deepEqual(r.facturas.map((f) => f.hojaIds), [[1], [3]]);
});

test("Y UN ANULADO NO CUENTA COMO HOJA DE NADA", () => {
  const r = agruparHojas([sin(1), { id: 2, leido: true, tieneTotal: true, anulado: true }, con(3)]);
  assert.deepEqual(r.facturas.map((f) => f.hojaIds), [[1, 3]]);
});

test("UN REMITO SUELTO NO SE PEGA A LA FACTURA SIGUIENTE", () => {
  // CONTRAPRUEBA de la regla contraria, y es el caso que más importa: un remito
  // nunca trae total. Si después se sube una factura de verdad, el remito NO es
  // su primera hoja.
  //
  // Lo que los separa es que el remito no tiene una hoja siguiente ADENTRO de su
  // propia corrida — o sea, el orden. Acá el remito va último a propósito: es
  // como llega cuando se sube solo.
  const r = agruparHojas([con(1), sin(2)]);
  assert.deepEqual(r.facturas.map((f) => f.hojaIds), [[1]]);
  assert.deepEqual(r.abierta, [2], "el remito se comió la factura de al lado");
});

// ── LA LECTURA UNIDA ──────────────────────────────────────────────────────

const hoja = (n, { total = null, numero = null, lineas = 1 } = {}) => ({
  identidad: { tipo: "FACTURA A", puntoVenta: "0003", numero, fecha: null, cuit: null },
  lineas: Array.from({ length: lineas }, (_, i) => ({ descripcion: `hoja ${n} renglón ${i + 1}` })),
  pie: total == null ? null : { total, neto: total, iva: 0 },
  hayTotalImpreso: total != null,
  lineasEnElPapel: lineas,
});

test("LA FACTURA UNIDA TIENE TODOS LOS RENGLONES Y UN SOLO PIE", () => {
  const u = lecturaUnida([
    hoja(1, { numero: "12345", lineas: 14 }),
    hoja(2, { total: 348711.61, lineas: 6 }),
  ]);

  assert.equal(u.lineas.length, 20);
  assert.equal(u.lineas[0].descripcion, "hoja 1 renglón 1");
  assert.equal(u.lineas[14].descripcion, "hoja 2 renglón 1");
  // El pie está impreso UNA vez, en la hoja que cierra. Sumar los pies de las
  // hojas intermedias contaría dos veces el acumulado.
  assert.equal(u.pie.total, 348711.61);
  assert.equal(u.hayTotalImpreso, true);
  // El conteo de renglones SÍ se suma: cada hoja contó los suyos, y es el
  // control contra el que se compara cuántos se transcribieron.
  assert.equal(u.lineasEnElPapel, 20);
});

test("Y EL NÚMERO SALE DE LA HOJA QUE LO TRAJO, NO DE LA ÚLTIMA", () => {
  // El número está impreso en todas las hojas, pero una puede haber salido
  // borrosa. La primera que lo tenga manda.
  const u = lecturaUnida([
    hoja(1, { numero: "12345", lineas: 3 }),
    hoja(2, { total: 1000, numero: null, lineas: 2 }),
  ]);
  assert.equal(u.identidad.numero, "12345");
});

test("UNA SOLA HOJA VUELVE TAL CUAL: UNIR NO PUEDE CAMBIARLA", () => {
  const sola = hoja(1, { total: 500, numero: "9", lineas: 4 });
  assert.equal(lecturaUnida([sola]), sola);
});
