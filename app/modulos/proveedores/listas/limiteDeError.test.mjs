// UNA PANTALLA DE LISTAS NUNCA QUEDA NEGRA.
//
// Emanuel, 2026-11-25 (producción en c70d8813): Listas → Arcor (lista del
// 25/11 15:31, 177 listos para aplicar). Al tocar un botón de la tarjeta la
// página cayó entera con "Application error: a client-side exception has
// occurred".
//
// Lo que estos candados fijan:
//   · cada tarjeta de las tres pantallas —la lista, «Pueden ser», «Sin
//     producto»— va dentro de su límite (`LimiteDelRenglon`): una que no se
//     puede dibujar deja un aviso con el mensaje, y las otras siguen;
//   · el segmento tiene su límite (`error.jsx`), y si el error es el código de
//     la pantalla que no llegó por un despliegue en el medio, ofrece RECARGAR.
//
// El límite se monta en un DOM de verdad (jsdom): un límite de error no
// funciona con `renderToStaticMarkup`, que tira el error en vez de atajarlo.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const clave of ["window", "document", "HTMLElement", "Node", "navigator"]) {
  Object.defineProperty(globalThis, clave, { value: clave === "window" ? dom.window : dom.window[clave], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: LimiteDelRenglon, textoDelRenglonQueNoSeDibuja } = await import(
  "@/components/proveedores/listas/LimiteDelRenglon.jsx"
);
const { esVersionVieja, textoDelErrorDePantalla } = await import("@/lib/proveedores/listas/errorDePantalla.js");

const sinComentarios = (ruta) =>
  readFileSync(new URL(`../../../../${ruta}`, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

/** Una tarjeta que no se puede dibujar: lo que hacía caer la pantalla entera. */
function TarjetaQueSeCae() {
  throw new TypeError("Cannot read properties of null (reading 'precio')");
}
const Tarjeta = ({ nombre }) => React.createElement("p", { "data-tarjeta": nombre }, nombre);

async function montar(hijos) {
  const raiz = document.createElement("div");
  document.body.appendChild(raiz);
  const root = createRoot(raiz, { onUncaughtError: () => {}, onCaughtError: () => {} });
  const consola = console.error;
  console.error = () => {};
  let error = null;
  try {
    await act(async () => root.render(React.createElement(React.Fragment, null, ...hijos)));
  } catch (e) {
    error = e;
  } finally {
    console.error = consola;
  }
  return { raiz, error };
}

test("SIN LÍMITE, UNA TARJETA QUE SE CAE SE LLEVA LA LISTA ENTERA (lo que pasaba)", async () => {
  const { raiz, error } = await montar([
    React.createElement(Tarjeta, { key: 1, nombre: "BON O BON" }),
    React.createElement(TarjetaQueSeCae, { key: 2 }),
    React.createElement(Tarjeta, { key: 3, nombre: "MOGUL" }),
  ]);
  assert.equal(raiz.querySelectorAll("[data-tarjeta]").length, 0, "no queda ninguna: la pantalla negra");
  assert.match(String(error?.message), /reading 'precio'/, "el error sube hasta arriba");
});

test("CON EL LÍMITE, LA QUE SE CAE DEJA UN AVISO CON EL MENSAJE Y LAS OTRAS SIGUEN", async () => {
  const { raiz, error } = await montar(
    [["BON O BON", Tarjeta], ["ALFAJOR RARO", TarjetaQueSeCae], ["MOGUL", Tarjeta]].map(([nombre, C], i) =>
      React.createElement(LimiteDelRenglon, { key: i, nombre }, React.createElement(C, { nombre }))
    )
  );
  assert.equal(error, null, "nada sube");
  const visibles = [...raiz.querySelectorAll("[data-tarjeta]")].map((p) => p.textContent);
  assert.deepEqual(visibles, ["BON O BON", "MOGUL"]);
  assert.ok(raiz.textContent.includes(textoDelRenglonQueNoSeDibuja("ALFAJOR RARO")));
  assert.ok(raiz.textContent.includes("Cannot read properties of null (reading 'precio')"), "el mensaje a la vista");
});

test("LAS TRES PANTALLAS ENVUELVEN CADA TARJETA EN SU LÍMITE", () => {
  const lista = sinComentarios("app/modulos/proveedores/listas/[id]/page.jsx");
  assert.match(lista, /import LimiteDelRenglon from "@\/components\/proveedores\/listas\/LimiteDelRenglon";/);
  // La de «Tus productos», la de los confirmados y la de los por confirmar.
  const envueltas = [...lista.matchAll(/<LimiteDelRenglon key=\{item\.productoBaseId\} nombre=\{item\.nombre\}>\s*<(Tarjeta\w+)/g)].map((m) => m[1]);
  assert.deepEqual(envueltas.sort(), ["TarjetaPorConfirmar", "TarjetaProductoDeLaLista", "TarjetaProductoDeLaLista"]);
  // Ninguna tarjeta suelta fuera de un límite.
  assert.equal([...lista.matchAll(/<TarjetaProductoDeLaLista\b/g)].length, 2);
  assert.equal([...lista.matchAll(/<TarjetaPorConfirmar\b/g)].length, 1);

  const sinProducto = sinComentarios("app/modulos/proveedores/listas/[id]/sin-producto/page.jsx");
  assert.match(sinProducto, /<LimiteDelRenglon key=\{f\.id\}[^>]*>\s*<TarjetaDelRenglon/);
  // La conversión del renglón va ADENTRO del límite: un error del padre no lo
  // ataja el límite de un hijo.
  assert.match(sinProducto, /function TarjetaDelRenglon\(\{ f, guardando, onCorregir \}\) \{\s*return <TarjetaLineaFactura fila=\{filaParaLaTarjetaDeRecepcion\(f\)\}/);
  assert.equal([...sinProducto.matchAll(/filaParaLaTarjetaDeRecepcion\(/g)].length, 1);
});

test("EL SEGMENTO TIENE SU LÍMITE, Y CON UN DESPLIEGUE EN EL MEDIO OFRECE RECARGAR", () => {
  const limite = sinComentarios("app/modulos/proveedores/listas/error.jsx");
  assert.match(limite, /^"use client";/);
  assert.match(limite, /export default function ListasError\(\{ error, reset \}\)/);
  assert.match(limite, /texto\.accion === "RECARGAR" \? window\.location\.reload\(\) : reset\(\)/);
  // Las formas con que Next avisa que el código de la pantalla no llegó: la de
  // webpack y la de Turbopack.
  const webpack = Object.assign(new Error("Loading chunk 8121 failed.\n(error: https://operix.cloud/_next/static/chunks/8121-4e2a.js)"), { name: "ChunkLoadError" });
  const turbopack = new Error("Failed to load chunk /_next/static/chunks/app_modulos_proveedores_listas_%5Bid%5D_page_4e2a.js from module 1234");
  for (const e of [webpack, turbopack]) {
    assert.equal(esVersionVieja(e), true, e.message);
    assert.equal(textoDelErrorDePantalla(e).accion, "RECARGAR");
  }
  // Cualquier otro error: Reintentar, con el mensaje para encontrar el dato.
  const otro = new TypeError("Cannot read properties of undefined (reading 'map')");
  assert.equal(esVersionVieja(otro), false);
  assert.deepEqual(textoDelErrorDePantalla(otro), {
    titulo: "No se pudo mostrar esta pantalla de la lista. No se cambió ningún precio.",
    detalle: "Cannot read properties of undefined (reading 'map')",
    accion: "REINTENTAR",
  });
});
