// CANDADO: LA GRILLA MÓVIL DEL PANEL DE HERRAMIENTAS.
//
//   node --import ./scripts/alias-loader.mjs --test lib/menu/grillaSubmenu.test.mjs
//
// Abajo de `md`, el panel que abre un módulo (`SubmenuPanel`) pone tres
// herramientas por fila y doce por página. Antes ponía cuatro y las de los
// costados quedaban cortadas contra el borde del celular. Con más de doce hay
// carrusel con puntitos; con doce o menos, una sola página sin puntitos.
//
// El alto igual en todas las páginas no lo da un número: lo da la estructura.
// Las páginas son hermanas en la misma pista flex —se estiran a la más alta, la
// primera, que siempre está llena— y cada una se reparte en cuatro filas
// iguales. Por eso se afirma la estructura en la fuente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLUMNAS_MOVIL,
  FILAS_MOVIL,
  POR_PAGINA_MOVIL,
  paginarHerramientas,
  llevaPuntitos,
} from "@/lib/menu/grillaSubmenu";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const panel = sinComentarios(readFileSync("components/layout/SubmenuPanel.jsx", "utf8"));
const grilla = panel.slice(panel.indexOf("function GrillaMovil"), panel.indexOf("export default function SubmenuPanel"));

const herramientas = (n) => Array.from({ length: n }, (_, i) => ({ href: `/h/${i}`, label: `H${i}` }));

test("tres columnas y doce por página", () => {
  assert.equal(COLUMNAS_MOVIL, 3);
  assert.equal(FILAS_MOVIL, 4);
  assert.equal(POR_PAGINA_MOVIL, 12);
  // Las clases van literales; tienen que decir lo mismo que las constantes.
  const grillas = grilla.match(/className="grid [^"]*"/g) || [];
  assert.equal(grillas.length, 2, "la grilla móvil tiene dos formas: una página o carrusel");
  for (const g of grillas) {
    assert.match(g, /\bgrid-cols-3\b/, `sin tres columnas: ${g}`);
    assert.doesNotMatch(g, /\b(sm|md|lg):grid-cols-/, `la columna cambia con el ancho: ${g}`);
  }
});

test("las páginas parten en doce, sin cambiar el orden", () => {
  const doce = herramientas(12);
  assert.deepEqual(paginarHerramientas(doce), [doce]);
  const trece = herramientas(13);
  const paginas = paginarHerramientas(trece);
  assert.deepEqual(paginas.map((p) => p.length), [12, 1]);
  assert.deepEqual(paginas.flat(), trece);
  assert.deepEqual(paginarHerramientas(herramientas(25)).map((p) => p.length), [12, 12, 1]);
  assert.deepEqual(paginarHerramientas(herramientas(11)).map((p) => p.length), [11]);
});

test("puntitos solo con más de doce", () => {
  assert.equal(llevaPuntitos(paginarHerramientas(herramientas(2))), false);
  assert.equal(llevaPuntitos(paginarHerramientas(herramientas(12))), false);
  assert.equal(llevaPuntitos(paginarHerramientas(herramientas(13))), true);
  // Y la pantalla decide con esa función, antes de dibujar carrusel o puntitos.
  const corte = grilla.indexOf("if (!llevaPuntitos(paginas))");
  assert.ok(corte > 0, "la grilla dejó de preguntar si lleva puntitos");
  const unaPagina = grilla.slice(corte, grilla.indexOf("const alDesplazar"));
  assert.doesNotMatch(unaPagina, /snap-|rounded-full|sunmi-bg-/, "con una página no hay carrusel ni puntitos");
  assert.match(grilla, /i === paginaVisible \? "sunmi-bg-accent" : "sunmi-bg-borde"/);
});

test("el alto es el mismo en todas las páginas del carrusel", () => {
  const pista = grilla.match(/className="(flex overflow-x-auto[^"]*)"/);
  assert.ok(pista, "las páginas dejaron de ser hermanas en una pista flex");
  // Una alineación en el eje cruzado rompe el estiramiento a la página más alta.
  assert.doesNotMatch(pista[1], /\bitems-(start|center|end)\b|\bh-/, "la pista dejó de estirar las páginas");
  assert.match(pista[1], /\bsnap-x\b/);
  assert.match(pista[1], /\bsnap-mandatory\b/);
  const pagina = grilla.match(/className="(grid grid-cols-3 grid-rows-4[^"]*)"/);
  assert.ok(pagina, "cada página tiene que repartirse en cuatro filas iguales");
  assert.match(pagina[1], /\bw-full\b/);
  assert.match(pagina[1], /\bshrink-0\b/);
  assert.match(pagina[1], /\bsnap-start\b/);
  assert.doesNotMatch(pagina[1], /\bself-(start|center|end)\b|\bh-/, "una página con alto propio cambia el alto al pasar");
  // Y el nombre reserva dos renglones en la celda móvil.
  assert.match(panel, /line-clamp-2 min-h-dosRenglones/);
});

test("la grilla móvil vale solo abajo de md y escritorio conserva sus filas", () => {
  assert.match(panel, /<div className="md:hidden">\s*<GrillaMovil\b/);
  assert.match(panel, /hidden md:block/);
  assert.match(panel, /rows\.map\(/);
});
