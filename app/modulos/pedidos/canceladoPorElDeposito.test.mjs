// EL LOCAL, DESPUÉS DE QUE EL DEPÓSITO LE CANCELÓ EL PEDIDO.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/canceladoPorElDeposito.test.mjs
//
// Pedido por Emanuel (2026-10-23): el pedido que cancela el depósito el local
// lo ve "Cancelado" en la entrada de Pedidos y en el historial, y la entrada
// vuelve a "No tenés un pedido en curso" con "Hacer un pedido".
//
// Con las respuestas REALES que dieron las rutas del local justo después de la
// cancelación del depósito (sección 15 de
// `scripts/pruebas-db/pedidosEnviarCancelar.mjs`): su carrito, su historial y
// su catálogo, con su usuario y su operador.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const A = await import("./montarPantallaPedidos.mjs");
const { default: PaginaHistorialPedidos } = await import("./historial/page.jsx");

afterEach(A.desmontarTodo);

const dep = JSON.parse(readFileSync("app/modulos/pos-transferencias/deposito.fixture.json", "utf8"));
const { pb } = dep.depositoCancelarIds;

const local = {
  me: dep.depositoCanceloMeDelLocal,
  operadorMe: dep.depositoCanceloOperadorDelLocal,
  opciones: dep.depositoCanceloOpcionesDelLocal,
  catalogo: () => dep.depositoCanceloCatalogoDelLocal,
};
const montarComoElLocal = (extra = {}) =>
  A.montar({ local, inicio: dep.depositoCanceloCarritoDelLocal, historial: dep.depositoCanceloHistorialDelLocal, ...extra });

const filaDe = (id) =>
  [...document.querySelectorAll("[data-pedido-anterior]")].find((f) => Number(f.getAttribute("data-pedido-anterior")) === id) ?? null;

test("el fixture: el carrito del local sin pedido, y el cancelado por el depósito en su historial", () => {
  assert.equal(dep.depositoCanceloCarritoDelLocal.cuerpo.pendiente, null);
  assert.equal(dep.depositoCanceloCarritoDelLocal.cuerpo.items.length, 0);
  const h = dep.depositoCanceloHistorialDelLocal.cuerpo.items.find((p) => p.posId === pb);
  assert.ok(h, "el cancelado no está en el historial del local");
  assert.equal(h.estado, "Cancelado");
});

test("la entrada: No tenés un pedido en curso, Hacer un pedido, y el cancelado abajo como Cancelado", async () => {
  await montarComoElLocal({ enLaEntrada: true });
  const e = A.entrada();
  assert.ok(e, "no se montó la entrada");
  assert.match(e.textContent, /No tenés un pedido en curso/);
  assert.deepEqual(A.botones(e).map((b) => b.textContent.trim()), ["Hacer un pedido"]);
  const f = filaDe(pb);
  assert.ok(f, "el cancelado no está en los pedidos anteriores");
  assert.match(f.textContent, /Cancelado/);
});

test("el historial: el cancelado por el depósito dice Cancelado", async () => {
  await montarComoElLocal({ pagina: PaginaHistorialPedidos });
  const f = filaDe(pb);
  assert.ok(f, "el cancelado no está en el historial");
  assert.match(f.textContent, /Cancelado/);
});
