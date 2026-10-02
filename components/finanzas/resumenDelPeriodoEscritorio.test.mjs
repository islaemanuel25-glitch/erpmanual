// CANDADO: EL ESCRITORIO CONSERVA LA PRESENTACIÓN DE ANTES DE LA TANDA MOBILE.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/resumenDelPeriodoEscritorio.test.mjs
//
// El Figma aprobado es SOLO de celular. Escritorio todavía no tiene diseño y la
// decisión fue que conserve lo que dibujaba en `3feaf1c`. Este candado lo
// afirma de la forma más directa que hay: dibuja `ResumenDelPeriodoEscritorio`
// con cada caso de `casosDelResumen.mjs` y lo compara, carácter por carácter,
// contra el render de la VERSIÓN DE `3feaf1c` con esos mismos casos.
//
// ── DE DÓNDE SALE EL GOLDEN ──────────────────────────────────────────────
//
// `resumenDelPeriodoEscritorio.base.fixture.json` no se escribió a mano: es el
// resultado de dibujar `components/finanzas/ResumenDelPeriodo.jsx` tal como
// estaba en `3feaf1c` (sacado con `git show`) con `renderToStaticMarkup`.
// Lo que protege: que tocar una pieza compartida en `PiezasDelResumen.jsx` para
// el celular no cambie, sin querer, el escritorio. Si escritorio cambia A
// PROPÓSITO —el día que tenga diseño—, se regenera dibujando la versión nueva y
// se dice por qué en el commit; no se ajusta a mano para que pase.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ResumenDelPeriodoEscritorio from "@/components/finanzas/ResumenDelPeriodoEscritorio.jsx";
import { CASOS_DE_ESCRITORIO } from "@/components/finanzas/casosDelResumen.mjs";

const GOLDEN = JSON.parse(
  readFileSync("components/finanzas/resumenDelPeriodoEscritorio.base.fixture.json", "utf8"),
);

test("D0 · el golden es el de la base de la tanda mobile y cubre todos los casos", () => {
  assert.equal(GOLDEN.base, "3feaf1c0ecf8e798cc0a06a4ef9dfcdc43e9790a");
  assert.deepEqual(Object.keys(GOLDEN.casos).sort(), Object.keys(CASOS_DE_ESCRITORIO).sort());
});

for (const [nombre, armar] of Object.entries(CASOS_DE_ESCRITORIO)) {
  test(`D1 · escritorio idéntico a la base · caso "${nombre}"`, () => {
    const html = renderToStaticMarkup(React.createElement(ResumenDelPeriodoEscritorio, armar()));
    if (html !== GOLDEN.casos[nombre]) {
      let i = 0;
      while (i < html.length && html[i] === GOLDEN.casos[nombre][i]) i++;
      assert.fail(
        `el escritorio cambió respecto de 3feaf1c en el caso "${nombre}", carácter ${i}:\n` +
          `  base : …${GOLDEN.casos[nombre].slice(Math.max(0, i - 60), i + 60)}…\n` +
          `  ahora: …${html.slice(Math.max(0, i - 60), i + 60)}…`,
      );
    }
  });
}

test("D2 · lo que distingue al escritorio de antes sigue ahí", () => {
  // Redundante con D1 a propósito: si alguien regenera el golden sin mirar, esto
  // dice en palabras qué se perdería.
  const html = renderToStaticMarkup(React.createElement(ResumenDelPeriodoEscritorio, CASOS_DE_ESCRITORIO.lleno()));
  assert.ok(html.includes("TODAVÍA NO DISPONIBLE"), "escritorio perdió el bloque de lo no disponible");
  assert.ok(html.includes("Costo de la mercadería vendida"), "escritorio tomó el rótulo del celular");
  assert.ok(html.includes("Ventas menos el costo de lo vendido."));
  assert.ok(html.includes("2 ventas en el período"));
  assert.ok(!html.includes("CÓMO SE FORMA"), "escritorio tomó el recorrido del celular");
  assert.ok(!html.includes("sobre ventas"), "escritorio tomó los porcentajes del celular");
});
