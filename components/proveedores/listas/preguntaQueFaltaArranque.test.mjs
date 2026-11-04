// CON QUÉ ARRANCA EL CAMPO DE LA PREGUNTA, Y QUE ARRANQUE DE NUEVO SI LA
// PREGUNTA CAMBIA (Emanuel, 2026-11-04, casos reales de DYSSA).
//
//   node --import ./scripts/alias-loader.mjs --test components/proveedores/listas/preguntaQueFaltaArranque.test.mjs
//
// - DR LEMON 473 x6 POMELO, caja de 24, renglón "DR. LEMON VODKA POMELO 5%
//   473MLX6X4": el campo de "¿De cuántas unidades es el precio de la lista?"
//   vino con 24 y tenía que venir con 6.
// - DR LEMON LIMON 1L X CAJA, caja de 12: vino con 12, sin ningún pack en el
//   nombre que entre en la caja. Tenía que venir vacío.
//
// La caja entera nunca sirve —es la opción "precio de la CAJA entera" y «Listo»
// no la acepta—. Y la pieza tomaba su valor inicial UNA vez: si la misma
// tarjeta cambiaba de pregunta, el campo se quedaba con el número de antes.
// Por eso acá se monta en un DOM y se le cambian las props al mismo
// componente: con `renderToStaticMarkup` ese defecto no se ve.

import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const clave of ["window", "document", "HTMLElement", "Node", "Event", "MouseEvent"]) {
  Object.defineProperty(globalThis, clave, {
    value: clave === "window" ? dom.window : dom.window[clave],
    configurable: true,
    writable: true,
  });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: PreguntaQueFalta, textoInicialDeLaRespuesta } = await import(
  "@/components/proveedores/listas/PreguntaQueFalta"
);
const { respuestaSugerida } = await import("@/lib/proveedores/listas/cajaRecordada");

let raices = [];
afterEach(async () => {
  for (const r of raices) await act(async () => r.unmount());
  raices = [];
  document.body.innerHTML = "";
});

/** Monta la pieza y devuelve con qué volver a dibujarla y qué dice el campo. */
async function montar(props) {
  const lugar = document.createElement("div");
  document.body.appendChild(lugar);
  const raiz = createRoot(lugar);
  raices.push(raiz);
  const dibujar = (p) => act(async () => raiz.render(React.createElement(PreguntaQueFalta, { id: "p", ...p })));
  await dibujar(props);
  return { dibujar, campo: () => lugar.querySelector("input").value };
}

const POMELO = { renglon: "DR. LEMON VODKA POMELO 5% 473MLX6X4", nombre: "DR LEMON 473 x6 POMELO", caja: 24 };
const LIMON = { nombre: "DR LEMON LIMON 1L X CAJA", caja: 12 };

test("POMELO, CAJA DE 24: «473MLX6X4» PRECARGA 6, Y LA CAJA ENTERA NO SE PRECARGA NUNCA", async () => {
  const sugerido = respuestaSugerida({ textos: [POMELO.renglon, POMELO.nombre], caja: POMELO.caja });
  assert.equal(sugerido, 6);
  const { campo } = await montar({ porKilo: false, cajaDelCatalogo: POMELO.caja, sugerido });
  assert.equal(campo(), "6");
  // Aunque llegue la caja como sugerido, el campo queda vacío: «Listo» no la acepta.
  assert.equal(textoInicialDeLaRespuesta(24, false, 24), "");
  const conLaCaja = await montar({ porKilo: false, cajaDelCatalogo: POMELO.caja, sugerido: 24 });
  assert.equal(conLaCaja.campo(), "", "el campo se precargó con la caja del producto");
});

test("LIMÓN 1L, CAJA DE 12, SIN PACK VÁLIDO EN EL NOMBRE: EL CAMPO QUEDA VACÍO", async () => {
  const sugerido = respuestaSugerida({ textos: [LIMON.nombre], caja: LIMON.caja });
  assert.equal(sugerido, null);
  assert.equal((await montar({ porKilo: false, cajaDelCatalogo: LIMON.caja, sugerido })).campo(), "");
  assert.equal(
    (await montar({ porKilo: false, cajaDelCatalogo: LIMON.caja, sugerido: 12 })).campo(),
    "",
    "el campo se precargó con la caja de 12"
  );
});

test("SI LA MISMA TARJETA CAMBIA DE PREGUNTA, EL CAMPO NO SE QUEDA CON EL NÚMERO DE ANTES", async () => {
  // Primero la pregunta vieja, sin caja en el catálogo: "¿Cuántas trae la caja?" con 24.
  const t = await montar({ porKilo: false, cajaDelCatalogo: null, sugerido: 24 });
  assert.equal(t.campo(), "24");
  // Ahora la misma pieza recibe la pregunta del pack con caja de 24: arranca en 6.
  await t.dibujar({ porKilo: false, cajaDelCatalogo: 24, sugerido: 6 });
  assert.equal(t.campo(), "6", "se quedó con el número de la pregunta anterior");
  // Y con caja de 12 sin pack sugerido: vacío, no el 6 de antes.
  await t.dibujar({ porKilo: false, cajaDelCatalogo: 12, sugerido: null });
  assert.equal(t.campo(), "");
});

test("LO QUE LA PERSONA ESCRIBIÓ SOBRE LA MISMA PREGUNTA NO SE PISA AL REDIBUJAR", async () => {
  const lugar = document.createElement("div");
  document.body.appendChild(lugar);
  const raiz = createRoot(lugar);
  raices.push(raiz);
  const props = { id: "q", porKilo: false, cajaDelCatalogo: 24, sugerido: 6 };
  await act(async () => raiz.render(React.createElement(PreguntaQueFalta, props)));
  const input = lugar.querySelector("input");
  const fijar = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    fijar.call(input, "4");
    input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.equal(input.value, "4");
  // Un refresco de la lista trae la MISMA pregunta: lo escrito queda.
  await act(async () => raiz.render(React.createElement(PreguntaQueFalta, { ...props, trabajando: false })));
  assert.equal(lugar.querySelector("input").value, "4");
});
