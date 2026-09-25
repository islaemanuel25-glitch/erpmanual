// LA HOJA DE CONFIRMACIÓN DEL KIT.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiHojaDeConfirmacion.test.mjs
//
// Salió de `HojaConfirmarAplicar` tal cual, cuando la semana operativa necesitó la
// misma hoja. Lo que se sostiene acá es lo que las dos pantallas heredan de ella.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import SunmiHojaDeConfirmacion from "./SunmiHojaDeConfirmacion.jsx";

const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const dibujar = (props = {}) =>
  renderToStaticMarkup(
    React.createElement(SunmiHojaDeConfirmacion, {
      titulo: "¿Cambiar la semana?",
      puntos: ["Uno.", "Dos."],
      textoConfirmar: "Confirmar cambio",
      textoTrabajando: "Guardando…",
      onConfirmar() {},
      onVolver() {},
      ...props,
    })
  );

test("dibuja cada renglón y los dos botones del alto táctil", () => {
  const html = dibujar();
  assert.ok(html.includes("Uno.") && html.includes("Dos."), "faltan renglones");
  const botones = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)].filter((m) =>
    /Confirmar cambio|Volver/.test(m[2])
  );
  assert.equal(botones.length, 2);
  for (const b of botones) assert.ok(b[1].split(/\s+/).includes("min-h-toque"), `mide menos de 44: ${b[2]}`);
});

test("trabajando: el botón lo dice y los dos se apagan", () => {
  const html = dibujar({ trabajando: true });
  assert.ok(html.includes("Guardando…"));
  const apagados = [...html.matchAll(/<button[^>]*disabled=""[^>]*>/g)];
  assert.ok(apagados.length >= 2, "un botón quedó encendido mientras escribe");
});

test("NO declara `destructivo`: no hay nada escrito que perder al tocar el velo", () => {
  const fuente = sinComentarios(readFileSync("components/sunmi/SunmiHojaDeConfirmacion.jsx", "utf8"));
  assert.doesNotMatch(fuente, /\bdestructivo\b/);
});

test("HojaConfirmarAplicar dibuja con esta pieza y no con un modal propio", () => {
  const fuente = sinComentarios(readFileSync("components/proveedores/listas/HojaConfirmarAplicar.jsx", "utf8"));
  assert.match(fuente, /<SunmiHojaDeConfirmacion\b/);
  assert.doesNotMatch(fuente, /SunmiModalLayout/);
});
