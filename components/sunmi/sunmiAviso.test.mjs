// CANDADO: EL AVISO COMPACTO, DIBUJADO DE VERDAD.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiAviso.test.mjs
//
// La pieza salió del "Tip" de la portada de Configuración POS para que Cobros
// pudiera usar el mismo bloque. Lo que se cuida acá es que no traiga una paleta
// propia: si alguien le mete un color literal, el aviso deja de seguir el theme
// y las dos pantallas empiezan a verse distinto en los temas claros.

import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import SunmiAviso from "@/components/sunmi/SunmiAviso";

const Icono = (props) => createElement("svg", props);

const dibujar = (props = {}) =>
  renderToStaticMarkup(
    createElement(SunmiAviso, { icon: Icono, titulo: "Tip", ...props }, "El cuerpo del aviso.")
  );

test("dibuja el rótulo, el cuerpo y el icono", () => {
  const html = dibujar();
  assert.ok(html.includes("Tip"));
  assert.ok(html.includes("El cuerpo del aviso."));
  assert.match(html, /<svg/);
});

test("sin icono y sin título sigue dibujando el cuerpo", () => {
  const html = dibujar({ icon: null, titulo: null });
  assert.ok(html.includes("El cuerpo del aviso."));
  assert.equal(html.includes("<svg"), false);
});

test("los colores salen del kit, no de una paleta propia", () => {
  const html = dibujar();
  assert.match(html, /sunmi-btn-accent-soft/);
  assert.match(html, /sunmi-badge-accent/);
  assert.match(html, /sunmi-text-accent/);
  assert.match(html, /sunmi-text-muted/);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/, "un color literal en el aviso");
  assert.doesNotMatch(
    html,
    /(bg|text|border)-(slate|amber|orange|red|green|emerald|gray)-[0-9]/,
    "una clase de color cruda de Tailwind"
  );
});
