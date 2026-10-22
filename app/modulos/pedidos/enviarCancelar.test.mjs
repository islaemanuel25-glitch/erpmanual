// ENVIAR Y CANCELAR UN PEDIDO, COMO LO HACE LA PERSONA.
//
//   node --import ./scripts/alias-loader.mjs --test app/modulos/pedidos/enviarCancelar.test.mjs
//
// Se monta la PANTALLA de Pedidos entera en un DOM (jsdom), con el
// `UserProvider` y el `OperadorProvider` de verdad —el mismo que levanta el modal
// del PIN en el POS— y el toaster del shell, y se toca como en el celular.
//
// El servidor es `fetch` contestando con las respuestas REALES del fixture
// (`enviarCancelar.fixture.json`, escrito por
// scripts/pruebas-db/pedidosEnviarCancelar.mjs contra la base de desarrollo):
// el carrito armado, el 428 con `needsOperador` que devuelven solicitar y
// cancelar sin operario, el ok de cada una y el carrito que contesta después.
//
// Los tres candados:
//   1. después de enviar, el pendiente aparece en el acto, sin recargar;
//   2. ni `alert` ni `confirm`: el aviso es un toast y cancelar se confirma en
//      un modal del kit con "Volver" y "Cancelar pedido";
//   3. `needsOperador` pide el PIN encima de la pantalla, el carrito queda, y no
//      se reintenta solo: el segundo envío lo hace la persona.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event", "FocusEvent", "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "MutationObserver"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
// El toaster pregunta por el movimiento reducido.
dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
globalThis.matchMedia = dom.window.matchMedia;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Un `alert` o un `confirm` del navegador frenan la pantalla en el celular. Si la
// pantalla llama a alguno, queda anotado y el candado lo dice.
const dialogosNativos = [];
for (const nombre of ["alert", "confirm"]) {
  dom.window[nombre] = (msg) => {
    dialogosNativos.push(`${nombre}: ${msg}`);
    return true;
  };
  globalThis[nombre] = dom.window[nombre];
}

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: PaginaPedidos } = await import("@/app/modulos/pedidos/page.jsx");
const { UserProvider } = await import("@/app/context/UserContext.jsx");
const { OperadorProvider } = await import("@/app/context/OperadorContext.jsx");
const { SunmiToaster } = await import("@/components/sunmi/SunmiToast.jsx");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js");

const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * El servidor, con estado como la base: el carrito que contesta depende de lo
 * que ya pasó, y el PIN está o no está según `conPin`.
 *   - `solicitar` / `cancelar`: lista de respuestas, una por pedido, en orden.
 */
function servidor({ inicio, solicitar = [], cancelar = [] }) {
  const pedidos = [];
  const estado = { conPin: true, carrito: inicio };
  const colas = { solicitar: [...solicitar], cancelar: [...cancelar] };
  globalThis.fetch = async (url, opciones = {}) => {
    const u = new URL(url, "http://localhost");
    const metodo = opciones.method || "GET";
    pedidos.push({ ruta: u.pathname, metodo, cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    let r = { status: 200, cuerpo: { ok: true } };
    if (u.pathname === "/api/me") r = real.me;
    else if (u.pathname === "/api/operador/me") r = estado.conPin ? real.operadorMeConPin : real.operadorMeSinPin;
    else if (u.pathname === "/api/operador/listar") r = real.operadorListar;
    else if (u.pathname === "/api/pedidos/opciones") r = real.opciones;
    else if (u.pathname === "/api/pedidos/catalogo") r = real.catalogo;
    else if (u.pathname === "/api/pedidos/carrito") r = estado.carrito;
    else if (u.pathname === "/api/pos-transferencias/solicitar") {
      r = colas.solicitar.shift();
      if (r === real.solicitado) estado.carrito = real.carritoPendiente;
    } else if (u.pathname === "/api/pos-transferencias/cancelar") {
      r = colas.cancelar.shift();
      if (r === real.cancelado) estado.carrito = real.carritoTrasCancelar;
    }
    assert.ok(r, `el servidor no esperaba ${metodo} ${u.pathname}`);
    return { ok: r.status < 400, status: r.status, json: async () => r.cuerpo };
  };
  return { pedidos, estado };
}

const router = { push: () => {}, back: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} };
function App() {
  return React.createElement(
    AppRouterContext.Provider,
    { value: router },
    React.createElement(
      UserProvider,
      null,
      React.createElement(OperadorProvider, null, React.createElement(PaginaPedidos), React.createElement(SunmiToaster))
    )
  );
}

let montadas = [];
afterEach(async () => {
  for (const r of montadas) await act(async () => r.unmount());
  montadas = [];
  dialogosNativos.length = 0;
});

async function asentar(ms = 50) {
  await act(async () => {
    await esperar(ms);
  });
}

async function montar(respuestas) {
  const srv = servidor(respuestas);
  const raiz = document.createElement("div");
  document.body.replaceChildren(raiz);
  const root = createRoot(raiz);
  montadas.push(root);
  await act(async () => {
    root.render(React.createElement(App));
  });
  // Perfil, operador, opciones, carrito y el catálogo (que espera 300 ms).
  await asentar(450);
  return { raiz, ...srv };
}

const texto = () => document.body.textContent;
const botones = (dentro = document.body) => [...dentro.querySelectorAll("button")];
const boton = (etiqueta, dentro = document.body) => botones(dentro).find((b) => b.textContent.trim().startsWith(etiqueta)) ?? null;
const modal = () => document.querySelector("[data-sunmi-modal]");
const fuera = (sel) => [...document.querySelectorAll(sel)];
const llamadas = (pedidos, ruta) => pedidos.filter((p) => p.ruta === ruta);
const modalDelPin = () => /Ingresá tu PIN para continuar/.test(texto());

async function tocar(b) {
  assert.ok(b, "el botón tiene que estar dibujado");
  await act(async () => {
    b.click();
    await esperar(0);
  });
  await asentar();
}

async function irAlCarrito() {
  await tocar(boton("Ver mi pedido"));
  assert.match(texto(), /Mi Pedido/);
}

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
  assert.doesNotMatch(texto(), /Pedido solicitado pendiente/);
  await irAlCarrito();
  await tocar(boton("Enviar pedido al depósito"));

  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1);
  assert.match(texto(), /Pedido solicitado pendiente/, "el banner del pendiente tiene que aparecer sin recargar");
  assert.match(texto(), new RegExp(`POS #${real.carritoPendiente.cuerpo.pendiente.posId}`));
  assert.match(texto(), /Pedido enviado al depósito correctamente/, "el aviso va en el toast");
  assert.deepEqual(dialogosNativos, []);
  // Y la carga es la del carrito, no otra: se pidió después del envío.
  const iSol = pedidos.findIndex((p) => p.ruta === "/api/pos-transferencias/solicitar");
  assert.ok(pedidos.slice(iSol + 1).some((p) => p.ruta === "/api/pedidos/carrito"), "después del envío se vuelve a pedir el carrito");
});

