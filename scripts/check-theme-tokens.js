#!/usr/bin/env node
/**
 * check-theme-tokens.js
 * Busca tokens de color Tailwind hardcodeados en app/modulos/**.
 * Exit 1 si encuentra matches fuera de whitelist.
 *
 * Uso:  node scripts/check-theme-tokens.js
 *       npm run check:theme
 *
 * ── ADEMÁS ES LA FUENTE DE LOS PATRONES DE COLOR ────────────────────────────
 *
 * `scripts/hardcodeo.mjs` cuenta colores fijos y los lee DE ACÁ, no de una copia
 * propia. Dos listas de colores prohibidos empiezan iguales y se separan el día
 * que alguien agrega un patrón en una sola; entonces el mismo archivo pasa un
 * chequeo y falla el otro, y nadie sabe cuál tiene razón.
 *
 * Por eso el archivo exporta FORBIDDEN y WHITELIST, y solo corre el chequeo
 * cuando se lo invoca directo. Requerirlo desde otro script no ejecuta nada.
 */

const fs = require("fs");
const path = require("path");

// ── Patrones prohibidos ──────────────────────────────────────
const FORBIDDEN = [
  /\bbg-slate-/,
  /\btext-slate-/,
  /\bborder-slate-/,
  /\bring-slate-/,
  /\bbg-red-/,
  /\bbg-amber-/,
  /\bbg-cyan-/,
  /\bbg-emerald-/,
  /\bbg-green-/,
  /\bbg-black\//,
  /\btext-red-/,
  /\btext-amber-/,
  /\btext-cyan-/,
  /\btext-emerald-/,
  /\btext-green-/,
  /\btext-orange-/,
  /\bborder-red-/,
  /\bborder-amber-/,
  /\bborder-cyan-/,
  /\bborder-emerald-/,
  /\bhover:bg-slate-/,
  /\bhover:text-slate-/,
  /\bhover:text-cyan-/,
  /\bhover:text-red-/,
  /\bhover:text-emerald-/,
  /\bhover:text-amber-/,
  /\bhover:bg-cyan-/,
  /\bhover:bg-amber-/,
  /\bfocus:ring-cyan-/,
  /\bfocus:ring-slate-/,
  /\bplaceholder:text-slate-/,

  // ── LOS GRISES, agregados el 2026-08-17 ──────────────────────────────────
  //
  // Faltaban, y el agujero se vio arreglando el detalle de turno: catorce clases
  // de gris que decidían si un número se leía o no, y el contador no veía
  // ninguna. `text-gray-400` sobre blanco da 2,54:1 contra un mínimo de 4,5.
  //
  // Medido ANTES de agregarlos, con la misma enumeración que usa la línea de
  // base: sube +31, de 286 a 317, repartido en 5 archivos. Veintitrés de esos 31
  // eran del documento imprimible del turno y se declararon uno por uno (esa
  // pantalla se borró el 2026-11-01, y sus excepciones con ella), así que la
  // cifra que quedó fue 294 y los 8 nuevos eran deuda de verdad.
  //
  // No bloquea trabajo, así que NO se congeló nada: se declararon las
  // excepciones que corresponden y se subió la base a 294 con su motivo.
  /\btext-gray-/,
  /\bbg-gray-/,
  /\bborder-gray-/,
  /\bhover:bg-gray-/,
  /\bhover:text-gray-/,
  /\bring-gray-/,
  /\bdivide-gray-/,
  /\bplaceholder:text-gray-/,
];

