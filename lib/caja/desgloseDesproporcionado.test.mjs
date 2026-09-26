// EL ERROR ×1000: UNA CANTIDAD DE BILLETES ESCRITA COMO MONTO.
//
// En producción se escribió varias veces el monto donde va la cantidad: 23000
// en la fila de $1.000 para dejar $23.000, y el sistema guardó $23.000.000. Esto
// defiende la regla que lo frena —`evaluarDesproporcionDesglose`— y que esa regla
// sea UNA sola, aplicada en todas las rutas que reciben un desglose con una
// referencia contra la cual compararlo.
//
// Lo que las rutas hacen de verdad con la base se ejerce contra Postgres en
// `scripts/pruebas-db/cierreCaja.mjs` (sección E).
//
//   node --import ./scripts/alias-loader.mjs --test lib/caja/desgloseDesproporcionado.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import TablaDenominaciones from "@/components/caja/TablaDenominaciones";

import {
  evaluarDesproporcionDesglose,
  respuestaDesproporcion,
  FACTOR_DESPROPORCION,
  CODIGO_DESPROPORCION,
  UMBRAL_CANTIDAD_EXTRAORDINARIA,
  MAX_CANTIDAD_POR_FILA,
  validarDesgloseServidor,
} from "./desgloseServidor.js";

const SOBRE = "lo que dice el sobre";

/** El fuente sin comentarios: un candado que busca código no puede encontrar prosa. */
const codigo = (ruta) =>
  readFileSync(ruta, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── A y B: el caso de producción, con el sobre de $23.000 ─────────────────

test("A. sobre de $23.000 recibido como {1000: 23000}: NO pasa inadvertido", () => {
  const r = evaluarDesproporcionDesglose({
    desglose: { 1000: 23000 },
    referencia: 23000,
    etiquetaReferencia: SOBRE,
  });
  assert.equal(r.desproporcionado, true);
  assert.equal(r.valido, false);
  assert.equal(r.codigo, CODIGO_DESPROPORCION);
  assert.equal(r.total, 23000000);
  // El mensaje dice qué fila, cuántos billetes, cuánto da y contra qué.
  assert.match(r.error, /23\.000 billetes/);
  assert.match(r.error, /\$23\.000\.000,00/);
  assert.match(r.error, /1\.000 veces lo que dice el sobre/);
  assert.match(r.error, /CANTIDAD de billetes, no el monto/);
});

test("A. escribir en pesos lo que se CREE haber contado ($23.000) no lo destraba", () => {
  // Es exactamente lo que haría quien confundió las columnas, y por eso es la
  // confirmación: no coincide con lo cargado y el error queda a la vista.
  const r = evaluarDesproporcionDesglose({
    desglose: { 1000: 23000 },
    referencia: 23000,
    etiquetaReferencia: SOBRE,
    totalConfirmado: "23000",
  });
  assert.equal(r.valido, false);
  assert.match(r.error, /Escribiste \$23\.000,00, pero lo cargado suma \$23\.000\.000,00/);
});

test("A. nunca corrige: el total sigue siendo lo cargado, no lo que 'quiso' escribir", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23000 }, referencia: 23000 });
  assert.equal(r.total, 23000000);
  assert.equal(r.filaMayor.cantidad, 23000);
  assert.equal(r.filaMayor.subtotal, 23000000);
  // La salida no trae ningún desglose "corregido" para reemplazar el cargado.
  assert.deepEqual(
    Object.keys(r).sort(),
    ["codigo", "confirmado", "desproporcionado", "error", "filaMayor", "referencia", "total", "valido"]
  );
});

test("B. sobre de $23.000 recibido como {1000: 23}: válido y sin aviso", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23 }, referencia: 23000, etiquetaReferencia: SOBRE });
  assert.equal(r.desproporcionado, false);
  assert.equal(r.valido, true);
  assert.equal(r.error, null);
  assert.equal(r.total, 23000);
});

// ── C: el cambio y el conteo, con el contexto en decenas de miles ──────────

test("C. cambio {1000: 23000} con un esperado de $45.000: se activa", () => {
  const r = evaluarDesproporcionDesglose({
    desglose: { 1000: 23000 },
    referencia: 45000,
    etiquetaReferencia: "el efectivo que el sistema espera en la caja",
  });
  assert.equal(r.desproporcionado, true);
  assert.equal(r.valido, false);
});

