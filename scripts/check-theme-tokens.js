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
  // son del documento imprimible del turno y van declarados abajo uno por uno,
  // así que la cifra que queda es 294 y los 8 nuevos son deuda de verdad.
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
// combinación en los 300 archivos de interfaz; scopeada al documento del turno,
// exime los ocho rótulos de esa hoja y nada más.
//
// `lineas` es la cantidad de líneas que la excepción cubre HOY, medida. La
// comprueba `lib/hardcodeo/excepcionesDeclaradas.test.mjs`: si una excepción
// empieza a cubrir más líneas que las declaradas, se pone rojo. Sin eso, una
// excepción escrita para ocho rótulos se estira sola y perdona en bloque sin que
// nadie se entere — que es exactamente lo que no se quería.
const TURNO = /^app\/modulos\/auditoria-pos-ventas\/turnos\/\[id\]\/page\.jsx$/;

const WHITELIST = [
  /text-slate-900\/80/,   // dark text on bright SunmiHeader
  /text-slate-900\/70/,   // idem

  // ── EL DOCUMENTO IMPRIMIBLE DEL DETALLE DE TURNO ─────────────────────────
  //
  // Los 23 grises de esta pantalla son fijos A PROPÓSITO y no son deuda. Esa
  // tarjeta no es una pantalla que sigue al tema: es una HOJA DE PAPEL. Nace en
  // `bg-white text-gray-900` y se imprime, así que tiene que salir igual desde
  // cualquiera de los catorce temas. Un token ahí adentro es el defecto, no la
  // solución — ya pasó con el recuadro de caja, que leía `--card-bg` y en los
  // cinco temas oscuros dejaba los números en 1,03:1.
  //
  // Cada una va con su rol y su motivo. El tono de los grises de texto salió de
  // medir contra los tres fondos de la tarjeta; está en el comentario del JSX.
  { archivo: TURNO, lineas: 1, linea: /bg-white text-gray-900 rounded-2xl/,
    motivo: "la hoja de papel en sí: fondo blanco y texto negro fijos, y el borde que la recorta en pantalla" },
  { archivo: TURNO, lineas: 1, linea: /border-b-2 border-gray-800 pb-5/,
    motivo: "la línea gruesa bajo el encabezado del documento" },
  { archivo: TURNO, lineas: 1, linea: /text-sm text-gray-500 mt-1/,
    motivo: "el subtítulo de vendedor y fecha; 4,83:1 sobre el blanco, medido" },
  { archivo: TURNO, lineas: 8, linea: /text-\[10px\] text-gray-600 uppercase tracking-wider/,
    motivo: "los ocho rótulos de los datos del turno y del recuadro de caja; gray-600 es el primer tono que pasa 4,5:1 también sobre el gray-100 del recuadro" },
  { archivo: TURNO, lineas: 1, linea: /border border-gray-900 rounded-xl p-4 bg-gray-100/,
    motivo: "el recuadro de caja, que dejó de leer el tema; tiene su propio candado en lib/auditoria-pos-ventas/documentoDeTurnoFijo.test.mjs" },
  { archivo: TURNO, lineas: 1, linea: /uppercase tracking-wider text-gray-500 mb-3/,
    motivo: "el título de la sección de detalle de ventas" },
  { archivo: TURNO, lineas: 1, linea: /border-b-2 border-gray-800 text-\[10px\]/,
    motivo: "el encabezado de la tabla del documento, con su línea gruesa" },
  { archivo: TURNO, lineas: 1, linea: /border-b border-gray-200 hover:bg-gray-50/,
    motivo: "la fila de la tabla: su raya y el gray-50 del hover, que en papel no se imprime" },
  { archivo: TURNO, lineas: 1, linea: /font-mono text-xs text-gray-500/,
    motivo: "la columna del número de ticket, atenuada a propósito" },
  { archivo: TURNO, lineas: 4, linea: /tabular-nums text-gray-600/,
    motivo: "las cuatro celdas de comisión y costo, cuerpo y pie; son plata y por eso subieron de gray-400 a gray-600" },
  { archivo: TURNO, lineas: 1, linea: /border-t-2 border-gray-800 font-bold/,
    motivo: "la línea gruesa sobre la fila de totales" },
  { archivo: TURNO, lineas: 1, linea: /text-center text-gray-600 py-8/,
    motivo: "el mensaje de turno sin ventas" },
  { archivo: TURNO, lineas: 1, linea: /border-t border-gray-200 text-\[10px\] text-gray-600/,
    motivo: "el pie del documento, con la fecha de generación" },
];

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
  return WHITELIST.some((w) => {
    if (w instanceof RegExp) return w.test(linea);
    if (!w.linea.test(linea)) return false;
    // Sin ruta no se puede afirmar el scope, así que NO se exime: falla cerrado.
    return typeof ruta === "string" && w.archivo.test(ruta);
  });
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

module.exports = { FORBIDDEN, WHITELIST, ROOTS, walk, estaExento };

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
