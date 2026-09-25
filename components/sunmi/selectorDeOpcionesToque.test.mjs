// EL SELECTOR DE OPCIONES SE TOCA CON EL DEDO: 44 PX COMO MÍNIMO.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/selectorDeOpcionesToque.test.mjs
//
// La auditoría de la semana operativa midió las teclas en 36 px: heredaban el alto
// mínimo de `SunmiButton` (`sunmi-btn-parte-alto`). Con siete días en una fila,
// cada tecla es además angosta, y un blanco bajo y angosto en un Sunmi es uno que
// se falla. El arreglo vive en la pieza —pide `min-h-toque`—, así que vale para
// las tres pantallas que la usan.
//
// Se afirma sobre lo que la pieza DIBUJA, no sobre su fuente: que cada tecla lleve
// el token, que el botón haya CEDIDO su alto de 36 —si no cediera, ganaría
// cualquiera de los dos según el orden de la hoja— y que el token siga midiendo
// 44 px en el config.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SunmiSelectorDeOpciones from "./SunmiSelectorDeOpciones.jsx";

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((texto, i) => ({ clave: String(i), texto }));

const botones = (html) => [...html.matchAll(/<button[^>]*class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));

test("cada tecla pide el mínimo táctil y el botón le cede su alto de 36 px", () => {
  const html = renderToStaticMarkup(
    React.createElement(SunmiSelectorDeOpciones, { opciones: DIAS, valor: "3", onCambiar() {}, etiqueta: "Día" })
  );
  const clases = botones(html);
  assert.equal(clases.length, 7, "no se dibujaron las siete teclas");
  for (const c of clases) {
    assert.ok(c.includes("min-h-toque"), `una tecla quedó sin el mínimo táctil: ${c.join(" ")}`);
    assert.ok(
      !c.includes("sunmi-btn-parte-alto"),
      "el botón no cedió su alto de 36 px: las dos reglas compiten y gana la hoja"
    );
  }
});

test("el token `toque` sigue midiendo 44 px", () => {
  const config = readFileSync("tailwind.config.js", "utf8");
  const valores = [...config.matchAll(/toque:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(valores.length > 0, "el config ya no define `toque`");
  for (const v of valores) assert.equal(v, "44px");
});
