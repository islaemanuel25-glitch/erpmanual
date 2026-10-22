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
  real, montar, desmontarTodo, texto, boton, modal, llamadas, modalDelPin, tocar, dialogosNativos, volverElPin, tarjetas, entrada,
} = await import("./montarPantallaPedidos.mjs");

afterEach(desmontarTodo);

// Ojo: nunca `assert.equal(nodo, null)`. Si falla, el mensaje quiere imprimir
// el nodo de jsdom entero y el proceso se cuelga en vez de dar rojo. Con
// `assert.ok(!nodo, …)` el rojo se ve.

// En el catálogo se ve en la barra; en la página de entrada, en la tarjeta.
const esperandoAlDeposito = () => /Pedido enviado · \d+ producto|todavía podés sumar productos/.test(texto());

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
  // Un toque y sale: "Enviar pedido al depósito (N)" envía directo. El paso de
  // revisión de 280ec05 ("Revisar y enviar" → "Confirmar y enviar") se fue.
  await tocar(boton("Enviar pedido al depósito"));

  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1);
  assert.ok(esperandoAlDeposito(), "el pendiente tiene que aparecer sin recargar");
  // Y se vuelve sola a la entrada, con cancelar en la tarjeta.
  assert.ok(entrada(), "después de enviar no volvió a la entrada");
  assert.ok(boton("Cancelar pedido", entrada()), "y con él, cancelar en la tarjeta");
  assert.match(texto(), /Pedido enviado al depósito correctamente/, "el aviso va en el toast");
  assert.deepEqual(dialogosNativos, []);
  // Y la carga es la del carrito, no otra: se pidió después del envío.
  const iSol = pedidos.findIndex((p) => p.ruta === "/api/pos-transferencias/solicitar");
  assert.ok(pedidos.slice(iSol + 1).some((p) => p.ruta === "/api/pedidos/carrito"), "después del envío se vuelve a pedir el carrito");
});

test("3: enviar sin operario pide el PIN, deja el carrito y no reintenta solo; el segundo toque envía", async () => {
  const { pedidos, estado } = await montar({ inicio: real.carritoBorrador, solicitar: [real.solicitarSinOperador, real.solicitado] });
  estado.conPin = false; // la sesión del operario venció del lado del servidor
  await tocar(boton("Enviar pedido al depósito"));

  assert.ok(modalDelPin(), "tiene que aparecer el modal del PIN encima de la pantalla");
  // Decía "sigue en Ver mi pedido": desde que se envía desde el catálogo,
  // sigue en el catálogo, con lo cargado.
  assert.deepEqual(tarjetas().map((t) => t.nombre).sort(), ["Agua x6", "Coca 2L", "Yerba 1kg"], "sigue en el catálogo");
  assert.match(texto(), /2 productos en el pedido/);
  assert.ok(!entrada(), "sin PIN no tiene que irse a la entrada");
  assert.match(texto(), /Ingresá tu PIN y volvé a tocar/);
  assert.doesNotMatch(texto(), /Se requiere un operador activo/, "no es un error genérico");
  assert.ok(!esperandoAlDeposito());

  // Sin reintento automático: con el PIN de vuelta, no sale otro envío solo.
  await volverElPin(estado);
  assert.ok(!modalDelPin(), "con el operario de vuelta el modal se va");
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1, "no se reintentó solo");

  await tocar(boton("Enviar pedido al depósito"));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 2);
  assert.ok(esperandoAlDeposito());
  assert.deepEqual(dialogosNativos, []);
});

// Cancelar está en la tarjeta de la entrada: desde el 2026-10-22 el catálogo
// del pedido enviado es el modo sumar, y su barra no lleva cancelar.
test("2: cancelar se confirma en un modal del kit; Volver no cancela", async () => {
  const { pedidos } = await montar({ inicio: real.carritoPendiente, cancelar: [real.cancelado], enLaEntrada: true });
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
  const { pedidos, estado } = await montar({ inicio: real.carritoPendiente, cancelar: [real.cancelarSinOperador, real.cancelado], enLaEntrada: true });
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
