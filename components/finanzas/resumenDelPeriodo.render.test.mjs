// CANDADO DE RENDER: EL RESUMEN FINANCIERO, CELULAR Y SU AISLAMIENTO.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/resumenDelPeriodo.render.test.mjs
//
// Dibuja con `renderToStaticMarkup` —el mismo harness que `pagoADeposito.test.mjs`—
// y afirma lo que la pantalla de celular TIENE que decir, que el envoltorio
// separa celular de escritorio con el breakpoint del ERP, y que ninguna de las
// dos presentaciones hace cuentas propias.
//
// Los casos salen de `casosDelResumen.mjs`: ventas y movimientos de verdad
// pasados por el `resumenDelPeriodo` real. Ningún importe derivado está escrito
// a mano acá. Lo que se compara de las clases se compara como CONJUNTO, no por
// el orden en que están escritas: el orden no es comportamiento.
//
// El escritorio tiene su propio candado: `resumenDelPeriodoEscritorio.test.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ResumenDelPeriodo from "@/components/finanzas/ResumenDelPeriodo.jsx";
import ResumenDelPeriodoMovil from "@/components/finanzas/ResumenDelPeriodoMovil.jsx";
import {
  DESCRIPCION_DIA,
  casoConAvisos,
  casoLleno,
  casoVacio,
} from "@/components/finanzas/casosDelResumen.mjs";

// ── HERRAMIENTAS ──────────────────────────────────────────────────────────

const celular = (resumen) => renderToStaticMarkup(React.createElement(ResumenDelPeriodoMovil, { resumen }));
const envoltorio = (resumen, descripcion = null) =>
  renderToStaticMarkup(React.createElement(ResumenDelPeriodo, { resumen, descripcion }));

const cuenta = (s, sub) => s.split(sub).length - 1;

/** Las clases del elemento cuyo texto es exactamente `texto`, como CONJUNTO. */
function clasesDe(html, texto) {
  const fin = html.indexOf(`>${texto}<`);
  if (fin < 0) return null;
  const etiqueta = html.slice(html.lastIndexOf("<", fin), fin + 1);
  const m = etiqueta.match(/class="([^"]*)"/);
  return new Set(m ? m[1].split(" ").filter(Boolean) : []);
}

/** La etiqueta de apertura y el contenido del `<div>` que lleva `atributo`. */
function bloqueDe(html, atributo) {
  const i = html.indexOf(atributo);
  if (i < 0) return null;
  const abre = html.lastIndexOf("<div", i);
  const finAbre = html.indexOf(">", i) + 1;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = finAbre;
  let profundidad = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    profundidad += m[0] === "</div>" ? -1 : 1;
    if (profundidad === 0) {
      const etiqueta = html.slice(abre, finAbre);
      const clases = new Set((etiqueta.match(/class="([^"]*)"/)?.[1] || "").split(" ").filter(Boolean));
      return { clases, interior: html.slice(finAbre, m.index) };
    }
  }
  return null;
}

/** El fuente de un archivo sin comentarios: un candado que busca en prosa no afirma nada. */
const sinComentarios = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ══════════════════════════════════════════════════════════════════════════
// 1 · EL ENVOLTORIO SEPARA CELULAR DE ESCRITORIO
// ══════════════════════════════════════════════════════════════════════════

test("A1 · celular usa la arquitectura nueva y escritorio la de antes, con el breakpoint md", () => {
  const html = envoltorio(casoLleno(), DESCRIPCION_DIA);
  const cel = bloqueDe(html, 'data-resumen="celular"');
  const esc = bloqueDe(html, 'data-resumen="escritorio"');
  assert.ok(cel && esc, "faltan las dos presentaciones");
  // El patrón de SunmiPaginador: los dos en el DOM y el CSS elige.
  assert.ok(cel.clases.has("md:hidden"), "el celular se ve también en escritorio");
  assert.ok(esc.clases.has("hidden") && esc.clases.has("md:block"), "el escritorio se ve también en celular");
  // Celular: la arquitectura del Figma.
  assert.ok(cel.interior.includes("CÓMO SE FORMA"));
  assert.ok(!cel.interior.includes("TODAVÍA NO DISPONIBLE"));
  // Escritorio: la presentación de antes, con su bloque y sin la del celular.
  assert.ok(esc.interior.includes("TODAVÍA NO DISPONIBLE"));
  assert.ok(!esc.interior.includes("CÓMO SE FORMA"));
});