test("C. el error de UNA fila entre varias también se activa (×6 sobre $200.000)", () => {
  // Un solo billete de $1.000 escrito como "1000". Con un factor de 10 pasaría.
  const r = evaluarDesproporcionDesglose({ desglose: { 20000: 10, 1000: 1000 }, referencia: 200000 });
  assert.equal(r.desproporcionado, true);
  assert.equal(r.filaMayor.clave, "1000");
});

// ── Sin referencia: la apertura sin sobre, por cantidad por fila ──────────

const SIN_SOBRE = { umbralCantidadPorFila: UMBRAL_CANTIDAD_EXTRAORDINARIA };

test("el umbral por fila es 500: por encima del máximo legítimo medido (387)", () => {
  assert.equal(UMBRAL_CANTIDAD_EXTRAORDINARIA, 500);
});

test("sin sobre · A. {1000: 23000} sin total confirmado: no pasa", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23000 }, ...SIN_SOBRE });
  assert.equal(r.valido, false);
  assert.equal(r.codigo, CODIGO_DESPROPORCION);
  assert.equal(r.total, 23000000);
  // Denominación, cantidad, subtotal y total calculado, en el mensaje.
  assert.match(r.error, /Lo cargado suma \$23\.000\.000,00, con más de 500 billetes en una sola fila/);
  assert.match(r.error, /En la fila de \$1\.000 cargaste 23\.000 billetes: 23\.000 × \$1\.000 = \$23\.000\.000,00/);
});

test("sin sobre · B. {1000: 23000} confirmando $23.000: no pasa", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23000 }, ...SIN_SOBRE, totalConfirmado: "23000" });
  assert.equal(r.valido, false);
  assert.match(r.error, /Escribiste \$23\.000,00, pero lo cargado suma \$23\.000\.000,00/);
});

test("sin sobre · C. {1000: 23000} confirmando $23.000.000: pasa, y el total queda tal cual", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23000 }, ...SIN_SOBRE, totalConfirmado: "23000000" });
  assert.equal(r.valido, true);
  assert.equal(r.confirmado, true);
  assert.equal(r.total, 23000000);
});

test("sin sobre · D. {1000: 23}: normal, sin aviso", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23 }, ...SIN_SOBRE });
  assert.equal(r.desproporcionado, false);
  assert.equal(r.valido, true);
});

test("sin sobre · E y F. 500 billetes no activa; 501 sí", () => {
  assert.equal(evaluarDesproporcionDesglose({ desglose: { 1000: 500 }, ...SIN_SOBRE }).desproporcionado, false);
  const r = evaluarDesproporcionDesglose({ desglose: { 1000: 501 }, ...SIN_SOBRE });
  assert.equal(r.desproporcionado, true);
  assert.equal(r.valido, false);
});

test("sin sobre · los máximos legítimos medidos de cada denominación no activan", () => {
  // Relevamiento de producción del 2026-09-26, todos juntos en un solo cajón.
  const maximos = { 100: 126, 200: 40, 500: 35, 1000: 387, 2000: 57, 10000: 39, 20000: 309 };
  assert.equal(evaluarDesproporcionDesglose({ desglose: maximos, ...SIN_SOBRE }).desproporcionado, false);
});

test("sin sobre · el caso contaminado real (2.072 × $20.000) activa", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { 20000: 2072 }, ...SIN_SOBRE });
  assert.equal(r.valido, false);
  assert.match(r.error, /2\.072 billetes/);
});

test("sin sobre · las monedas son un importe: un monto alto ahí no cuenta como billetes", () => {
  assert.equal(evaluarDesproporcionDesglose({ desglose: { monedas: 9000 }, ...SIN_SOBRE }).desproporcionado, false);
});

test("sin sobre · I. el tope duro de 100.000 sigue rechazando en la validación", () => {
  assert.equal(MAX_CANTIDAD_POR_FILA, 100000);
  const r = validarDesgloseServidor({ 1000: 100001 }, { etiqueta: "conteo de apertura", permitirVacio: false });
  assert.equal(r.valido, false);
  assert.match(r.error, /demasiado grande/);
  // Y el tope duro no depende de la confirmación: no hay total que lo destrabe.
  assert.equal(validarDesgloseServidor({ 1000: 100000 }).valido, true);
});

test("el umbral apagado (default) no cambia nada para las rutas con referencia", () => {
  // Un {1000: 600} contra una referencia de $600.000 es normal en el #83.
  assert.equal(evaluarDesproporcionDesglose({ desglose: { 1000: 600 }, referencia: 600000 }).valido, true);
});

// ── D y E: lo normal no se rompe ──────────────────────────────────────────

