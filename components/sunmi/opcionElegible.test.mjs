// LA OPCIÓN TOCABLE DEL KIT, DIBUJADA: CÍRCULO, TÍTULO, SUBTÍTULO Y LOS DOS ESTADOS.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/opcionElegible.test.mjs
//
// Se mira lo que DIBUJA, con el texto real de su único consumidor: la pregunta
// "¿por caja o por unidad?" del alta desde una lista (2026-11-06).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SunmiOpcionElegible, {
  CLASE_CIRCULO_LLENO,
  CLASE_CIRCULO_VACIO,
  CLASE_OPCION_ELEGIDA,
  CLASE_OPCION_NO_ELEGIDA,
} from "./SunmiOpcionElegible.jsx";
import { CLASE_OPCION, CLASE_OPCION_ELEGIDA as ELEGIDA_DE_LISTAS } from "@/components/proveedores/listas/PiezasPantallas";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dibujar = (props) => renderToStaticMarkup(React.createElement(SunmiOpcionElegible, props));
const boton = (html) => html.match(/<button[^>]*>/)?.[0] ?? "";

const CAJA = { titulo: "Por la caja de 10", subtitulo: "Caja $ 3.139,92 · c/u $ 313,99" };

test("no elegida: superficie de tarjeta y borde suave, círculo vacío, aria-checked false", () => {
  const html = dibujar({ ...CAJA, elegida: false });
  const b = boton(html);
  assert.match(b, /role="radio"/);
  assert.match(b, /aria-checked="false"/);
  for (const c of CLASE_OPCION_NO_ELEGIDA.split(" ")) assert.ok(b.includes(c), `falta ${c}`);
  assert.ok(!b.includes(CLASE_OPCION_ELEGIDA));
  assert.match(html, new RegExp(`rounded-full ${CLASE_CIRCULO_VACIO}"`));
  assert.ok(!html.includes(CLASE_CIRCULO_LLENO));
});

test("elegida: fondo de acento suave y borde de acento, círculo lleno, aria-checked true", () => {
  const html = dibujar({ ...CAJA, elegida: true });
  const b = boton(html);
  assert.match(b, /aria-checked="true"/);
  assert.ok(b.includes(CLASE_OPCION_ELEGIDA));
  assert.ok(!b.includes("sunmi-card-surface"));
  assert.match(html, new RegExp(`rounded-full ${CLASE_CIRCULO_LLENO}"`));
});

test("título y subtítulo enteros, sin cortar; el título se parte por palabras y el subtítulo va en un renglón", () => {
  const html = dibujar({ ...CAJA, elegida: false });
  assert.ok(html.includes(">Por la caja de 10<"));
  assert.ok(html.includes(">Caja $ 3.139,92 · c/u $ 313,99<"));
  assert.match(html, /font-semibold sunmi-text-strong break-words">Por la caja de 10</);
  assert.match(html, /sunmi-text-muted tabular-nums whitespace-nowrap">Caja/);
  assert.ok(!/\b(truncate|line-clamp-\d|text-ellipsis)\b/.test(html), "una clase corta el texto");
  // Sin subtítulo, no hay renglón vacío.
  assert.ok(!dibujar({ titulo: "Por unidad", elegida: false }).includes("sunmi-text-muted"));
});

test("no envía formularios, ocupa todo el ancho y tiene el alto táctil", () => {
  const b = boton(dibujar({ ...CAJA, elegida: false }));
  assert.match(b, /type="button"/);
  assert.match(b, /w-full/);
  assert.match(b, /min-h-toque/);
});

test("los dos estados son los mismos de la opción de las listas, no unos parecidos", () => {
  assert.equal(CLASE_OPCION_NO_ELEGIDA, CLASE_OPCION);
  assert.equal(CLASE_OPCION_ELEGIDA, ELEGIDA_DE_LISTAS);
  // Y el color sale de los tokens del tema: nada de colores fijos de Tailwind.
  const fuente = fs.readFileSync(path.join(RAIZ, "components/sunmi/SunmiOpcionElegible.jsx"), "utf8").replace(/\/\/[^\n]*/g, "");
  assert.ok(!/\b(bg|text|border)-(slate|amber|cyan|red|green|gray|zinc|blue)-\d/.test(fuente), "un color fijo");
  assert.ok(!/\[[0-9.]+px\]/.test(fuente), "una medida mágica");
});