test("A2 · las dos presentaciones dibujan el MISMO resumen: ninguna hace su propia cuenta", () => {
  const r = casoLleno();
  const html = envoltorio(r, DESCRIPCION_DIA);
  const cel = bloqueDe(html, 'data-resumen="celular"').interior;
  const esc = bloqueDe(html, 'data-resumen="escritorio"').interior;
  // El mismo objeto llega a las dos: los importes del servidor aparecen igual.
  for (const importe of ["$1.353.300,00", "$298.741,56", "$264.826,56"]) {
    assert.ok(cel.includes(importe), `el celular no dibuja ${importe}`);
    assert.ok(esc.includes(importe), `el escritorio no dibuja ${importe}`);
  }
});

test("A3 · ninguna presentación importa el dominio ni opera con los importes", () => {
  const archivos = [
    "components/finanzas/ResumenDelPeriodo.jsx",
    "components/finanzas/ResumenDelPeriodoMovil.jsx",
    "components/finanzas/ResumenDelPeriodoEscritorio.jsx",
    "components/finanzas/PiezasDelResumen.jsx",
  ];
  for (const ruta of archivos) {
    const fuente = sinComentarios(ruta);
    assert.doesNotMatch(
      fuente,
      /resumenFinanciero|desglosar\w*|calcularMargen|efectivoEsperado/,
      `${ruta} importa lógica de dominio`,
    );
    // Ninguna suma, resta, multiplicación ni división sobre los datos del resumen.
    assert.doesNotMatch(
      fuente,
      /\b(resumen|cobros|caja|control|pago|pendientes)\??\.\w+\s*[-+*/](?![-+*/=])/,
      `${ruta} opera con un importe del resumen`,
    );
    assert.doesNotMatch(
      fuente,
      /(?<![-+*/=])[-+*/]\s*\b(resumen|cobros|caja|control|pago|pendientes)\??\.\w+/,
      `${ruta} opera con un importe del resumen`,
    );
  }
  // El envoltorio le pasa a las dos el MISMO `resumen`.
  const envolt = sinComentarios("components/finanzas/ResumenDelPeriodo.jsx");
  assert.equal(cuenta(envolt, "resumen={resumen}"), 2);
});

// ══════════════════════════════════════════════════════════════════════════
// 2 · EL HÉROE
// ══════════════════════════════════════════════════════════════════════════

test("H1 · el Resultado del período es el protagonista: tamaño héroe", () => {
  const html = celular(casoLleno());
  assert.ok(html.includes("Resultado del período"));
  const clases = clasesDe(html, "$264.826,56");
  assert.ok(clases?.has("text-xl3"), "el Resultado no usa el tamaño héroe");
  assert.ok(clases.has("sunmi-text-strong"));
});

test("H2 · indicadores: % sobre ventas y la cantidad de ventas, una sola vez", () => {
  const html = celular(casoLleno());
  assert.ok(html.includes("19,6% sobre ventas"));
  assert.equal(cuenta(html, "2 ventas"), 1, "la cantidad de ventas se repitió en el recorrido");
});

test("H3 · el héroe NO repite el período: eso lo dice el navegador", () => {
  const html = envoltorio(casoLleno(), DESCRIPCION_DIA);
  const cel = bloqueDe(html, 'data-resumen="celular"').interior;
  assert.ok(!cel.includes(DESCRIPCION_DIA.titulo), "el celular volvió a escribir la fecha");
  // El escritorio sí, como antes, debajo de Ventas: es la presentación conservada.
  assert.ok(bloqueDe(html, 'data-resumen="escritorio"').interior.includes(DESCRIPCION_DIA.titulo));
});

