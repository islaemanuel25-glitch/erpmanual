// SALIR A LA MITAD Y VOLVER TIENE QUE RETOMAR DONDE QUEDÓ.
//
// ── QUÉ SE ESTÁ DEFENDIENDO ────────────────────────────────────────────────
//
// La pantalla de revisar de a uno recorre setenta productos. Emanuel trabaja
// desde el celular: va a hacer quince, va a atender a alguien, y va a volver.
// Si al volver la pantalla arranca de cero, la cola no se termina nunca.
//
// No hay ningún progreso guardado, y es a propósito: la cola ES lo que queda
// pendiente. Una fila resuelta sale sola, así que "el primero de la cola" ya es
// el lugar donde se había quedado. Este candado afirma que eso es cierto —y que
// sigue siéndolo cuando hay salteados, que es donde se rompería—.
//
//   node --experimental-loader ./scripts/alias-loader.mjs --test lib/proveedores/listas/colaDeRevision.test.mjs

import test from "node:test";
import assert from "node:assert/strict";

import { ordenDeLaCola, posicionActual } from "./colaDeRevision.js";

test("sin salteados, el orden es el del archivo", () => {
  assert.deepEqual(ordenDeLaCola([10, 11, 12], []), [10, 11, 12]);
});

test("los salteados van AL FINAL, no afuera", () => {
  // "Dejalo para después" es después, no nunca: una fila salteada que
  // desapareciera de la cola quedaría sin resolver y sin que nadie la vea. Y
  // además el total dejaría de cerrar contra el resumen.
  const orden = ordenDeLaCola([10, 11, 12, 13], [11]);
  assert.deepEqual(orden, [10, 12, 13, 11]);
  assert.equal(orden.length, 4, "saltear no puede achicar la cola");
});

test("si SOLO quedan salteados, se vuelve a ofrecer el primero", () => {
  // No hay nada más que hacer y esas filas siguen sin resolverse. Devolver una
  // cola vacía diría "no queda nada para revisar" sobre tres pendientes.
  const orden = ordenDeLaCola([10, 11], [10, 11]);
  assert.deepEqual(orden, [10, 11]);
  assert.equal(posicionActual(orden, null).actualId, 10);
});

test("ASÍ RETOMA: sin pedir nada, toca el primero que todavía falta", () => {
  // La pantalla pide `null` al volver. Las dos primeras ya se resolvieron, así
  // que la cola que llega del servidor arranca en la tercera — y eso ES el
  // lugar donde se había quedado, sin que nadie lo haya anotado.
  const quedanPendientes = [12, 13, 14];
  const { actualId, indice } = posicionActual(ordenDeLaCola(quedanPendientes, []), null);
  assert.equal(actualId, 12);
  assert.equal(indice, 1);
});

test("un id que ya NO está en la cola no cuelga la pantalla: cae al primero", () => {
  // Pasa de verdad: se confirma una fila, la pantalla todavía tiene su id, y
  // entre medio esa fila salió de la cola. Sin esta caída la pantalla pediría
  // una fila que el servidor ya no ofrece y se quedaría en blanco.
  const { actualId, indice } = posicionActual([12, 13], 11);
  assert.equal(actualId, 12);
  assert.equal(indice, 1);
});

test("el índice se cuenta sobre el orden REAL, no sobre la cola original", () => {
  // CONTRAPRUEBA DEL "3 de 70": con un salteado adelante, contar sobre la cola
  // original haría que el número saltara para atrás al avanzar.
  const orden = ordenDeLaCola([10, 11, 12], [10]);
  assert.deepEqual(orden, [11, 12, 10]);
  assert.equal(posicionActual(orden, 11).indice, 1);
  assert.equal(posicionActual(orden, 12).indice, 2);
  assert.equal(posicionActual(orden, 10).indice, 3);
});

test("cola vacía: no hay id ni índice, y no explota", () => {
  const { actualId, indice } = posicionActual([], null);
  assert.equal(actualId, null);
  assert.equal(indice, 0);
});

test("SALTEAR NO SE GUARDA: sin la lista, el salteado vuelve a su lugar", () => {
  // Es la diferencia con "No lo cambio", que sí se recuerda —para esta lista—.
  // Al recargar la pantalla, `salteados` llega vacía y el orden vuelve a ser el
  // del archivo: el producto que se salteó aparece otra vez donde estaba.
  const conSalteo = ordenDeLaCola([10, 11, 12], [10]);
  const alRecargar = ordenDeLaCola([10, 11, 12], []);
  assert.deepEqual(conSalteo, [11, 12, 10]);
  assert.deepEqual(alRecargar, [10, 11, 12]);
});