// ── Whitelist: excepciones declaradas ────────────────────────
//
// Dos formas conviven a propósito:
//
//   RegExp pelada                        — vale en CUALQUIER archivo.
//   { archivo, linea, lineas, motivo }   — vale SOLO en ese archivo.
//
// La segunda existe porque las excepciones de una pantalla no pueden perdonar al
// repo entero. `text-[10px] text-gray-600 uppercase` como regex pelada exime esa
// combinación en los 300 archivos de interfaz; scopeada a un archivo, exime las
// líneas de esa hoja y nada más.
//
// `lineas` es la cantidad de líneas que la excepción cubre HOY, medida. La
// comprueba `lib/hardcodeo/excepcionesDeclaradas.test.mjs`: si una excepción
// empieza a cubrir más líneas que las declaradas, se pone rojo. Sin eso, una
// excepción escrita para ocho rótulos se estira sola y perdona en bloque sin que
// nadie se entere — que es exactamente lo que no se quería.
//
// Hoy no hay ninguna scopeada. Las 13 que había eran del documento imprimible
// del detalle de turno de Auditoría POS (los 23 grises de una hoja de papel), y
// se fueron el 2026-11-01 con esa pantalla: turnos y cajas viven en
// /modulos/turnos-y-cierres. La forma queda, con su candado.

const WHITELIST = [
  /text-slate-900\/80/,   // dark text on bright SunmiHeader
  /text-slate-900\/70/,   // idem
];

/**
 * La regla de exención sobre una lista dada. Pura, para que el candado pueda
 * ejercer el scope por archivo con una excepción de prueba aunque la lista real
 * no tenga ninguna scopeada.
 */
function exentoSegun(lista, linea, ruta) {
  return lista.some((w) => {
    if (w instanceof RegExp) return w.test(linea);
    if (!w.linea.test(linea)) return false;
    // Sin ruta no se puede afirmar el scope, así que NO se exime: falla cerrado.
    return typeof ruta === "string" && w.archivo.test(ruta);
  });
}

/**
 * ¿Esta línea de este archivo está exenta?
 *
 * Vive acá y no copiada en cada consumidor. Hay DOS que preguntan lo mismo —el
 * chequeo de este archivo y el contador de `lib/hardcodeo/contador.mjs`, que se
 * invoca desde `scripts/hardcodeo.mjs`— y antes cada uno hacía su propio
 * `w.test(linea)`. Dos implementaciones de la misma regla se separan el día que
 * una aprende algo que la otra no: con las excepciones scopeadas por archivo, la
 * que no se enterara del `archivo` las aplicaría en todo el repo.
 *
 * `ruta` va relativa a la raíz y con barras normales.
 */
function estaExento(linea, ruta) {
  return exentoSegun(WHITELIST, linea, ruta);
}

// ── Escanear archivos ────────────────────────────────────────
// Además de las pantallas, se revisan los componentes de caja: son piezas de
// pantalla completa (grillas, cifras, pasos) y un color fijo ahí se ve mal en la
// mitad de los temas igual que si estuviera en la página.
const ROOTS = [
  path.resolve(__dirname, "..", "app", "modulos"),
  path.resolve(__dirname, "..", "components", "caja"),
];

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(full));
    } else if (entry.isFile() && /\.(jsx|tsx|js|ts)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

module.exports = { FORBIDDEN, WHITELIST, ROOTS, walk, estaExento, exentoSegun };

// Requerido desde otro script: solo se exportan los patrones, no se corre nada.
if (require.main !== module) return;

const files = ROOTS.filter((r) => fs.existsSync(r)).flatMap((r) => walk(r));
const violations = [];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // skip comments
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;

    const rel = path.relative(path.resolve(__dirname, ".."), file).replace(/\\/g, "/");

    for (const pattern of FORBIDDEN) {
      if (!pattern.test(line)) continue;

      // La ruta va SIEMPRE: las excepciones scopeadas por archivo no se pueden
      // resolver sin ella, y `estaExento` falla cerrado si no la recibe.
      if (estaExento(line, rel)) continue;

      violations.push({ file: rel, line: i + 1, text: line.trim(), pattern: pattern.source });
      break; // one violation per line is enough
    }
  }
}

// ── Resultado ────────────────────────────────────────────────
if (violations.length === 0) {
  console.log("✓ check-theme-tokens: 0 tokens hardcodeados encontrados.");
  process.exit(0);
} else {
  console.error(`✗ check-theme-tokens: ${violations.length} token(s) hardcodeado(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}\n`);
  }
  process.exit(1);
}
