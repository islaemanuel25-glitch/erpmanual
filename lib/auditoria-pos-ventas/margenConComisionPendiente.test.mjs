// CANDADO: NO SE CALCULA UN MARGEN SOBRE UNA COMISIÓN QUE NO SE SABE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/auditoria-pos-ventas/margenConComisionPendiente.test.mjs
//
// Es el peor caso de toda la tanda, y por eso tiene su propio archivo. Con la
// comisión desconocida guardada como cero, la ganancia neta no descontó nada, y
// el margen que sale de ahí es MÁS ALTO que el real. O sea que el control que
// existe para encontrar tickets con problemas se apagaría solo justo en los
// tickets a los que les falta un dato.
//
// Un número inflado no es una aproximación: es una afirmación falsa. Por eso
// acá no se devuelve ninguno.

import test from "node:test";
import assert from "node:assert/strict";

import { estadoTicket, margenPctFromSums } from "@/lib/auditoria-pos-ventas/agregaciones.js";
import { UMBRAL_MARGEN_BAJO_PCT } from "@/lib/auditoria-pos-ventas/constantes.js";

test("el margen de un total con ventas pendientes es null, no un porcentaje", () => {
  assert.equal(margenPctFromSums(3000, 10000, { parcial: true }), null);
});

test("y sin pendientes se sigue calculando igual que siempre", () => {
  assert.equal(margenPctFromSums(3000, 10000), 30);
  assert.equal(margenPctFromSums(3000, 10000, { parcial: false }), 30);
});

test("con neto en cero tampoco se inventa un margen", () => {
  assert.equal(margenPctFromSums(0, 0), null);
});

test("UN TICKET CON COMISIÓN PENDIENTE SE INFORMA COMO PENDIENTE", () => {
  const venta = { comisionPendiente: true };
  assert.equal(estadoTicket(3000, 10000, venta), "pendiente");
});

test("y sin la marca, el estado se calcula como antes", () => {
  assert.equal(estadoTicket(3000, 10000, { comisionPendiente: false }), "normal");
  assert.equal(estadoTicket(-50, 10000, { comisionPendiente: false }), "pérdida");
  assert.equal(estadoTicket(3000, 10000), "normal", "sin venta: el comportamiento viejo");
});

test("el ticket pendiente NO se cuela como 'normal' por tener margen alto", () => {
  // La trampa concreta: 30 % de margen está muy por encima del umbral, así que
  // sin la marca este ticket pasaría desapercibido — y su ganancia no descontó
  // ninguna comisión.
  const margenAparente = (3000 / 10000) * 100;
  assert.ok(margenAparente > UMBRAL_MARGEN_BAJO_PCT, "el caso solo tiene sentido si el margen aparenta ser bueno");
  assert.notEqual(estadoTicket(3000, 10000, { comisionPendiente: true }), "normal");
});