test("D. conteos normales contra su referencia: sin aviso", () => {
  const casos = [
    [{ 20000: 7, 10000: 1, monedas: 450 }, 150450],
    [{ 2000: 1 }, 10000],
    [{ 10000: 3, 1000: 5, 100: 12 }, 36200],
    [{}, 50000],
  ];
  for (const [desglose, referencia] of casos) {
    const r = evaluarDesproporcionDesglose({ desglose, referencia });
    assert.equal(r.valido, true, JSON.stringify(desglose));
    assert.equal(r.desproporcionado, false, JSON.stringify(desglose));
  }
});

test("E. una diferencia real razonable sigue pasando, para arriba y para abajo", () => {
  // Sobrante de $12.000 sobre $100.000 y un faltante de la mitad: diferencias
  // de caja. Las decide el resto del circuito —motivo, diferencia—, no esto.
  assert.equal(evaluarDesproporcionDesglose({ desglose: { 20000: 5, 2000: 6 }, referencia: 100000 }).valido, true);
  assert.equal(evaluarDesproporcionDesglose({ desglose: { 10000: 5 }, referencia: 100000 }).valido, true);
  // Un faltante enorme no es este error: es la referencia la que puede estar
  // contaminada, y bloquearlo impediría registrar la verdad.
  assert.equal(evaluarDesproporcionDesglose({ desglose: { 1000: 23 }, referencia: 23000000 }).valido, true);
});

test("E. un conteo grande de verdad se confirma escribiendo el total en pesos", () => {
  for (const escrito of [23000000, "23000000", "23000000.00"]) {
    const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23000 }, referencia: 23000, totalConfirmado: escrito });
    assert.equal(r.valido, true, String(escrito));
    assert.equal(r.confirmado, true);
    assert.equal(r.desproporcionado, true);
  }
});

// ── El borde y la referencia ───────────────────────────────────────────────

test("el borde es el factor: justo en el doble se pide confirmar, un centavo menos no", () => {
  assert.equal(FACTOR_DESPROPORCION, 2);
  assert.equal(evaluarDesproporcionDesglose({ desglose: { 10000: 2 }, referencia: 10000 }).desproporcionado, true);
  assert.equal(
    evaluarDesproporcionDesglose({ desglose: { 10000: 1, monedas: 9999.99 }, referencia: 10000 }).desproporcionado,
    false
  );
});

test("sin referencia positiva no se evalúa: no se inventa contra qué comparar", () => {
  for (const referencia of [null, undefined, 0, -5000, "x", NaN]) {
    const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23000 }, referencia });
    assert.equal(r.desproporcionado, false, String(referencia));
    assert.equal(r.valido, true, String(referencia));
  }
});

test("un total escrito vacío, negativo o que no es número cuenta como no escrito", () => {
  for (const escrito of ["", null, undefined, "-23000000", "abc"]) {
    const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23000 }, referencia: 23000, totalConfirmado: escrito });
    assert.equal(r.valido, false, String(escrito));
    assert.match(r.error, /escribí el total contado en pesos/);
  }
});

test("la fila de monedas se nombra como importe, no como billetes", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { monedas: 900000 }, referencia: 20000 });
  assert.equal(r.desproporcionado, true);
  assert.match(r.error, /"Monedas \/ otros" cargaste \$900\.000,00/);
});

test("la respuesta del servidor es una sola y la pantalla la reconoce por la bandera", () => {
  const r = evaluarDesproporcionDesglose({ desglose: { 1000: 23000 }, referencia: 23000 });
  const cuerpo = respuestaDesproporcion(r);
  assert.equal(cuerpo.ok, false);
  assert.equal(cuerpo.codigo, CODIGO_DESPROPORCION);
  assert.equal(cuerpo.desgloseDesproporcionado, true);
  assert.equal(cuerpo.referencia, 23000);
  assert.equal(cuerpo.total, 23000000);
});

test("el tope viejo de 100.000 billetes NO atrapaba el caso: por eso existe esta regla", () => {
  // Deja escrito por qué `validarDesgloseServidor` no alcanzaba.
  assert.equal(validarDesgloseServidor({ 1000: 23000 }).valido, true);
});

// ── Una regla, en todas las rutas ──────────────────────────────────────────

/**
 * Las rutas que reciben un desglose, enumeradas por quien lo valida. Con
 * `--untracked`: una ruta nueva todavía sin commitear tiene que verse hoy.
 */
function rutasConDesglose() {
  return execFileSync(
    "git",
    ["grep", "--untracked", "-l", "validarDesgloseServidor(", "--", "app/api"],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean)
    .sort();
}

