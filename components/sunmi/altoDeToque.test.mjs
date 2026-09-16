// LO QUE SE TOCA CON EL PULGAR MIDE 44.
//
// ── POR QUÉ ESTE CANDADO MIRA EL FUENTE Y NO UN RENDER ─────────────────────
//
// Porque lo que hay que defender son dos cosas a la vez, y la segunda no se ve
// en una foto de la pantalla nueva:
//
//   1. Que el chip del filtro y el disparador del select PUEDAN llegar a 44.
//   2. Que las 39 pantallas que ya usan el select NO SE MUEVAN ni un píxel.
//
// La segunda es la que importa: subir el alto para todos habría sido una línea, y
// habría movido pantallas que desde esta tanda no se pueden comprobar. La pieza
// CEDE en vez de imponer, así que quien no pide nada queda exactamente como está.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { declaraAltoMinimo } from "@/lib/sunmi/claseNegociada";

const DIR = import.meta.dirname;
const sinComentarios = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

test("el chip del filtro declara el alto de toque", () => {
  // Un candado que busca texto encuentra los comentarios: se sacan antes.
  const fuente = sinComentarios(fs.readFileSync(path.join(DIR, "SunmiChipsFiltro.jsx"), "utf8"));
  assert.match(
    fuente,
    /className="[^"]*min-h-toque/,
    "los chips son lo que más se toca de una pantalla de filtros y medían 36 px"
  );
});

test("el disparador del select CEDE su alto en vez de imponerlo", () => {
  const fuente = sinComentarios(fs.readFileSync(path.join(DIR, "SunmiSelectAdv.jsx"), "utf8"));
  assert.match(fuente, /declaraAltoMinimo\(className\)/, "el alto tiene que negociarse, no fijarse");

  // CONTRAPRUEBA DE LA SEGUNDA MITAD: sin `min-h-`, la pieza tiene que seguir
  // emitiendo su `py-1.5`. Si algún día alguien "simplifica" esto poniendo el
  // alto siempre, las 39 pantallas se mueven y nadie se entera hasta abrirlas.
  assert.match(fuente, /declaraAltoMinimo\(className\) \? "" : "py-1\.5"/);
  assert.match(fuente, /declaraAltoMinimo\(className\) \? " flex" : ""/);
});

test("la regla de cuándo cede es la misma que ya usa el botón", () => {
  // No es una regla nueva escrita al lado: es la que decide si `SunmiButton` pone
  // su alto. Dos predicados para la misma pregunta se separan el día que uno
  // acepte `h-11` y el otro no.
  assert.equal(declaraAltoMinimo("min-h-toque"), true);
  assert.equal(declaraAltoMinimo("w-full text-sm2"), false);
  assert.equal(declaraAltoMinimo(""), false);
});

test("las pantallas nuevas de listas piden el alto de toque", () => {
  // CONTRAPRUEBA MEDIDA: sin el `min-h-toque`, el selector de proveedor de la
  // pantalla de subir mide 32 px en un teléfono. Con él, 44 — medido en el
  // navegador, no deducido.
  const pantalla = sinComentarios(
    fs.readFileSync(path.join(DIR, "../../app/modulos/proveedores/listas/nueva/page.jsx"), "utf8")
  );
  const select = pantalla.slice(pantalla.indexOf("SunmiSelectAdv"), pantalla.indexOf("</SunmiSelectAdv>"));
  assert.match(select, /min-h-toque/, "el selector de proveedor se toca con el pulgar");
});
