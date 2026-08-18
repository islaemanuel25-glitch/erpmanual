// CANDADOS DE LA ELEVACIÓN DE TARJETA.
//
// `SunmiPanel` nunca dio elevación, y eso no se notó durante meses porque los
// paneles del ERP son pocos, grandes y llenos de contenido que sí contrasta.
// Apilar veinticinco tarjetas iguales en el catálogo del celular lo dejó a la
// vista: medido sobre la pantalla real, el fondo de un panel está entre 1,00 y
// 1,15 contra el fondo de la página en los catorce temas —en `sunmiDark` es
// literalmente el mismo color— y el borde del tema no llega a 1,5 en doce.
//
// El arreglo es un token por tema, `--card-elevacion`, derivado por cálculo para
// tocar 3,0 contra el fondo real de cada uno. Lo que estos candados defienden es
// que ese cálculo siga siendo cierto: un tema nuevo sin el token, o un cambio de
// `--app-bg` que arruine el contraste, dejarían las tarjetas otra vez sin límite
// visible en ese tema y NADA lo diría — no rompe el build, no rompe la suite, y
// solo se ve abriendo esa pantalla con ese tema puesto.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (ruta) => fs.readFileSync(path.join(RAIZ, ruta), "utf8");

const GLOBALS = leer("app/globals.css");
const SUNMI_CSS = leer("styles/sunmi.css");
const PANEL = leer("components/sunmi/SunmiPanel.jsx");

// El mínimo de WCAG 1.4.11 para contraste de algo que no es texto. El límite de
// un componente de interfaz entra en esa categoría.
const MINIMO = 3.0;

const aRGB = (hex) => {
  const m = String(hex).trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminancia = (c) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100;
};

/**
 * Los bloques de tema de la hoja.
 *
 * OJO CON EL SELECTOR: `sunmiDark` comparte bloque con `html:not([data-theme])`
 * separado por coma, porque además es el tema por defecto. Una expresión que
 * pida la llave PEGADA al `html[data-theme="…"]` se lo saltea EN SILENCIO y
 * devuelve trece de catorce. Ya pasó dos veces midiendo esta misma hoja, así que
 * abajo va el control que lo ataja.
 */
function bloquesDeTema() {
  const out = [];
  const re = /html\[data-theme="([^"]+)"\][^{]*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(GLOBALS)) !== null) {
    const bg = /--app-bg:\s*([^;]+);/.exec(m[2]);
    const elev = /--card-elevacion:\s*([^;\/]+)/.exec(m[2]);
    out.push({ tema: m[1], bg: bg?.[1]?.trim() ?? null, elevacion: elev?.[1]?.trim() ?? null });
  }
  return out;
}

const temasDeclarados = new Set(
  [...GLOBALS.matchAll(/data-theme="([a-zA-Z]+)"/g)].map((x) => x[1])
);

test("EL CONTROL DEL PARSER: se leyeron todos los temas que la hoja declara", () => {
  // Sin esto, los candados de abajo miden trece temas y pasan en verde mientras
  // el catorceavo está roto. Reproducible y correcto son preguntas distintas.
  const leidos = bloquesDeTema();
  assert.equal(
    leidos.length,
    temasDeclarados.size,
    `la hoja declara ${temasDeclarados.size} temas y el parser leyó ${leidos.length}: ` +
      `faltan ${[...temasDeclarados].filter((t) => !leidos.some((b) => b.tema === t)).join(", ")}`
  );
});

test("los catorce temas definen --card-elevacion", () => {
  const sin = bloquesDeTema().filter((b) => !b.elevacion);
  assert.deepEqual(
    sin.map((b) => b.tema),
    [],
    "un tema sin el token deja las tarjetas sin límite visible, y solo se ve con ese tema puesto"
  );
});

test("en los catorce, la elevación llega al mínimo de contraste contra el fondo", () => {
  const flojos = [];
  for (const b of bloquesDeTema()) {
    const fondo = aRGB(b.bg);
    const linea = aRGB(b.elevacion);
    assert.ok(fondo, `${b.tema}: --app-bg no es un hex plano (${b.bg})`);
    assert.ok(linea, `${b.tema}: --card-elevacion no es un hex plano (${b.elevacion})`);
    const k = contraste(linea, fondo);
    if (k < MINIMO) flojos.push(`${b.tema}: ${k}`);
  }
  assert.deepEqual(flojos, [], `por debajo de ${MINIMO}: ${flojos.join(", ")}`);
});

test("la clase del kit existe y sale del token, no de un color escrito", () => {
  assert.match(SUNMI_CSS, /\.sunmi-elevado\s*\{[^}]*var\(--card-elevacion\)/);
});

test("va como outline y NO como border-color, y el motivo es la cascada", () => {
  // En esta hoja las utilidades de Tailwind van DESPUÉS de las clases del kit
  // —lo mide `sonda-cascada.mjs` en cada despliegue—, así que un `.sunmi-elevado`
  // que pisara `border-color` perdería contra el `border-slate-800` que trae la
  // tarjeta del tema. Con `outline` no compite con nada que el repo use.
  const regla = /\.sunmi-elevado\s*\{([^}]*)\}/.exec(SUNMI_CSS)?.[1] ?? "";
  assert.match(regla, /outline:/);
  assert.doesNotMatch(regla, /border-color:/);
});

test("SunmiPanel lo pone solo cuando se lo piden, y cede si la pantalla declara el suyo", () => {
  const src = PANEL.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(src, /elevado\s*=\s*false/, "es opt-in: encenderlo para todos mueve 28 pantallas");
  assert.match(src, /sunmi-elevado/);
  assert.match(src, /declaraOutline/, "tiene que ceder el eje, como el resto del kit");
});

test("la tarjeta de producto lo pide", () => {
  // Sin este candado, alguien saca `elevado` de la tarjeta, la pieza del kit
  // sigue perfecta, todos los candados de arriba siguen verdes, y las tarjetas
  // vuelven a leerse como un bloque. Es el hueco de "nadie comprueba que la
  // página se lo PASE".
  const card = leer("components/sunmi/SunmiProductoCard.jsx")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
  assert.match(card, /<SunmiPanel[^>]*\selevado/);
});