test("3: enviar sin operario pide el PIN, deja el carrito y no reintenta solo; el segundo toque envía", async () => {
  const { pedidos, estado } = await montar({ inicio: real.carritoBorrador, solicitar: [real.solicitarSinOperador, real.solicitado] });
  await irAlCarrito();
  estado.conPin = false; // la sesión del operario venció del lado del servidor
  await tocar(boton("Enviar pedido al depósito"));

  assert.ok(modalDelPin(), "tiene que aparecer el modal del PIN encima de la pantalla");
  assert.match(texto(), /Mi Pedido/, "sigue en el carrito, sin navegar");
  assert.ok(boton("Enviar pedido al depósito (2 productos)"), "el carrito sigue con sus dos productos");
  assert.match(texto(), /Ingresá tu PIN y volvé a tocar/);
  assert.doesNotMatch(texto(), /Se requiere un operador activo/, "no es un error genérico");
  assert.doesNotMatch(texto(), /Pedido solicitado pendiente/);

  // Sin reintento automático: con el PIN de vuelta, no sale otro envío solo.
  estado.conPin = true;
  await act(async () => {
    window.dispatchEvent(new window.Event("focus"));
    await esperar(0);
  });
  await asentar(200);
  assert.ok(!modalDelPin(), "con el operario de vuelta el modal se va");
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 1, "no se reintentó solo");

  await tocar(boton("Enviar pedido al depósito"));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/solicitar").length, 2);
  assert.match(texto(), /Pedido solicitado pendiente/);
  assert.deepEqual(dialogosNativos, []);
});

test("2: cancelar se confirma en un modal del kit; Volver no cancela", async () => {
  const { pedidos } = await montar({ inicio: real.carritoPendiente, cancelar: [real.cancelado] });
  assert.match(texto(), /Pedido solicitado pendiente/);
  assert.equal(modal(), null);

  await tocar(boton("Cancelar pedido"));
  assert.ok(modal(), "tiene que abrir el modal");
  assert.match(modal().textContent, /¿Cancelar el pedido solicitado\? Se eliminarán todos los items\./);
  assert.deepEqual(botones(modal()).map((b) => b.textContent.trim()).filter((t) => t === "Volver" || t === "Cancelar pedido"), ["Volver", "Cancelar pedido"]);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 0, "abrir el modal no cancela");

  await tocar(boton("Volver", modal()));
  assert.equal(modal(), null);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 0, "Volver no cancela");

  await tocar(boton("Cancelar pedido"));
  await tocar(boton("Cancelar pedido", modal()));
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 1);
  assert.equal(modal(), null);
  assert.doesNotMatch(texto(), /Pedido solicitado pendiente/);
  assert.deepEqual(dialogosNativos, []);
});

test("3: cancelar sin operario pide el PIN, el pendiente queda y no reintenta solo", async () => {
  const { pedidos, estado } = await montar({ inicio: real.carritoPendiente, cancelar: [real.cancelarSinOperador, real.cancelado] });
  estado.conPin = false;
  await tocar(boton("Cancelar pedido"));
  await tocar(boton("Cancelar pedido", modal()));

  assert.ok(modalDelPin(), "tiene que aparecer el modal del PIN");
  assert.match(texto(), /Pedido solicitado pendiente/, "el pendiente sigue");
  assert.match(texto(), /Ingresá tu PIN y volvé a tocar/);
  assert.doesNotMatch(texto(), /Se requiere un operador activo/);

  estado.conPin = true;
  await act(async () => {
    window.dispatchEvent(new window.Event("focus"));
    await esperar(0);
  });
  await asentar(200);
  assert.equal(llamadas(pedidos, "/api/pos-transferencias/cancelar").length, 1, "no se reintentó solo");
  assert.equal(fuera("[data-sunmi-modal]").length, 0);
  assert.deepEqual(dialogosNativos, []);
});
