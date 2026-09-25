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

// ── EL ANCHO TÁCTIL ────────────────────────────────────────────────────────
//
// Siete cajas VISIBLES de 44 px con su separación no entran en 360 px. El
// contrato no es la caja: es que cada tecla se TOQUE en todo su paso (ancho +
// gap), sin franja muerta. Lo hace un `::after` transparente que se extiende a
// cada lado. Se afirma que existe en cada tecla y que, con la escala de Tailwind
// —0,25 rem por unidad—, las dos extensiones de dos teclas vecinas suman al
// menos el gap. Medido en un navegador a 360 px en la pantalla de semana: 44,00
// px de área táctil con 38,9 de caja visible.
const REM_POR_UNIDAD = 0.25;
const unidades = (clase, prefijo) => {
  const m = clase.match(new RegExp(`^${prefijo}(\\d+(?:\\.\\d+)?)$`));
  return m ? Number(m[1]) * REM_POR_UNIDAD : null;
};

test("cada tecla extiende su área táctil sobre el gap, sin franja muerta", () => {
  const html = renderToStaticMarkup(
    React.createElement(SunmiSelectorDeOpciones, { opciones: DIAS, valor: "3", onCambiar() {}, etiqueta: "Día" })
  );
  const grupo = /<div role="group"[^>]*class="([^"]*)"/.exec(html)[1].split(/\s+/);
  const gap = grupo.map((c) => unidades(c, "gap-")).find((v) => v !== null);
  assert.ok(gap !== undefined && gap !== null, "el grupo ya no declara su gap");

  for (const c of botones(html)) {
    for (const necesaria of ["relative", "after:absolute", "after:inset-y-0"]) {
      assert.ok(c.includes(necesaria), `una tecla perdió ${necesaria}: el área táctil vuelve a ser la caja`);
    }
    const extension = c.map((k) => unidades(k, "after:-inset-x-")).find((v) => v !== null);
    assert.ok(extension != null, "una tecla ya no extiende su área táctil a los costados");
    assert.ok(
      2 * extension >= gap,
      `las extensiones (${extension} rem por lado) no cubren el gap (${gap} rem): queda una franja muerta`
    );
  }
});

test("el token `toque` sigue midiendo 44 px", () => {
  const config = readFileSync("tailwind.config.js", "utf8");
  const valores = [...config.matchAll(/toque:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(valores.length > 0, "el config ya no define `toque`");
  for (const v of valores) assert.equal(v, "44px");
});