test("H4 · la barra de acento sale del tema: la clase decorativa existente, sin estilo propio", () => {
  const html = celular(casoLleno());
  const etiqueta = html.match(/<span[^>]*sunmi-bg-accent[^>]*>/)?.[0];
  assert.ok(etiqueta, "no está la barra de acento");
  const clases = new Set(etiqueta.match(/class="([^"]*)"/)[1].split(" "));
  assert.ok(clases.has("sunmi-bg-accent"));
  assert.match(etiqueta, /aria-hidden="true"/, "una franja decorativa no se anuncia");
  // Ni color escrito, ni estilo en línea, en toda la pantalla.
  assert.ok(!html.includes("style="), "apareció un estilo en línea");
  assert.doesNotMatch(html, /class="[^"]*(#[0-9a-fA-F]{3,8}|rgb|hsl)/);
});

// ══════════════════════════════════════════════════════════════════════════
// 3 · CÓMO SE FORMA
// ══════════════════════════════════════════════════════════════════════════

test("F1 · el CMV usa el nombre completo, no la forma corta", () => {
  const html = celular(casoLleno());
  assert.ok(html.includes("Costo de mercadería vendida"));
  assert.doesNotMatch(html, />Mercadería vendida</);
  assert.ok(html.includes("− $1.054.558,44"));
});

test("F2 · '% sobre ventas' SOLO en el héroe, Margen y Resultado", () => {
  const html = celular(casoLleno());
  assert.ok(html.includes("22,1% sobre ventas"), "falta el % del Margen");
  // Héroe + Margen + Resultado: tres, y ni uno más en Ventas, CMV, Gastos o Comisiones.
  assert.equal(cuenta(html, "sobre ventas"), 3);
});

test("F3 · Gastos conserva su semántica económica, en una nota corta", () => {
  const html = celular(casoLleno());
  assert.ok(html.includes("Cuenta por la fecha del gasto, esté pagado o no."));
});

test("F4 · Comisiones de cobro conserva una aclaración corta", () => {
  assert.ok(celular(casoLleno()).includes("Lo que cobran los medios de pago."));
});

test("F5 · 'Ver gastos' dibuja el enlace que arma el contexto de #124, tal cual", () => {
  const r = casoLleno();
  const html = celular(r);
  // La URL la arma `urlDeGastosDelResumen` (en el caso, como en la ruta): la
  // pantalla no la escribe ni la modifica.
  assert.match(r.verGastos, /estado=TODAS/);
  assert.ok(html.includes(`href="${r.verGastos.replaceAll("&", "&amp;")}"`));
  assert.ok(html.includes("Ver gastos"));
});

// ══════════════════════════════════════════════════════════════════════════
// 4 · COBROS, PAGO A DEPÓSITO Y CAJA
// ══════════════════════════════════════════════════════════════════════════

test("C1 · Cobros: composición por medio, comisión y neto en sus renglones", () => {
  const html = celular(casoLleno());
  assert.ok(html.includes("64%") && html.includes("36%"));
  assert.ok(html.includes("Comisión") && html.includes("− $33.915,00"));
  assert.ok(html.includes("Neto recibido") && html.includes("$450.585,00"));
  // La comisión por medio no se repite en una nota: ya tiene su renglón.
  assert.doesNotMatch(html, /Comisión \$[\d.,]+ · neto/);
});

test("C2 · Cobros no asume dos medios: tres medios y el fiado sin porcentaje", () => {
  const html = celular(casoConAvisos());
  // Efectivo 1000 y Crédito 2000 sobre 3000 cobrados; el fiado no entra al total.
  assert.ok(html.includes("33%") && html.includes("67%"));
  assert.ok(html.includes("A cuenta corriente: todavía no entró"));
});

test("C3 · sin cobros: estado vacío y ningún porcentaje NaN", () => {
  const html = celular(casoVacio());
  assert.ok(html.includes("No hubo cobros en el período."));
  assert.ok(!html.includes("NaN") && !html.includes("Infinity"));
});

test("C4 · Pago a depósito: el pendiente se informa y dice que no resta del resultado", () => {
  const html = celular(casoLleno());
  assert.ok(html.includes("$2.658.311,12"));
  assert.ok(html.includes("4 transferencias"));
  assert.ok(html.includes("No resta del resultado."));
});

test("C5 · retiros manuales > 0: aviso, sin llamarlos gasto", () => {
  const html = celular(casoLleno());
  assert.ok(html.includes("$61.500,00 salieron de caja y todavía no están clasificados como gastos."));
  assert.ok(html.includes("Recaudación retirada") && html.includes("No es un gasto"));
});

test("C6 · retiros manuales = 0: sin aviso", () => {
  assert.ok(!celular(casoConAvisos()).includes("salieron de caja"));
});

test("C7 · un retiro manual NO entra al Resultado", () => {
  // El mismo período calculado por el dominio con y sin los retiros manuales:
  // la caja cambia y el Resultado del héroe no se mueve.
  const conRetiros = celular(casoLleno());
  const sinRetiros = celular(casoLleno({ conRetiros: false }));
  assert.ok(conRetiros.includes("$61.500,00") && !sinRetiros.includes("$61.500,00"));
  for (const html of [conRetiros, sinRetiros]) {
    assert.ok(clasesDe(html, "$264.826,56")?.has("text-xl3"));
  }
});

test("C8 · Pagos a proveedores ya no figura como métrica faltante en celular", () => {
  const html = celular(casoLleno());
  assert.ok(!html.includes("Todavía no disponible"));
  assert.ok(!html.includes("Pagos a proveedores"));
});

// ══════════════════════════════════════════════════════════════════════════
// 5 · ESTADOS ESPECIALES (frame 5-2)
// ══════════════════════════════════════════════════════════════════════════

test("E1 · resultado NEGATIVO: signo explícito y tono danger, no solo color", () => {
  const html = celular(casoConAvisos());
  // (3300 − 1700) − 5000 de gastos − 100 de comisión = −3500.
  const clases = clasesDe(html, "− $3.500,00");
  assert.ok(clases, "el negativo no lleva el signo adelante");
  assert.ok(clases.has("sunmi-text-danger"));
  assert.match(html, /-[\d,]+% sobre ventas/, "el porcentaje negativo perdió el signo");
});

test("E2 · resultado CERO con ventas en cero: neutral, sin NaN y sin porcentaje", () => {
  const html = celular(casoVacio());
  const clases = clasesDe(html, "$0,00");
  assert.ok(clases && !clases.has("sunmi-text-danger"));
  assert.ok(!html.includes("NaN") && !html.includes("Infinity"));
  assert.ok(!html.includes("sobre ventas"));
});

test("E3 · comisión pendiente: resultado visible y aviso, sin estimar", () => {
  const html = celular(casoConAvisos());
  assert.ok(clasesDe(html, "− $3.500,00"), "el resultado dejó de mostrarse");
  assert.ok(html.includes("Hay comisiones pendientes de determinar en este período."));
  assert.ok(html.includes("Hay 1 venta con costo $0 en este período"));
});

// ══════════════════════════════════════════════════════════════════════════
// 6 · SIN INFO/DISCLOSURE INVENTADO
// ══════════════════════════════════════════════════════════════════════════

test("I1 · esta tanda no inventó un Info/disclosure: las aclaraciones son notas", () => {
  for (const ruta of [
    "components/finanzas/ResumenDelPeriodo.jsx",
    "components/finanzas/ResumenDelPeriodoMovil.jsx",
    "components/finanzas/PiezasDelResumen.jsx",
    "components/finanzas/CuentaFinancieraDeUnLocal.jsx",
  ]) {
    const fuente = sinComentarios(ruta);
    assert.doesNotMatch(fuente, /aria-expanded|<details|<summary|Tooltip|Popover|ⓘ|Info\b/, `${ruta} trae un disclosure`);
  }
});
