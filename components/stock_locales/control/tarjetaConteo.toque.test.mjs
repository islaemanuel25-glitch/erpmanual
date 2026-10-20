// EL TOQUE EN LA TARJETA DEL CONTROL DE STOCK, COMO LO HACE LA PERSONA.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/control/tarjetaConteo.toque.test.mjs
//
// Los candados de `controlStock.test.mjs` dibujan la tarjeta con
// `renderToStaticMarkup`: ven el HTML y no ven el foco, el blur ni lo que pasa
// cuando contesta el servidor. Los tres errores que vio Emanuel en el local
// vivían ahí —"Está bien" que no quedaba guardado, el campo escrito sin nada que
// tocar para aceptarlo y el rótulo "Contado" en un producto sin contar—, así que
// acá se monta la PANTALLA y el HOOK de verdad en un DOM (jsdom) y se toca como
// en el celular: el campo con el foco, el dedo en el botón —el foco pasa del
// campo al botón, que es lo que hace Chrome en Android— y el click.
//
// El servidor es `fetch` contestando con las respuestas REALES del fixture
// (`lecturaReal.fixture.json`, escrito por scripts/pruebas-db/controlStock.mjs):
// la lista de antes de tocar y lo que contestó el guardado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event", "FocusEvent", "MouseEvent", "KeyboardEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: PantallaControlStock } = await import("@/components/stock_locales/control/PantallaControlStock.jsx");
const { useControlStock } = await import("@/components/stock_locales/control/useControlStock.js");

