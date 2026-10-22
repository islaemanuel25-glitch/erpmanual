// ENVIAR Y CANCELAR UN PEDIDO, COMO LO HACE LA PERSONA.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/enviarCancelar.test.mjs
//
// La pantalla montada entera con el arnés de `montarPantallaPedidos.mjs`: el
// `OperadorProvider` de verdad —el mismo que levanta el modal del PIN en el
// POS—, el toaster del shell y `fetch` contestando las respuestas REALES de las
// rutas sobre la base de desarrollo.
//
// Los tres candados:
//   1. después de enviar, el pendiente aparece en el acto, sin recargar;
//   2. ni `alert` ni `confirm`: el aviso es un toast y cancelar se confirma en
//      un modal del kit con "Volver" y "Cancelar pedido";
//   3. `needsOperador` pide el PIN encima de la pantalla, el carrito queda, y no
//      se reintenta solo: el segundo envío lo hace la persona.
//
// Desde el rediseño de la pantalla, "pendiente" se ve en la barra de abajo
// —"Pedido enviado · N productos"—, con cancelar al lado. Decía "esperando al
// depósito", que desde el 2026-10-22 no sale: el pedido enviado se sigue
// armando ("Podés sumar productos…") hasta que el depósito lo empieza. Lo que
// estos candados afirman no cambió.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

const {
  real, montar, desmontarTodo, texto, boton, modal, llamadas, modalDelPin, tocar, dialogosNativos, volverElPin, tarjetas,
} = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

// Ojo: nunca `assert.equal(nodo, null)`. Si falla, el mensaje quiere imprimir
// el nodo de jsdom entero y el proceso se cuelga en vez de dar rojo. Con
// `assert.ok(!nodo, …)` el rojo se ve.

const esperandoAlDeposito = () => /Pedido enviado · \d+ producto/.test(texto());

test("el fixture es el que contestan las rutas: los 428 traen needsOperador y el carrito armado no tiene pendiente", () => {
  assert.equal(real.solicitarSinOperador.status, 428);
  assert.equal(real.solicitarSinOperador.cuerpo.needsOperador, true);
  assert.equal(real.cancelarSinOperador.status, 428);
  assert.equal(real.cancelarSinOperador.cuerpo.needsOperador, true);
  assert.equal(real.carritoBorrador.cuerpo.pendiente, null);
  assert.equal(real.carritoBorrador.cuerpo.itemCount, 2);
  assert.equal(real.carritoPendiente.cuerpo.pendiente.posId, real.carritoBorrador.cuerpo.posId);
});

test("1 y 2: enviar muestra el pendiente en el acto y avisa con un toast, sin alert", async () => {
  const { pedidos } = await montar({ inicio: real.carritoBorrador, solicitar: [real.solicitado] });
  assert.ok(!esperandoAlDeposito());
  // Desde 2026-10-22 se envía desde la revisión: "Revisar y enviar" lleva ahí
  // y "Confirmar y enviar al depósito" es el que manda.
  await tocar(boton("Revisar y enviar"));
  await tocar(boton("Confirmar y enviar al depósito"));

  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1);
  assert.ok(esperandoAlDeposito(), "el pendiente tiene que aparecer sin recargar");
  assert.ok(boton("Cancelar pedido"), "y con él, cancelar en la barra");
  assert.match(texto(), /Pedido enviado al depósito correctamente/, "el aviso va en el toast");
  assert.deepEqual(dialogosNativos, []);
  // Y la carga es la del carrito, no otra: se pidió después del envío.
  const iSol = pedidos.findIndex((p) => p.ruta === "/api/pos-transferencias/solicitar");
  assert.ok(pedidos.slice(iSol + 1).some((p) => p.ruta === "/api/pedidos/carrito"), "después del envío se vuelve a pedir el carrito");
});

test("3: enviar sin operario pide el PIN, deja el carrito y no reintenta solo; el segundo toque envía", async () => {
  const { pedidos, estado } = await montar({ inicio: real.carritoBorrador, solicitar: [real.solicitarSinOperador, real.solicitado] });
  await tocar(boton("Revisar y enviar"));
  estado.conPin = false; // la sesión del operario venció del lado del servidor
  await tocar(boton("Confirmar y enviar al depósito"));

  assert.ok(modalDelPin(), "tiene que aparecer el modal del PIN encima de la pantalla");
  assert.deepEqual(tarjetas().map((t) => t.nombre).sort(), ["Agua x6", "Coca 2L"], "sigue en Ver mi pedido con sus dos productos");
  assert.match(texto(), /2 productos en el pedido/);
  assert.match(texto(), /Ingresá tu PIN y volvé a tocar/);
  assert.doesNotMatch(texto(), /Se requiere un operador activo/, "no es un error genérico");
  assert.ok(!esperandoAlDeposito());

  // Sin reintento automático: con el PIN de vuelta, no sale otro envío solo.
  await volverElPin(estado);
  assert.ok(!modalDelPin(), "con el operario de vuelta el modal se va");
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1, "no se reintentó solo");

  await tocar(boton("Confirmar y enviar al depósito"));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 2);
  assert.ok(esperandoAlDeposito());
  assert.deepEqual(dialogosNativos, []);
});

test("2: cancelar se confirma en un modal del kit; Volver no cancela", async () => {
  const { pedidos } = await montar({ inicio: real.carritoPendiente, cancelar: [real.cancelado] });
  assert.ok(esperandoAlDeposito());
  assert.ok(!modal(), "el modal tiene que estar cerrado");

  await tocar(boton("Cancelar pedido"));
  assert.ok(modal(), "tiene que abrir el modal");
  assert.match(modal().textContent, /¿Cancelar el pedido solicitado\? Se eliminarán todos los items\./);
  const delModal = [...modal().querySelectorAll("button")].map((b) => b.textContent.trim()).filter((t) => t === "Volver" || t === "Cancelar pedido");
  assert.deepEqual(delModal, ["Volver", "Cancelar pedido"]);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 0, "abrir el modal no cancela");

  await tocar(boton("Volver", modal()));
  assert.ok(!modal(), "el modal tiene que estar cerrado");
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 0, "Volver no cancela");

  await tocar(boton("Cancelar pedido"));
  await tocar(boton("Cancelar pedido", modal()));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 1);
  assert.ok(!modal(), "el modal tiene que estar cerrado");
  assert.ok(!esperandoAlDeposito());
  assert.deepEqual(dialogosNativos, []);
});

test("3: cancelar sin operario pide el PIN, el pendiente queda y no reintenta solo", async () => {
  const { pedidos, estado } = await montar({ inicio: real.carritoPendiente, cancelar: [real.cancelarSinOperador, real.cancelado] });
  estado.conPin = false;
  await tocar(boton("Cancelar pedido"));
  await tocar(boton("Cancelar pedido", modal()));

  assert.ok(modalDelPin(), "tiene que aparecer el modal del PIN");
  assert.ok(esperandoAlDeposito(), "el pendiente sigue");
  assert.match(texto(), /Ingresá tu PIN y volvé a tocar/);
  assert.doesNotMatch(texto(), /Se requiere un operador activo/);

  await volverElPin(estado);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 1, "no se reintentó solo");
  assert.ok(!modal(), "el modal tiene que estar cerrado");
  assert.deepEqual(dialogosNativos, []);
});
