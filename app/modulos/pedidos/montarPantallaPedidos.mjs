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
//
// Y el ancho de la ventana: la página monta el teléfono o la computadora según
// `(min-width: 1024px)`. Cada candado elige con `montar({ ancho })` —"telefono"
// por defecto— y `cambiarAncho` simula cruzar el corte. Cualquier otra
// pregunta —la del movimiento reducido— contesta que sí, como siempre.
let anchoDeVentana = "telefono";
const oyentesDelAncho = new Set();
dom.window.matchMedia = (consulta) =>
  /min-width/.test(String(consulta))
    ? {
        // Vivo, como el de verdad: lo lee el manejador del cambio.
        get matches() {
          return anchoDeVentana === "escritorio";
        },
        media: consulta,
        addEventListener: (_, f) => oyentesDelAncho.add(f),
        removeEventListener: (_, f) => oyentesDelAncho.delete(f),
      }
    : { matches: true, addEventListener() {}, removeEventListener() {} };
globalThis.matchMedia = dom.window.matchMedia;

/** Cruzar el corte de 1024 px con la pantalla montada. */
export async function cambiarAncho(ancho) {
  anchoDeVentana = ancho;
  await act(async () => {
    for (const f of [...oyentesDelAncho]) f();
  });
  await asentar(450);
}
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
 *     120 productos, el del recorrido—: `{ me, operadorMe, opciones,
 *     catalogo(params), trasEnviar }`, todas respuestas reales de ese local.
 *     Sin esto, el local de los tres productos.
 *   - `setCantidad`: lo que contesta `set-cantidad` en vez del ok de siempre
 *     (por ejemplo el 409 de "hay un pedido enviado").
 *   - `historial`: lo que contesta `/api/pedidos/historial` (los pedidos
 *     anteriores de la página de entrada). Sin esto, el del local de los tres
 *     productos al entrar: ninguno.
 *   - `sumar`: lista de respuestas de `/api/pedidos/sumar-al-enviado`, una
 *     por confirmación. Con un ok, el carrito pasa a `trasSumar` (por defecto
 *     el real del local de los tres productos después de sumar).
 */
function servidor({ inicio, solicitar = [], cancelar = [], local = null, setCantidad = null, historial = null, sumar = [], trasSumar = null }) {
  const pedidos = [];
  const estado = { conPin: true, carrito: inicio };
  const colas = { solicitar: [...solicitar], cancelar: [...cancelar], sumar: [...sumar] };
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
    else if (u.pathname === "/api/pedidos/historial") r = historial ?? real.historialVacio;
    else if (u.pathname === "/api/pedidos/sumar-al-enviado") {
      r = colas.sumar.shift();
      if (r?.cuerpo?.ok) estado.carrito = trasSumar ?? real.mainTrasSumar;
    }
    else if (u.pathname === "/api/pedidos/set-cantidad") r = setCantidad ?? (cuerpo?.unidad === "BULTO" ? real.setCantidad_BULTO : real.setCantidad_UNIDAD);
    else if (u.pathname === "/api/pos-transferencias/solicitar") {
      r = colas.solicitar.shift();
      if (r === real.solicitado) estado.carrito = real.carritoPendiente;
      // En otro local, lo que contestó el carrito de ese local después de enviar.
      else if (local?.trasEnviar && r?.cuerpo?.ok) estado.carrito = local.trasEnviar;
    } else if (u.pathname === "/api/pos-transferencias/cancelar") {
      r = colas.cancelar.shift();
      if (r === real.cancelado) estado.carrito = real.carritoTrasCancelar;
    }
    assert.ok(r, `el servidor no esperaba ${metodo} ${u.pathname}`);
    return { ok: r.status < 400, status: r.status, json: async () => r.cuerpo };
  };
  return { pedidos, estado };
}

/** Adónde mandó la pantalla al router: `["back"]`, `["push", "/ruta"]`. */
export const navegacion = [];
const router = {
  push: (ruta) => navegacion.push(["push", ruta]),
  back: () => navegacion.push(["back"]),
  replace: () => {},
  refresh: () => {},
  prefetch: () => {},
};

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
  navegacion.length = 0;
  anchoDeVentana = "telefono";
  oyentesDelAncho.clear();
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
  anchoDeVentana = respuestas.ancho ?? "telefono";
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
  // Desde el 2026-10-22 se entra por la página de entrada. Salvo que el
  // candado sea de la entrada (`enLaEntrada`), se pasa por ella como la
  // persona: el botón que abre el catálogo, o "Ver pedido" si el depósito ya lo
  // empezó (ahí no hay catálogo).
  // En la computadora no hay entrada.
  if (!respuestas.enLaEntrada && anchoDeVentana === "telefono") await abrirDesdeLaEntrada();
  return { raiz, ...srv };
}

/** Lo que la página de entrada ofrece para seguir, en el orden en que se busca. */
const PARA_SEGUIR = ["Hacer un pedido", "Seguir armando", "Sumar productos", "Ver pedido"];

export const entrada = () => document.querySelector("[data-entrada-pedido]");

export async function abrirDesdeLaEntrada() {
  const tarjeta = entrada();
  assert.ok(tarjeta, "la pantalla no arrancó en la página de entrada");
  const botonesDeLaEntrada = [...tarjeta.querySelectorAll("button")];
  const seguir = PARA_SEGUIR.map((t) => botonesDeLaEntrada.find((b) => b.textContent.trim() === t)).find(Boolean);
  assert.ok(seguir, `la entrada no ofrece cómo seguir: ${tarjeta.textContent}`);
  await act(async () => seguir.click());
  await asentar(450);
}

// ── LA PÁGINA ENTERA ──────────────────────────────────────────────────────
//
// En 99d7410 la página montaba las dos composiciones a la vez y estas
// funciones miraban solo la del teléfono, para no encontrar los botones de la
// otra. Desde que se monta UNA (`page.jsx`, el reparto), miran la página
// entera otra vez: si algún día volvieran a estar las dos, los candados del
// teléfono encontrarían botones y textos de más y darían rojo, que es lo que
// tiene que pasar. Acotarlos lo taparía. `escritorio()` queda para los
// candados de la computadora.
export const escritorio = () => document.querySelector("[data-pedidos-escritorio-pantalla]");
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
