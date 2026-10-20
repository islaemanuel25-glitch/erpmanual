// EL STOCK CON DESGLOSE Y LOS NOMBRES LARGOS EN LA TARJETA, EN UN DOM.
//
//   node --import ./scripts/alias-loader.mjs --test components/stock_locales/tarjetaStockDesglose.dom.test.mjs
//
// Lo que vio Emanuel en el depósito: "9 DE ORO CLASICAS", Pack x24, con el
// STOCK "-3 bultos + -8 uds" cortado contra el borde derecho de la tarjeta. La
// tanda anterior dejaba que el navegador eligiera dónde cortar y no alcanzó. La
// decisión ahora no depende de medir: los bultos en un renglón, las sueltas en
// el siguiente, sin "+", cada uno en su propio elemento.
//
// ── LA CUENTA DEL ANCHO, A 360 PX ─────────────────────────────────────────
//
// Con `1rem = 14px` (app/globals.css):
//   · la pantalla del control deja 360 − 2 × 16 (px-4) = 328 px;
//   · la tarjeta del kit, 328 − 2 × 13 (px-[13px]) = 302 px;
//   · el recuadro de STOCK mide `--sunmi-product-value-width` = 202 px, y su
//     padding es px-2.5 = 0,625rem = 8,75 px de cada lado: 202 − 17,5 = 184,5 px
//     para el renglón;
//   · el renglón más largo que se admite, "-9999 bultos", son 12 caracteres a
//     25 px (`--sunmi-product-value-number-font-size`). Tomando 0,6 em para cada
//     uno —es lo que mide un dígito tabular, y las letras de "bultos" miden
//     menos—, son 12 × 0,6 × 25 = 180 px < 184,5 px. Entra.
// Y si un caso futuro no entrara, `min-w-0` en el recuadro y `break-words` en
// el número lo parten adentro en vez de dejarlo salir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const clave of ["window", "document", "HTMLElement", "Node", "Event", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: TarjetaStockMovil } = await import("@/components/stock_locales/TarjetaStockMovil.jsx");
const { default: TarjetaConteo } = await import("@/components/stock_locales/control/TarjetaConteo.jsx");

// La forma real de un producto del depósito: la del listado de Stock, escrita por
// scripts/pruebas-db/controlStock.mjs. Se le cambia el pack, el stock y el nombre.
const real = JSON.parse(readFileSync("components/stock_locales/control/lecturaReal.fixture.json", "utf8"));
const delDeposito = (cambios) => ({ ...real.listaDeposito.items[0], factorPack: 24, ...cambios });

async function dibujar(componente, props) {
  const raiz = document.createElement("div");
  document.body.replaceChildren(raiz);
  const root = createRoot(raiz);
  await act(async () => root.render(React.createElement(componente, props)));
  return { raiz, root };
}

const numero = (raiz) => raiz.querySelector("[data-cara-importe]");
const recuadro = (raiz) => raiz.querySelector("[data-cara-precio]");
const renglones = (raiz) => [...raiz.querySelectorAll("[data-renglon-stock]")].map((r) => r.textContent);
const clases = (el) => el.className.split(/\s+/);

const CASOS = [
  { titulo: "-3 bultos + -8 uds (el 9 DE ORO de Emanuel)", stock: -3 * 24 - 8, esperado: ["-3 bultos", "-8 uds"] },
  { titulo: "-9999 bultos + -23 uds, el más largo que se admite", stock: -9999 * 24 - 23, esperado: ["-9999 bultos", "-23 uds"] },
  { titulo: "solo bultos", stock: 3 * 24, esperado: ["3 bultos"] },
  { titulo: "solo sueltas", stock: -8, esperado: ["-8 uds"] },
];

for (const caso of CASOS) {
  test(`STOCK en el depósito, ${caso.titulo}: un renglón por parte, sin "+", y el recuadro no desborda`, async () => {
    const { raiz, root } = await dibujar(TarjetaStockMovil, { item: delDeposito({ stock: caso.stock }), localEsDeposito: true });
    assert.deepEqual(renglones(raiz), caso.esperado, "cada parte en su propio elemento");
    for (const r of raiz.querySelectorAll("[data-renglon-stock]")) assert.ok(clases(r).includes("block"), "cada una en su renglón");
    assert.doesNotMatch(numero(raiz).textContent, /\+/, "sin el + en el medio");
    assert.ok(clases(recuadro(raiz)).includes("min-w-0"), "el recuadro tiene min-width 0");
    assert.ok(clases(numero(raiz)).includes("break-words"), "los renglones rompen palabra si hiciera falta");
    assert.ok(!clases(numero(raiz)).includes("whitespace-nowrap"), "el número no se fuerza a un renglón");
    assert.doesNotMatch(numero(raiz).className, /truncate|text-ellipsis|line-clamp/, "nunca puntos suspensivos");
    for (const r of caso.esperado) assert.ok(r.length <= "-9999 bultos".length, `"${r}" no pasa del renglón más largo de la cuenta`);
    await act(async () => root.unmount());
  });
}

test("en el control, debajo del desglose sigue '= −80 un'", async () => {
  const { raiz, root } = await dibujar(TarjetaConteo, { item: delDeposito({ stock: -80 }), esDeposito: true, onGuardar: async () => true });
  assert.deepEqual(renglones(raiz), ["-3 bultos", "-8 uds"]);
  assert.match(recuadro(raiz).textContent, /= −80 un$/);
  await act(async () => root.unmount());
});

test("donde no hay desglose, el número es el de siempre: un renglón, sin cambios", async () => {
  const { raiz, root } = await dibujar(TarjetaStockMovil, { item: { ...real.listaContados.items.find((i) => i.nombre === "Coca 2L") }, localEsDeposito: false });
  assert.deepEqual(renglones(raiz), []);
  assert.ok(clases(numero(raiz)).includes("whitespace-nowrap"));
  assert.equal(numero(raiz).textContent, "2 uds");
  await act(async () => root.unmount());
});

test("un nombre de 60 caracteres baja de renglón entero, sin cortarse", async () => {
  const nombre = "GALLETITAS DULCES RELLENAS SABOR VAINILLA PAQUETE FAMILIAR 9";
  assert.equal(nombre.length, 60);
  const { raiz, root } = await dibujar(TarjetaStockMovil, { item: delDeposito({ nombre, stock: -80 }), localEsDeposito: true });
  const elNombre = [...raiz.querySelectorAll("[data-ancla], div")].find((d) => d.textContent === nombre);
  assert.ok(elNombre, "el nombre está entero");
  assert.ok(clases(elNombre).includes("[overflow-wrap:anywhere]"), "rompe donde haga falta");
  assert.doesNotMatch(elNombre.className, /truncate|text-ellipsis|line-clamp|whitespace-nowrap/, "sin cortarse ni puntos suspensivos");
  // La fila del valor: la marca y el recuadro, los dos con min-width 0, así el
  // nombre o la marca no empujan el STOCK fuera de la tarjeta.
  const fila = recuadro(raiz).parentElement;
  assert.ok([...fila.children].every((hijo) => clases(hijo).includes("min-w-0")), "las dos columnas con min-w-0");
  await act(async () => root.unmount());
});
