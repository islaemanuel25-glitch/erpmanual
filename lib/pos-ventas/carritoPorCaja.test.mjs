// UN CARRITO NO CRUZA DE CAJA CON UN CAMBIO DE PIN.
//
//   node --import ./scripts/alias-loader.mjs --test lib/pos-ventas/carritoPorCaja.test.mjs
//
// Operador A arma el carrito, cambia el PIN, entra B: B no puede cobrar lo de A
// en su caja. Las reglas son puras (lib/pos-ventas/carritoPorCaja.js) y se
// afirman acá; abajo, que la pantalla del POS las use en los TRES lugares donde
// el carrito se restaura o se convierte en venta, y que el turno se vuelva a
// pedir cuando cambia el operador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  duenoDelCarrito,
  carritoCobrable,
  borradorRestaurable,
  ERROR_CARRITO_DE_OTRA_CAJA,
} from "@/lib/pos-ventas/carritoPorCaja";

const A = 1;
const B = 2;

test("A arma, cambia el PIN a B: B NO cobra el carrito de A", () => {
  const dueno = duenoDelCarrito(A);
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: dueno }, B), false);
});

test("si A vuelve a hacer PIN, cobra su carrito", () => {
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: A }, A), true);
});

test("un carrito vacío no es de nadie", () => {
  assert.equal(carritoCobrable({ carritoVacio: true, duenoOperadorId: A }, B), true);
});

test("sin operador: el carrito de la cuenta se cobra sin operador, y no bajo un PIN", () => {
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: null }, null), true);
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: null }, A), false);
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: A }, null), false);
});

test("ids como texto valen lo mismo; basura no es un operador", () => {
  assert.equal(duenoDelCarrito("1"), 1);
  assert.equal(duenoDelCarrito(undefined), null);
  assert.equal(duenoDelCarrito(0), null);
  assert.equal(carritoCobrable({ carritoVacio: false, duenoOperadorId: "1" }, 1), true);
});

test("el borrador se restaura solo con el mismo local, la misma cuenta y el mismo operador", () => {
  const borrador = { localId: 5, userId: 9, operadorId: A, carrito: [{}] };
  assert.equal(borradorRestaurable(borrador, { localId: 5, userId: 9, operadorId: A }), true);
  assert.equal(borradorRestaurable(borrador, { localId: 5, userId: 9, operadorId: B }), false, "otro operador");
  assert.equal(borradorRestaurable(borrador, { localId: 5, userId: 9, operadorId: null }), false, "sin operador");
  assert.equal(borradorRestaurable(borrador, { localId: 6, userId: 9, operadorId: A }), false, "otro local");
  assert.equal(borradorRestaurable(borrador, { localId: 5, userId: 8, operadorId: A }), false, "otra cuenta");
});

test("un borrador anterior a la regla, sin dueño, no se restaura bajo un operador", () => {
  const viejo = { localId: 5, userId: 9, carrito: [{}] };
  assert.equal(borradorRestaurable(viejo, { localId: 5, userId: 9, operadorId: A }), false);
  assert.equal(borradorRestaurable(viejo, { localId: 5, userId: 9, operadorId: null }), true);
  assert.equal(borradorRestaurable(null, { localId: 5, userId: 9, operadorId: null }), false);
});

test("el aviso dice qué pasa y qué hacer", () => {
  assert.match(ERROR_CARRITO_DE_OTRA_CAJA, /otro operador/);
  assert.match(ERROR_CARRITO_DE_OTRA_CAJA, /vaciá el carrito/);
});

// ── La pantalla, leída SIN comentarios ──────────────────────────────────────
//
// Un candado que busca texto encuentra los comentarios (CLAUDE.md, regla 5):
// se sacan antes de mirar.
const pantalla = readFileSync("app/modulos/pos-ventas/page.jsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

/** El cuerpo de `const nombre = ...` hasta la siguiente declaración del componente. */
function cuerpoDe(nombre) {
  const inicio = pantalla.indexOf(`const ${nombre} = `);
  assert.ok(inicio >= 0, `no está ${nombre}`);
  const fin = pantalla.indexOf("\n  const ", inicio + 1);
  return pantalla.slice(inicio, fin < 0 ? undefined : fin);
}

test("la pantalla restaura el borrador con la regla del operador", () => {
  assert.match(pantalla, /borradorRestaurable\(parsed, \{/);
  assert.doesNotMatch(pantalla, /parsed\.userId === me\.id/, "volvió la restauración solo por cuenta");
});

test("el borrador persiste el operador dueño del carrito", () => {
  assert.match(pantalla, /operadorId: duenoCarritoRef\.current/);
});

test("cobrar online y guardar offline se niegan a un carrito de otra caja", () => {
  for (const nombre of ["ejecutarCobro", "guardarVentaPendiente"]) {
    const cuerpo = cuerpoDe(nombre);
    assert.match(cuerpo, /carritoCobrable\(/, `${nombre} no consulta de quién es el carrito`);
    assert.match(cuerpo, /ERROR_CARRITO_DE_OTRA_CAJA/, `${nombre} no avisa`);
    // La guarda va ANTES de mandar o encolar nada.
    const guarda = cuerpo.indexOf("carritoCobrable(");
    const envio = Math.max(cuerpo.indexOf("fetch(\"/api/pos-ventas/crear\""), cuerpo.indexOf("const ventaPendiente"));
    assert.ok(envio < 0 || guarda < envio, `${nombre} manda la venta antes de mirar el dueño del carrito`);
  }
});

test("el turno se vuelve a pedir cuando cambia el operador", () => {
  const efecto = pantalla.slice(pantalla.indexOf("const verificarTurno = async"));
  const deps = efecto.slice(efecto.indexOf("}, ["), efecto.indexOf("]);") + 2);
  assert.match(deps, /operadorActivoId/, `el efecto del turno no depende del operador: ${deps}`);
});
