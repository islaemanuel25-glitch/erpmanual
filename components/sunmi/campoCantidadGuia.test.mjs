// `minimoComoGuia`: EL MÍNIMO ES GUÍA, NO UN NÚMERO CARGADO.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/campoCantidadGuia.test.mjs
//
// Pedidos: con el producto en 0, el 0 quedaba escrito y lo que se tipeaba se le
// sumaba. Con la opción, en el mínimo el campo está vacío con el mínimo de
// placeholder, y al enfocar lo que se escribe REEMPLAZA lo que había.
//
// Se monta la pieza en jsdom con un consumidor mínimo que guarda lo que recibe,
// como hace cualquier pantalla. jsdom no tiene teclado: "escribir" es poner en
// el campo lo que dejaría el teclado y disparar `input`. Por eso cada caso de
// reemplazo se prueba de las dos formas en que puede llegar en un celular: con
// la selección que anduvo (queda solo lo nuevo) y con la selección perdida (lo
// nuevo atrás de lo que había).

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const clave of ["window", "document", "HTMLElement", "HTMLInputElement", "Node", "Event", "FocusEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: SunmiCampoCantidad } = await import("./SunmiCampoCantidad.jsx");

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = { etiqueta: "Cantidad de Yerba", minimo: 0, tamano: "grande", claseMarco: "w-16", apagaMenosEnMinimo: true };

// Capturado en 6638069, ANTES de la opción, con `renderToStaticMarkup` y las
// props con que lo usa Pedidos. No transcrito a mano.
const BOTON = "flex items-center justify-center min-w-toque min-h-toque rounded pos-control text-lg font-bold transition-colors select-none shrink-0 disabled:opacity-40";
const CONGELADO = {
  enCero: `<div class="flex items-center gap-1"><button type="button" class="${BOTON}" aria-label="Restar uno a Cantidad de Yerba" disabled="">−</button><span class="min-w-0 rounded-lg w-16 border sunmi-divider"><input type="text" inputMode="numeric" aria-label="Cantidad de Yerba" class="sunmi-input disabled:opacity-60 disabled:cursor-not-allowed w-full border-0 px-0 text-center min-h-toque text-xl2" value="0"/></span><button type="button" class="${BOTON}" aria-label="Sumar uno a Cantidad de Yerba">+</button></div>`,
  conNueve: `<div class="flex items-center gap-1"><button type="button" class="${BOTON}" aria-label="Restar uno a Cantidad de Yerba">−</button><span class="min-w-0 rounded-lg w-16 border sunmi-divider"><input type="text" inputMode="numeric" aria-label="Cantidad de Yerba" class="sunmi-input disabled:opacity-60 disabled:cursor-not-allowed w-full border-0 px-0 text-center min-h-toque text-xl2" value="9"/></span><button type="button" class="${BOTON}" aria-label="Sumar uno a Cantidad de Yerba">+</button></div>`,
};

let raiz = null;
afterEach(async () => {
  if (raiz) await act(async () => raiz.unmount());
  raiz = null;
  document.body.replaceChildren();
});

/** Monta la pieza con un consumidor que guarda el string que recibe. */
async function montar({ inicial, prendida }) {
  const recibido = [];
  function Consumidor() {
    const [valor, setValor] = useState(inicial);
    return React.createElement(SunmiCampoCantidad, {
      ...BASE,
      valor,
      minimoComoGuia: prendida,
      onCambiar: (s) => {
        recibido.push(s);
        setValor(s);
      },
    });
  }
  const lugar = document.createElement("div");
  document.body.replaceChildren(lugar);
  raiz = createRoot(lugar);
  await act(async () => raiz.render(React.createElement(Consumidor)));
  const campo = document.querySelector("input");
  return {
    campo,
    recibido,
    mas: document.querySelector('button[aria-label^="Sumar"]'),
  };
}

async function enfocar(campo) {
  await act(async () => {
    campo.focus();
    await esperar(5); // la segunda selección, la de después del toque
  });
}

/** Lo que dejó el teclado en el campo, y el `input` que escucha React. */
async function teclado(campo, texto) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(campo, texto);
    campo.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

// ── APAGADA: TODO IGUAL QUE HOY ───────────────────────────────────────────

test("apagada, el HTML es el de antes, en 0 y con 9", () => {
  const pintar = (valor) => renderToStaticMarkup(React.createElement(SunmiCampoCantidad, { ...BASE, valor, onCambiar: () => {} }));
  assert.equal(pintar("0"), CONGELADO.enCero, "apagada, el campo en 0 cambió");
  assert.equal(pintar("9"), CONGELADO.conNueve, "apagada, el campo con 9 cambió");
});

test("apagada, escribir atrás de lo que había suma, como siempre", async () => {
  const { campo, recibido } = await montar({ inicial: "9", prendida: false });
  await enfocar(campo);
  await teclado(campo, "91");
  assert.equal(recibido.at(-1), "91");
});

// ── PRENDIDA ──────────────────────────────────────────────────────────────

test("en el mínimo el valor está vacío y el 0 es placeholder", async () => {
  const { campo } = await montar({ inicial: "0", prendida: true });
  assert.equal(campo.value, "", "el 0 quedó como valor del campo");
  assert.equal(campo.getAttribute("placeholder"), "0", "falta el 0 de guía");
  // Y la clase del campo es la de siempre: el placeholder sale suave por el
  // `::placeholder` de `sunmi-input`.
  assert.match(campo.className, /sunmi-input/);
});

test("en 0, escribir 5 da 5: ni 05 ni 50", async () => {
  const { campo, recibido } = await montar({ inicial: "0", prendida: true });
  await enfocar(campo);
  assert.equal(campo.value, "", "al tocarlo quedó un 0 adentro");
  await teclado(campo, "5");
  assert.equal(recibido.at(-1), "5");
  assert.equal(campo.value, "5");
});

test("con 9, enfocar selecciona el número entero", async () => {
  const { campo } = await montar({ inicial: "9", prendida: true });
  await enfocar(campo);
  assert.equal(campo.selectionStart, 0, "la selección no arranca al principio");
  assert.equal(campo.selectionEnd, 1, "la selección no llega al final");
});

test("con 9, escribir 1 da 1 —con la selección que anduvo y con la que se perdió—", async () => {
  // La selección anduvo: el teclado reemplazó y queda "1".
  let m = await montar({ inicial: "9", prendida: true });
  await enfocar(m.campo);
  await teclado(m.campo, "1");
  assert.equal(m.recibido.at(-1), "1");
  await act(async () => raiz.unmount());
  raiz = null;

  // La selección se perdió: el teclado escribió atrás, "91". Queda "1" igual.
  m = await montar({ inicial: "9", prendida: true });
  await enfocar(m.campo);
  await teclado(m.campo, "91");
  assert.equal(m.recibido.at(-1), "1", "con la selección perdida, escribir 1 dio 91");
});

test("solo la PRIMERA tecla reemplaza: después se escribe normal", async () => {
  const { campo, recibido } = await montar({ inicial: "9", prendida: true });
  await enfocar(campo);
  await teclado(campo, "91"); // reemplaza → "1"
  await teclado(campo, "12"); // segunda tecla: se suma
  assert.equal(recibido.at(-1), "12");
});

test("borrar y escribir también funciona", async () => {
  const { campo, recibido } = await montar({ inicial: "9", prendida: true });
  await enfocar(campo);
  await teclado(campo, "");
  assert.equal(recibido.at(-1), "", "borrar no llegó como vacío");
  await teclado(campo, "7");
  assert.equal(recibido.at(-1), "7");
});

test("el + desde 0 lleva a 1, y el 1 es un número, no la guía", async () => {
  const { campo, recibido, mas } = await montar({ inicial: "0", prendida: true });
  await act(async () => mas.click());
  assert.equal(recibido.at(-1), "1");
  assert.equal(campo.value, "1", "el 1 tiene que ser el valor del campo");
});
