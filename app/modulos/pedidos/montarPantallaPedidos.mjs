// EL ARNÉS DE LOS CANDADOS DE LA PANTALLA DE PEDIDOS.
//
// Monta `app/modulos/pedidos/page.jsx` entera en un DOM (jsdom), con lo que la
// rodea en la app: el router de Next, el slot del shell (`AccionDePaginaProvider`
// y la fila donde el shell dibuja la acción), el `UserProvider` y el
// `OperadorProvider` de verdad —el que levanta el modal del PIN— y el toaster.
//
// El servidor es `fetch` contestando con las respuestas REALES del fixture
// (`enviarCancelar.fixture.json`, escrito por
// scripts/pruebas-db/pedidosEnviarCancelar.mjs contra la base de desarrollo).
// Tiene estado como la base: el carrito que contesta depende de lo que ya pasó,
// y el PIN está o no está según `estado.conPin`.
//
// Lo usan `enviarCancelar.test.mjs` y `pantallaPedidos.test.mjs`. No es un
// candado: no tiene `.test.` en el nombre.

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
export const dialogosNativos = [];
for (const nombre of ["alert", "confirm"]) {
  dom.window[nombre] = (msg) => {
    dialogosNativos.push(`${nombre}: ${msg}`);
    return true;
  };
  globalThis[nombre] = dom.window[nombre];
}

const React = (await import("react")).default;
export const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: PaginaPedidos } = await import("@/app/modulos/pedidos/page.jsx");
const { UserProvider } = await import("@/app/context/UserContext.jsx");
const { OperadorProvider } = await import("@/app/context/OperadorContext.jsx");
const { AccionDePaginaProvider, useAccionDelShell } = await import("@/app/context/AccionDePaginaContext.jsx");
const { SunmiToaster } = await import("@/components/sunmi/SunmiToast.jsx");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js");

export const real = JSON.parse(readFileSync("app/modulos/pedidos/enviarCancelar.fixture.json", "utf8"));
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * El servidor.
 *   - `inicio`: la respuesta del carrito al entrar.
 *   - `solicitar` / `cancelar`: lista de respuestas, una por pedido, en orden.
 *   - `local`: para montar la pantalla de OTRO local del fixture —el de los
 *     120 productos—: `{ me, operadorMe, opciones, catalogo(params) }`, todas
 *     respuestas reales de ese local. Sin esto, el local de los tres productos.
 */
function servidor({ inicio, solicitar = [], cancelar = [], local = null }) {
  const pedidos = [];
  const estado = { conPin: true, carrito: inicio };
  const colas = { solicitar: [...solicitar], cancelar: [...cancelar] };
  globalThis.fetch = async (url, opciones = {}) => {
    const u = new URL(url, "http://localhost");
    const metodo = opciones.method || "GET";
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
    pedidos.push({ ruta: u.pathname, metodo, params: Object.fromEntries(u.searchParams), cuerpo });
    let r = { status: 200, cuerpo: { ok: true } };
    if (u.pathname === "/api/me") r = local ? local.me : real.me;
    else if (u.pathname === "/api/operador/me") r = local ? local.operadorMe : estado.conPin ? real.operadorMeConPin : real.operadorMeSinPin;
    else if (u.pathname === "/api/operador/listar") r = real.operadorListar;
    else if (u.pathname === "/api/pedidos/opciones") r = local ? local.opciones : real.opciones;
    else if (u.pathname === "/api/pedidos/catalogo") {
      r = local ? local.catalogo(Object.fromEntries(u.searchParams)) : u.searchParams.get("categoriaId") ? real.catalogoBebidas : real.catalogo;
    }
    else if (u.pathname === "/api/pedidos/carrito") r = estado.carrito;
    else if (u.pathname === "/api/pedidos/set-cantidad") r = cuerpo?.unidad === "BULTO" ? real.setCantidad_BULTO : real.setCantidad_UNIDAD;
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

// La fila del shell, como la dibuja `LayoutBase`: lo que la pantalla registró
// con `useAccionDePagina`, en un lugar aparte del contenido.
function FilaDelShell() {
  return React.createElement("div", { "data-fila-shell": "" }, useAccionDelShell());
}

function App() {
  return React.createElement(
    AppRouterContext.Provider,
    { value: router },
    React.createElement(
      UserProvider,
      null,
      React.createElement(
        OperadorProvider,
        null,
        React.createElement(
          AccionDePaginaProvider,
          null,
          React.createElement(FilaDelShell),
          React.createElement("main", { "data-contenido": "" }, React.createElement(PaginaPedidos)),
          React.createElement(SunmiToaster)
        )
      )
    )
  );
}

let montadas = [];
/** Para el `afterEach` de cada candado: desmonta todo y limpia lo anotado. */
export async function desmontarTodo() {
  for (const r of montadas) await act(async () => r.unmount());
  montadas = [];
  dialogosNativos.length = 0;
  // El tamaño de página queda guardado en el celular: un caso no le deja el
  // suyo al siguiente.
  dom.window.localStorage.clear();
}

export async function asentar(ms = 50) {
  await act(async () => {
    await esperar(ms);
  });
}

export async function montar(respuestas) {
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

export const texto = () => document.body.textContent;
export const contenido = () => document.querySelector("[data-contenido]");
export const filaShell = () => document.querySelector("[data-fila-shell]");
export const botones = (dentro = document.body) => [...dentro.querySelectorAll("button")];
export const boton = (etiqueta, dentro = document.body) =>
  botones(dentro).find((b) => b.textContent.trim().startsWith(etiqueta)) ?? null;
export const modal = () => document.querySelector("[data-sunmi-modal]");
export const llamadas = (pedidos, ruta) => pedidos.filter((p) => p.ruta === ruta);
export const modalDelPin = () => /Ingresá tu PIN para continuar/.test(texto());

/** Las tarjetas de producto de la lista, con su nombre, su campo y sus botones. */
export const tarjetas = () =>
  [...document.querySelectorAll("[data-tarjeta-pedido]")].map((tarjeta) => ({
    tarjeta,
    nombre: tarjeta.getAttribute("data-tarjeta-pedido"),
    campo: tarjeta.querySelector('input[aria-label^="Cantidad de "]'),
    // La ✕ que se puede tocar (con el producto en el pedido)…
    quitar: tarjeta.querySelector('button[aria-label^="Quitar "]'),
    // …y su lugar, que está siempre: con ✕ o vacío.
    lugarQuitar: tarjeta.querySelector("[data-lugar-quitar]"),
    menos: tarjeta.querySelector('button[aria-label^="Restar uno"]'),
    mas: tarjeta.querySelector('button[aria-label^="Sumar uno"]'),
    unidad: tarjeta.querySelector("[data-unidad-pedido]")?.textContent ?? null,
    foto: tarjeta.querySelector("[data-tarjeta-foto]"),
    inicial: tarjeta.querySelector("[data-tarjeta-inicial]"),
  }));
export const tarjeta = (nombre) => tarjetas().find((t) => t.nombre === nombre) ?? null;

export async function tocar(b) {
  assert.ok(b, "el botón tiene que estar dibujado");
  await act(async () => {
    b.click();
    await esperar(0);
  });
  await asentar();
}

/** Vuelve el operario y la pantalla se entera como en la app: al volver el foco. */
export async function volverElPin(estado) {
  estado.conPin = true;
  await act(async () => {
    window.dispatchEvent(new window.Event("focus"));
    await esperar(0);
  });
  await asentar(200);
}