/**
 * Las que reciben un desglose SIN referencia contra la cual compararlo. Una
 * lista con su motivo, no un `if`: agregar una acá es una decisión que se lee.
 *
 * Hasta 2026-09-26 esta lista EXIMÍA a la apertura sin sobre de toda regla. Con
 * la distribución de producción medida pasó a protegerse por cantidad por fila:
 * ya no hay ninguna ruta sin protección, solo rutas sin referencia monetaria.
 */
const SIN_REFERENCIA = {
  "app/api/pos-ventas/turnos/abrir-sin-cambio/route.js":
    "abre contando el cajón sin sobre: el sistema no tiene ningún número esperado",
};

test("la enumeración encuentra las rutas de verdad (contra la enumeración vacía)", () => {
  const rutas = rutasConDesglose();
  assert.ok(rutas.length >= 6, `se encontraron ${rutas.length}: ${rutas.join(", ")}`);
  assert.ok(rutas.includes("app/api/pos-ventas/turnos/abrir-con-cambio/route.js"));
});

test("TODA ruta que recibe un desglose aplica la regla, sin excepciones", () => {
  for (const ruta of rutasConDesglose()) {
    const s = codigo(ruta);
    assert.match(s, /evaluarDesproporcionDesglose\(/, `${ruta} recibe un desglose y no evalúa la desproporción`);
    assert.match(s, /totalConfirmado:\s*body\?\.totalConfirmado/, `${ruta} no lee el total confirmado del pedido`);
    assert.match(s, /respuestaDesproporcion\(/, `${ruta} no responde con la forma común`);
  }
});

test("una ruta sin referencia se protege por cantidad por fila, con el umbral medido", () => {
  const rutas = rutasConDesglose();
  for (const ruta of Object.keys(SIN_REFERENCIA)) {
    assert.ok(rutas.includes(ruta), `${ruta} ya no recibe desglose: sacarla de la lista`);
    const s = codigo(ruta);
    assert.match(s, /umbralCantidadPorFila:\s*UMBRAL_CANTIDAD_EXTRAORDINARIA/, `${ruta} no usa el umbral por fila`);
    // Y no inventa una referencia: no hay ninguna que sea confiable.
    assert.doesNotMatch(s, /referencia:/, `${ruta} compara contra una referencia`);
  }
});

test("las rutas CON referencia no usan el umbral por fila: esta tanda no cambia el #83", () => {
  for (const ruta of rutasConDesglose()) {
    if (SIN_REFERENCIA[ruta]) continue;
    assert.doesNotMatch(codigo(ruta), /umbralCantidadPorFila/, `${ruta} usa el umbral por fila`);
  }
});

test("las referencias son las del contexto, no un número inventado", () => {
  const esperadas = {
    "app/api/pos-ventas/turnos/abrir-con-cambio/route.js": [/referencia:\s*Number\(sobre\.total\)/],
    "app/api/pos-ventas/cierres/iniciar/route.js": [/referencia:\s*corte\.efectivoEsperadoCorte/],
    "app/api/pos-ventas/retiros/iniciar/route.js": [/referencia:\s*corte\.efectivoEsperadoCorte/],
    "app/api/pos-ventas/cierres/[token]/confirmar/route.js": [
      /referencia:\s*Number\(cierre\.efectivoRetiradoEsperado\)/,
      /referencia:\s*Number\(cierre\.efectivoEsperadoCorte\)/,
    ],
    "app/api/pos-ventas/retiros/[token]/confirmar/route.js": [
      /referencia:\s*Number\(retiro\.efectivoRetiradoEsperado\)/,
    ],
  };
  for (const [ruta, patrones] of Object.entries(esperadas)) {
    const s = codigo(ruta);
    for (const p of patrones) assert.match(s, p, `${ruta}: falta ${p}`);
  }
});

test("ninguna ruta 'arregla' el número: nada divide cantidades por 1000", () => {
  for (const ruta of rutasConDesglose()) {
    assert.doesNotMatch(codigo(ruta), /\/\s*1000\b/, `${ruta} divide por 1000`);
  }
});

// ── La pantalla usa la misma regla y manda el total escrito ────────────────

test("la grilla de conteo evalúa con la función del servidor, no con una propia", () => {
  const s = codigo("components/caja/TablaDenominaciones.jsx");
  assert.match(s, /import \{ evaluarDesproporcionDesglose \} from "@\/lib\/caja\/desgloseServidor"/);
  assert.match(s, /evaluarDesproporcionDesglose\(\{/);
  assert.match(s, /proporcion\.desproporcionado && \(/);
  assert.match(s, /onTotalConfirmado\?\.\(e\.target\.value\)/);
});

test("cada pantalla con referencia la pasa a la grilla, bloquea el botón y manda el total escrito", () => {
  const pantallas = [
    "app/modulos/pos-ventas/aperturas/[cambioId]/page.jsx",
    "app/modulos/pos-ventas/cierres/[token]/page.jsx",
    "app/modulos/pos-ventas/retiros/[token]/page.jsx",
    "app/modulos/pos-ventas/cierres/iniciar/page.jsx",
    "app/modulos/pos-ventas/retiros/nuevo/page.jsx",
    "app/modulos/pos-ventas/aperturas/sin-cambio/page.jsx",
  ];
  for (const f of pantallas) {
    const s = codigo(f);
    assert.match(s, /evaluarDesproporcionDesglose\(\{\s*desglose:/, `${f} no evalúa`);
    assert.match(s, /controlTotal/, `${f} no le pasa la referencia a la grilla`);
    assert.match(s, /totalConfirmado: (totalConfirmado === "" \? null : totalConfirmado|confirmado)/, `${f} no manda el total escrito`);
    assert.match(s, /proporcion\.valido/, `${f} no frena con lo que la regla dice`);
  }
});

// ── Renderizada de verdad: el aviso aparece cuando corresponde y solo entonces ─

const grilla = (props) => renderToStaticMarkup(createElement(TablaDenominaciones, props));

test("la grilla renderizada muestra el aviso y el campo en pesos con {1000: 23000} contra $23.000", () => {
  const html = grilla({ desglose: { 1000: 23000 }, referencia: 23000, etiquetaReferencia: SOBRE, idPrefijo: "rec" });
  assert.match(html, /data-desglose-desproporcionado/);
  assert.match(html, /¿Cantidad o monto\?/);
  assert.match(html, /23\.000 billetes/);
  assert.match(html, /Total contado, en pesos/);
  assert.match(html, /id="rec-total-pesos"/);
});

test("la grilla renderizada NO muestra nada extra con {1000: 23}, ni sin referencia", () => {
  for (const props of [
    { desglose: { 1000: 23 }, referencia: 23000 },
    { desglose: { 1000: 23000 } },
  ]) {
    const html = grilla(props);
    assert.doesNotMatch(html, /data-desglose-desproporcionado/, JSON.stringify(props));
    assert.doesNotMatch(html, /Total contado, en pesos/, JSON.stringify(props));
  }
});

test("sin sobre, la grilla renderizada muestra fila, cantidad, subtotal, total y el campo en pesos", () => {
  const html = grilla({ desglose: { 1000: 23000 }, umbralCantidadPorFila: 500, idPrefijo: "apertura" });
  assert.match(html, /data-desglose-desproporcionado/);
  assert.match(html, /\$23\.000\.000,00, con más de 500 billetes en una sola fila/);
  assert.match(html, /23\.000 × \$1\.000 = \$23\.000\.000,00/);
  assert.match(html, /id="apertura-total-pesos"/);
  // Y con 500 exactos, nada.
  assert.doesNotMatch(grilla({ desglose: { 1000: 500 }, umbralCantidadPorFila: 500 }), /data-desglose-desproporcionado/);
});

test("la pantalla sin sobre le pasa el umbral medido a la grilla, sin inventar referencia", () => {
  const s = codigo("app/modulos/pos-ventas/aperturas/sin-cambio/page.jsx");
  assert.match(s, /umbralCantidadPorFila: UMBRAL_CANTIDAD_EXTRAORDINARIA/);
  assert.doesNotMatch(s, /referencia:/);
  assert.match(s, /\{\.\.\.controlTotal\}/);
});

test("confirmado en pesos, la grilla lo dice sin repetir el error", () => {
  const html = grilla({ desglose: { 1000: 23000 }, referencia: 23000, totalConfirmado: "23000000" });
  assert.match(html, /Total confirmado en pesos/);
  assert.doesNotMatch(html, /¿Cantidad o monto\?/);
});

test("los dos paneles y el modal del cambio pasan la referencia hasta la grilla", () => {
  const paneles = codigo("components/caja/PanelesRetiro.jsx");
  assert.equal((paneles.match(/\{\.\.\.controlTotal\}/g) ?? []).length, 2);
  assert.match(codigo("components/caja/ModalCambioPrevio.jsx"), /\{\.\.\.controlTotal\}/);
});
