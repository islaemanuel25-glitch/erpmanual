// UNA LISTA SIN LECTURA DE COLUMNA SE MUESTRA, NO TIRA LA PANTALLA.
//
// ── EL CASO (Emanuel, 2026-11-25, producción en 0ae65d30) ─────────────────
//
// Listas → Arcor, lista del 25/11/2026 15:31 ("lista arcor desde el
// 24-11-26.xls .xlsx", 297 tus productos). Al tocar "Tus productos de Arcor"
// cayó la pantalla entera de la lista con:
//
//   Cannot destructure property 'explicadas' of '(intermediate value)…' as it is null.
//
// No era un renglón: era la cabecera. La lista entró por el lector propio de
// Arcor, que no pasa por la elección de columna (eso es del genérico), así que
// la importación no guarda `decisionDeLectura` y el resultado manda
// `lectura: null`. La página llamaba `explicaPoco(lectura)` sin condición, y la
// firma `({ explicadas, comparables } = {})` cubre `undefined` pero no `null`.
//
// ── DE DÓNDE SALE LA FORMA DEL DATO ───────────────────────────────────────
//
// El `null` no es inventado: es lo que escribe la ruta del resultado cuando la
// importación no tiene decisión de lectura, y la importación solo la tiene si
// pasó por el lector genérico. Las dos cosas se afirman abajo leyendo las rutas.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { explicaPoco } from "./importacionGenerica.js";
import { nombreDeLaColumnaLeida } from "./nombreDeLaColumna.js";

const codigoDe = (ruta) =>
  readFileSync(new URL(`../../../${ruta}`, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

test("LA FORMA REAL: una lista leída sin el lector genérico llega con `lectura: null`", () => {
  const resultado = codigoDe("app/api/proveedores/listas/[id]/resultado/route.js");
  assert.match(resultado, /lectura: cab\.decisionDeLectura \? \{ \.\.\.cab\.decisionDeLectura, nombreColumna \} : null,/);
  const importar = codigoDe("app/api/proveedores/listas/importar/route.js");
  // Arranca en null y solo la llena la rama del lector genérico.
  assert.match(importar, /let decisionDeLectura = null;\s*let filasParaConciliar = salidaParser\.productos;\s*if \(generico\) \{/);
});

test("SIN LECTURA, `explicaPoco` CONTESTA QUE NO, EN VEZ DE TIRAR LA PANTALLA", () => {
  assert.equal(explicaPoco(null), false);
  assert.equal(explicaPoco(undefined), false);
  assert.equal(explicaPoco({}), false);
  // Lo que ya se calculaba bien no cambia: menos de la mitad avisa, más no.
  assert.equal(explicaPoco({ explicadas: 2, comparables: 10 }), true);
  assert.equal(explicaPoco({ explicadas: 8, comparables: 10 }), false);
  assert.equal(explicaPoco({ explicadas: 5, comparables: 10 }), false, "la mitad justa no es poco");
  assert.equal(explicaPoco({ explicadas: 3, comparables: 0 }), false, "sin comparables no se afirma nada");
});

test("LA PANTALLA: con `lectura` null, los avisos de la columna no se dibujan y nada más la toca sin protección", () => {
  const p = codigoDe("app/modulos/proveedores/listas/[id]/page.jsx");
  // El aviso de "explica poco" depende solo de `explicaPoco`, que ahora tolera null.
  assert.match(p, /if \(explicaPoco\(lectura\) && abierta\) \{/);
  // El renglón "Los precios salieron de…" pregunta con `?.` antes de leer.
  assert.match(p, /if \(\(lectura\?\.titulo \|\| lectura\?\.columna != null\) && !\(explicaPoco\(lectura\) && abierta\)\) \{/);
  // Y lo que recibe la lectura entera la tolera.
  assert.equal(nombreDeLaColumnaLeida(null), null);
  // La hoja de cambiar la columna solo se abre desde el botón del aviso de
  // "explica poco", que sin lectura no se dibuja.
  assert.equal([...p.matchAll(/setCambiandoColumna\(true\)/g)].length, 1);
  const aviso = p.slice(p.indexOf("if (explicaPoco(lectura) && abierta) {"));
  assert.ok(aviso.indexOf("setCambiandoColumna(true)") < aviso.indexOf("if ((lectura?.titulo"), "el botón está en ese aviso");
});