const real = JSON.parse(readFileSync("components/stock_locales/control/lecturaReal.fixture.json", "utf8"));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** El servidor: cada pedido de la pantalla contesta con una respuesta real. */
function servidor({ lista, guardado }) {
  const pedidos = [];
  globalThis.fetch = async (url, opciones = {}) => {
    const u = new URL(url, "http://localhost");
    const metodo = opciones.method || "GET";
    pedidos.push({ ruta: u.pathname, metodo, cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    let datos = { ok: true, items: [] };
    if (u.pathname === "/api/stock_locales/control") datos = real.abierto;
    else if (u.pathname === "/api/stock_locales/listar") datos = lista;
    else if (u.pathname === "/api/stock_locales/control/conteos" && metodo === "PUT") datos = guardado;
    return { ok: true, status: 200, json: async () => datos };
  };
  return pedidos;
}

// Estable, como el `useCallback` de OperadorContext: una función nueva en cada
// render rehace `pedir` y el estado se vuelve a pedir sin fin.
const requerirOperador = () => {};

function Pantalla() {
  const c = useControlStock({ puedeGestionar: false, requerirOperador });
  return React.createElement(PantallaControlStock, { c, puedeGestionar: false });
}

/** Monta la pantalla y espera la lista (el buscador filtra a los 300 ms). */
async function montar(respuestas) {
  const pedidos = servidor(respuestas);
  const raiz = document.createElement("div");
  document.body.replaceChildren(raiz);
  const root = createRoot(raiz);
  await act(async () => {
    root.render(React.createElement(Pantalla));
  });
  await act(async () => {
    await esperar(400);
  });
  const fila = raiz.querySelector("[data-fila-conteo]");
  assert.ok(fila, "la tarjeta tiene que estar dibujada");
  return { raiz, root, pedidos };
}

const fila = (raiz) => raiz.querySelector("[data-fila-conteo]");
const rotulo = (raiz) => fila(raiz).querySelector("p");
const campo = (raiz) => fila(raiz).querySelector("input");
const boton = (raiz, texto) => [...fila(raiz).querySelectorAll("button")].find((b) => b.textContent.trim() === texto) ?? null;

/** El dedo en un campo: el foco entra. */
async function tocarCampo(input) {
  await act(async () => {
    input.focus();
  });
}

/** El dedo en un botón: el foco pasa del campo al botón y después llega el click. */
async function tocarBoton(b) {
  await act(async () => {
    b.focus();
  });
  await act(async () => {
    b.click();
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
}

/** Escribir como el teclado: el valor nuevo y el evento `input`. */
async function escribir(input, texto) {
  const poner = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    poner.call(input, texto);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

const texto = (el) => el.textContent.replace(/\s+/g, " ").trim();

test("el foco pasa del campo al botón como en el celular (si no, este arnés no prueba nada)", async () => {
  const { raiz, root } = await montar({ lista: real.listaAntesDeEstaBien, guardado: real.estaBienDelAceite });
  let relacionado = undefined;
  campo(raiz).addEventListener("focusout", (e) => (relacionado = e.relatedTarget));
  await tocarCampo(campo(raiz));
  await act(async () => {
    boton(raiz, "Está bien").focus();
  });
  assert.equal(relacionado, boton(raiz, "Está bien"));
  await act(async () => root.unmount());
});

test("1 · 'Está bien' con el campo tocado guarda el stock del sistema y la tarjeta queda contada", async () => {
  const { raiz, root, pedidos } = await montar({ lista: real.listaAntesDeEstaBien, guardado: real.estaBienDelAceite });
  const aceite = real.listaAntesDeEstaBien.items[0];
  assert.equal(aceite.conteo, null, "arranca sin contar");
  await tocarCampo(campo(raiz));
  await tocarBoton(boton(raiz, "Está bien"));

  const puts = pedidos.filter((p) => p.metodo === "PUT");
  assert.deepEqual(puts.map((p) => p.cuerpo), [{ productoLocalId: aceite.id, estaBien: true }], "un solo guardado, el de Está bien");
  assert.match(texto(rotulo(raiz)), /^✓ Contado · Ana · \d\d:\d\d$/);
  assert.equal(campo(raiz).value, "3", "el campo dice lo que se guardó");
  assert.match(texto(fila(raiz)), /Sistema 3 · Contado 3 · Sin diferencia/);
  assert.equal(fila(raiz).dataset.filaConteo, "contado");
  assert.match(texto(raiz), new RegExp(`Contados · ${real.estaBienDelAceite.resumen.contados}`), "y sube Contados");
  // Y salir del campo después no borra lo guardado.
  await act(async () => {
    document.body.focus();
    campo(raiz).focus();
  });
  await act(async () => {
    campo(raiz).blur();
    await esperar(0);
  });
  assert.equal(pedidos.filter((p) => p.metodo === "PUT").length, 1, "tocar y salir del campo no manda un borrado");
  await act(async () => root.unmount());
});

test("1 · 'Está bien' sin tocar el campo también queda contado", async () => {
  const { raiz, root } = await montar({ lista: real.listaAntesDeEstaBien, guardado: real.estaBienDelAceite });
  await tocarBoton(boton(raiz, "Está bien"));
  assert.match(texto(rotulo(raiz)), /^✓ Contado · Ana/);
  assert.equal(campo(raiz).value, "3");
  await act(async () => root.unmount());
});

test("2 · con un valor escrito aparece 'Aceptar' en lugar de 'Está bien', a todo el ancho y de 44 px, y guarda al tocarlo", async () => {
  const { raiz, root, pedidos } = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  const queso = real.listaAntesDelQueso.items[0];
  assert.equal(boton(raiz, "Aceptar"), null, "vacío y sin contar: no hay Aceptar");
  await tocarCampo(campo(raiz));
  await escribir(campo(raiz), "1,25");
  const aceptar = boton(raiz, "Aceptar");
  assert.ok(aceptar, "con un valor escrito, Aceptar");
  assert.equal(boton(raiz, "Está bien"), null, "en su lugar, no al lado");
  assert.match(aceptar.className, /(^| )min-h-toque( |$)/);
  assert.match(aceptar.className, /(^| )w-full( |$)/);
  assert.match(aceptar.className, /sunmi-btn-primary/);
  await tocarBoton(aceptar);

  assert.deepEqual(pedidos.filter((p) => p.metodo === "PUT").map((p) => p.cuerpo), [{ productoLocalId: queso.id, total: 1.25 }]);
  assert.match(texto(rotulo(raiz)), /^✓ Contado · Emanuel · \d\d:\d\d$/);
  assert.equal(campo(raiz).value, "1,25");
  assert.equal(boton(raiz, "Aceptar"), null, "guardado igual a lo escrito: no hay Aceptar");
  assert.match(texto(fila(raiz)), /Sistema 2,5 · Contado 1,25 · Faltan 1,25 kg/);
  await act(async () => root.unmount());
});

test("2 · Enter y salir del campo siguen guardando", async () => {
  const { raiz, root, pedidos } = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  await tocarCampo(campo(raiz));
  await escribir(campo(raiz), "1,25");
  await act(async () => {
    campo(raiz).blur();
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
  assert.deepEqual(pedidos.filter((p) => p.metodo === "PUT").map((p) => p.cuerpo.total), [1.25], "al salir");
  assert.match(texto(rotulo(raiz)), /^✓ Contado/);
  await act(async () => root.unmount());

  const otra = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  await tocarCampo(campo(otra.raiz));
  await escribir(campo(otra.raiz), "1,25");
  await act(async () => {
    campo(otra.raiz).dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await esperar(0);
  });
  await act(async () => {
    await esperar(0);
  });
  assert.deepEqual(otra.pedidos.filter((p) => p.metodo === "PUT").map((p) => p.cuerpo.total), [1.25], "con Enter");
  assert.match(texto(rotulo(otra.raiz)), /^✓ Contado/);
  await act(async () => otra.root.unmount());
});

test("3 · con el campo vacío y el foco adentro, dice 'Sin contar' en gris; 'Contado' en acción solo escribiendo", async () => {
  const { raiz, root } = await montar({ lista: real.listaAntesDelQueso, guardado: real.guardadoDelQueso });
  await tocarCampo(campo(raiz));
  assert.equal(texto(rotulo(raiz)), "Sin contar");
  assert.match(rotulo(raiz).className, /sunmi-text-muted/);
  assert.doesNotMatch(rotulo(raiz).className, /sunmi-text-accent/);
  await escribir(campo(raiz), "1");
  assert.equal(texto(rotulo(raiz)), "Contado");
  assert.match(rotulo(raiz).className, /sunmi-text-accent/);
  await escribir(campo(raiz), "");
  assert.equal(texto(rotulo(raiz)), "Sin contar", "borrar lo escrito sin aceptar vuelve a Sin contar");
  await act(async () => root.unmount());
});
