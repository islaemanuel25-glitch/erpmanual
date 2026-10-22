// `formaDelCelular` DEL PAGINADOR: APAGADA, LO DE SIEMPRE; PRENDIDA, LA
// DISPOSICIÓN DEL CELULAR EN TODOS LOS ANCHOS.
//
//   node --import ./scripts/alias-loader.mjs --test components/sunmi/SunmiPaginador.formaDelCelular.test.mjs
//
// La opción entró el 2026-10-22 para la computadora de Pedidos. Tiene que
// estar APAGADA por defecto y, apagada, no mover nada: los otros paginadores
// de escritorio siguen iguales. `SunmiPaginador.formaDelCelular.foto.json`
// tiene el HTML que dibujaba el paginador ANTES de la opción, en tres casos,
// sacado con ESCRIBIR_FOTO_PAGINADOR=1 contra el kit de e0d17ef. Hoy se
// compara carácter por carácter.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { default: SunmiPaginador } = await import("@/components/sunmi/SunmiPaginador.jsx");

const RUTA_FOTO = "components/sunmi/SunmiPaginador.formaDelCelular.foto.json";
const ESCRIBIR = process.env.ESCRIBIR_FOTO_PAGINADOR === "1";
const nada = () => {};

const CASOS = {
  "primera de 44, con todo": { page: 1, pageSize: 50, totalPages: 44, totalItems: 2156, onNext: nada, onPrev: nada, onGoToPage: nada, onPageSizeChange: nada },
  "del medio, sin elegidor": { page: 7, pageSize: 25, totalPages: 95, totalItems: 2361, onNext: nada, onPrev: nada, onGoToPage: nada },
  "sin resultados": { page: 1, pageSize: 25, totalPages: 1, totalItems: 0, onNext: nada, onPrev: nada },
};

const dibujar = (props) => renderToStaticMarkup(React.createElement(SunmiPaginador, props));
const foto = existsSync(RUTA_FOTO) ? JSON.parse(readFileSync(RUTA_FOTO, "utf8")) : {};

for (const [nombre, props] of Object.entries(CASOS)) {
  test(`apagada por defecto, dibuja lo mismo que antes de la opción: ${nombre}`, () => {
    const ahora = dibujar(props);
    if (ESCRIBIR) {
      foto[nombre] = ahora;
      writeFileSync(RUTA_FOTO, `${JSON.stringify(foto, null, 2)}\n`);
      return;
    }
    assert.ok(foto[nombre], `falta la foto de "${nombre}"`);
    assert.ok(ahora === foto[nombre], `el paginador de siempre cambió en "${nombre}"`);
  });
}

test("la foto retrata un paginador, con sus dos disposiciones", () => {
  if (ESCRIBIR) return;
  const f = foto["primera de 44, con todo"];
  assert.match(f, /data-paginador="celular"/);
  assert.match(f, /hidden md:flex/);
  assert.match(f, /Página <!-- -->1<!-- --> de <!-- -->44|Página 1 de 44/);
});

test("prendida: la disposición del celular en una fila, con viendo al lado, y sin la de escritorio", () => {
  if (ESCRIBIR) return;
  const html = dibujar({ ...CASOS["primera de 44, con todo"], formaDelCelular: true });
  assert.doesNotMatch(html, /hidden md:flex/, "se dibujó también la de escritorio");
  assert.doesNotMatch(html, /md:hidden/, "la compacta sigue escondiéndose desde md");
  assert.doesNotMatch(html, /« Anterior|\(2156 items\)/, "quedaron textos de la de escritorio");
  assert.match(html, /data-paginador="compacto"/);
  assert.match(html, /aria-label="Página anterior"/);
  assert.match(html, /aria-label="Página siguiente"/);
  assert.match(html.replace(/<!-- -->/g, ""), /Página 1 de 44/);
  assert.match(html, /viendo 1–50 de 2156/);
  // En una fila: el contenedor es flex y el renglón de "viendo" no lleva el
  // margen de arriba que lo separa debajo en el celular.
  assert.match(html, /data-paginador="compacto" class="flex items-center gap-4 px-1 py-2"/);
  assert.doesNotMatch(html, /mt-1\.5/);
  // "viendo" en el texto suave.
  assert.match(html, /class="text-sm2 sunmi-text-muted[^"]*">viendo/);
});
