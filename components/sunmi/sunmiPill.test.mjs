// LOS COLORES DE LA PÍLDORA SON UN CONTRATO CON TRES PANTALLAS.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/sunmiPill.test.mjs
//
// ── POR QUÉ ESTE CANDADO NACE AHORA ──────────────────────────────────────
//
// La lista de ofertas necesitaba verde y `SunmiPill` tenía tres colores. Se
// agregó uno, que es lo que corresponde cuando una pantalla necesita algo que el
// kit no tiene — pero tocar una pieza compartida por el catálogo, stock y media
// aplicación no se hace a ojo.
//
// Lo que se afirma es que el agregado fue ADITIVO: que los tres de antes siguen
// dando exactamente la misma clase. Un mapa es una línea de código y cambiar un
// valor por error no rompe nada visible en el archivo que se está editando: se
// ve en otra pantalla, semanas después.
//
// Y que ninguno escriba un color: todos salen de clases del kit, que a su vez
// salen de tokens definidos en los catorce temas.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import SunmiPill from "@/components/sunmi/SunmiPill";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const HOJA = fs.readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8");

const clasesDe = (color) =>
  renderToStaticMarkup(createElement(SunmiPill, { color }, "X"))
    .match(/class="([^"]*)"/)[1]
    .split(/\s+/)
    .filter(Boolean);

test("P1 · los tres colores de antes dan la MISMA clase que daban", () => {
  // Si alguno cambia, cambia en el catálogo —"último editado" es ámbar—, en la
  // lista vieja de ofertas y en todas las píldoras de estado del sistema.
  assert.ok(clasesDe("amber").includes("sunmi-badge-accent"));
  assert.ok(clasesDe("cyan").includes("sunmi-pill-link"));
  assert.ok(clasesDe("slate").includes("sunmi-badge-muted"));
});

test("P2 · el verde nuevo usa una clase que YA existía en el kit", () => {
  // No es un color inventado: `.sunmi-badge-success` estaba en la hoja desde
  // antes y sale de `--pos-success`. Si mañana alguien la borra, esto se pone
  // rojo en vez de dejar la píldora sin fondo.
  assert.ok(clasesDe("green").includes("sunmi-badge-success"));
  assert.match(HOJA, /\.sunmi-badge-success\s*\{[^}]*--pos-success/);
});

test("P3 · un color desconocido no deja la píldora sin pintar", () => {
  // Cae al default. Una píldora sin fondo se lee como texto suelto, y el sello
  // de estado dejaría de leerse como un sello.
  assert.ok(clasesDe("fucsia").includes("sunmi-badge-accent"));
  assert.ok(clasesDe(undefined).includes("sunmi-badge-accent"));
});

test("P4 · la píldora no escribe ningún color propio", () => {
  const src = fs
    .readFileSync(path.join(RAIZ, "components/sunmi/SunmiPill.jsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.ok(
    !/#[0-9a-fA-F]{3,8}\b|\b(bg|text)-(red|green|amber|slate|cyan|emerald|yellow)-\d{2,3}/.test(src),
    "entró un color escrito a mano en la píldora"
  );
});
