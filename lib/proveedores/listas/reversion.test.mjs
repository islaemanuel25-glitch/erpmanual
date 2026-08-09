// Deshacer una aplicación: qué se revierte, a qué valor y qué se respeta.
//
// El error que estas pruebas existen para que no vuelva: dejar un producto en un
// costo intermedio que nunca fue el original, por revertir fila por fila cuando
// la lista lo tocó dos veces.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MOTIVO_OMISION,
  filasAplicadasEnOrden,
  reversionDeProducto,
  planDeReversion,
} from "@/lib/proveedores/listas/reversion";

const T1 = "2026-08-05T21:26:09.312Z";
const T2 = "2026-08-06T12:36:19.817Z";

/** Un producto de una sola aplicación, como los 277 del caso real. */
const simple = (extra = {}) => ({
  id: 10,
  nombre: "Jugo Arcor Frutilla X Caja",
  precioCostoActual: 5962.16,
  precioVentaActual: 8500,
  filas: [
    {
      id: 1, filaExcel: 167, aplicada: true, aplicadaEn: T1,
      costoPrevioAplicacion: 5010, costoAplicado: 5962.16,
      ventaAnterior: 7200, ventaNueva: 8500,
    },
  ],
  overrides: [{ id: 100, localId: 2, precioCosto: 5962.16, precioVenta: 8500 }],
  ...extra,
});

/** EL CASO BATATA: dos filas de la misma importación sobre el mismo producto. */
const doble = (extra = {}) => ({
  id: 81,
  nombre: "BATATA ARCOR 500G",
  precioCostoActual: 2166.7,
  precioVentaActual: 2300,
  filas: [
    {
      id: 1, filaExcel: 144, aplicada: true, aplicadaEn: T1,
      costoPrevioAplicacion: 1920, costoAplicado: 1722.53,
      ventaAnterior: 2300, ventaNueva: 2300,
    },
    {
      id: 2, filaExcel: 159, aplicada: true, aplicadaEn: T1,
      costoPrevioAplicacion: 1722.53, costoAplicado: 2166.7,
      ventaAnterior: 2300, ventaNueva: 2300,
    },
  ],
  overrides: [],
  ...extra,
});

// ── LA REGLA DE LAS DOS MITADES ────────────────────────────────────────────

test("se compara contra lo ÚLTIMO escrito y se vuelve al previo de lo PRIMERO", () => {
  const r = reversionDeProducto(doble());
  assert.equal(r.revierte, true, "compararlo contra la primera lo dejaría afuera");
  assert.equal(r.costoDestino, 1920, "1722,53 es un valor intermedio, no el original");
});

test("las dos filas del producto vuelven juntas", () => {
  const r = reversionDeProducto(doble());
  assert.deepEqual(r.filasExcel, [144, 159]);
});

test("con el mismo instante, el orden lo desempata el número de fila", () => {
  // La aplicación en lote sella todas las filas con la MISMA fecha: sin el
  // desempate, cuál se toma como primera queda librado al orden de llegada.
  const alReves = doble({ filas: [...doble().filas].reverse() });
  assert.deepEqual(filasAplicadasEnOrden(alReves.filas).map((f) => f.filaExcel), [144, 159]);
  assert.equal(reversionDeProducto(alReves).costoDestino, 1920);
});

// ── SOLO SE DESHACE LO QUE SIGUE SIENDO NUESTRO ────────────────────────────

test("si alguien cambió el costo después, no se toca", () => {
  const r = reversionDeProducto(simple({ precioCostoActual: 7000 }));
  assert.equal(r.revierte, false);
  assert.equal(r.motivo, MOTIVO_OMISION.COSTO_CAMBIADO);
});

test("un producto sin filas aplicadas no entra al plan", () => {
  const r = reversionDeProducto(simple({ filas: [{ id: 1, filaExcel: 9, aplicada: false }] }));
  assert.equal(r.revierte, false);
  assert.equal(r.motivo, MOTIVO_OMISION.SIN_APLICACION);
});

test("sin costo previo guardado no se inventa un destino", () => {
  const p = simple();
  p.filas[0].costoPrevioAplicacion = null;
  const r = reversionDeProducto(p);
  assert.equal(r.revierte, false);
  assert.equal(r.motivo, MOTIVO_OMISION.SIN_DATO_PREVIO);
});

// ── EL PRECIO DE VENTA ─────────────────────────────────────────────────────

test("la venta vuelve cuando sigue siendo la que escribimos", () => {
  const r = reversionDeProducto(simple());
  assert.equal(r.ventaDestino, 7200);
});

test("si la venta la cambiaron a mano, el costo vuelve igual y la venta se respeta", () => {
  const r = reversionDeProducto(simple({ precioVentaActual: 9900 }));
  assert.equal(r.revierte, true);
  assert.equal(r.costoDestino, 5010);
  assert.equal(r.ventaDestino, null);
  assert.equal(r.ventaConservada, true);
});

test("si la aplicación no movió la venta, tampoco la mueve la reversión", () => {
  // Es el caso BATATA: venta anterior y venta nueva iguales.
  const r = reversionDeProducto(doble());
  assert.equal(r.ventaDestino, null);
});

// ── LOS OVERRIDES POR UBICACIÓN ────────────────────────────────────────────

test("vuelve el override que sigue arrastrando el maestro", () => {
  const r = reversionDeProducto(simple());
  assert.equal(r.overrides.length, 1);
  assert.equal(r.overrides[0].costoDestino, 5010);
  assert.equal(r.overrides[0].ventaDestino, 7200);
});

test("un override con costo propio no se toca", () => {
  const r = reversionDeProducto(
    simple({ overrides: [{ id: 100, localId: 2, precioCosto: 4000, precioVenta: 8500 }] })
  );
  assert.equal(r.overrides.length, 0, "ese costo es una decisión de esa ubicación");
});

test("un override con venta propia vuelve el costo y conserva su venta", () => {
  const r = reversionDeProducto(
    simple({ overrides: [{ id: 100, localId: 2, precioCosto: 5962.16, precioVenta: 12000 }] })
  );
  assert.equal(r.overrides[0].costoDestino, 5010);
  assert.equal(r.overrides[0].ventaDestino, null);
});

// ── EL RESUMEN QUE VE LA PERSONA ANTES DE CONFIRMAR ────────────────────────

test("el plan cuenta cuántos vuelven, cuántos se omiten y CUÁNTAS VENTAS se tocan", () => {
  const plan = planDeReversion({
    productos: [simple(), doble(), simple({ id: 11, precioCostoActual: 7000 })],
  });
  assert.equal(plan.resumen.productos, 3);
  assert.equal(plan.resumen.revierten, 2);
  assert.equal(plan.resumen.omitidos, 1);
  assert.equal(plan.resumen.omitidosPorMotivo[MOTIVO_OMISION.COSTO_CAMBIADO], 1);
  assert.equal(plan.resumen.ventasQueSeTocan, 1, "la de BATATA no se mueve");
  assert.equal(plan.resumen.overridesQueSeTocan, 1);
  assert.equal(plan.resumen.filasQueVuelven, 3, "una del simple y dos del doble");
});

test("el plan no escribe nada: describe", () => {
  const p = simple();
  const antes = JSON.stringify(p);
  planDeReversion({ productos: [p] });
  assert.equal(JSON.stringify(p), antes);
});
