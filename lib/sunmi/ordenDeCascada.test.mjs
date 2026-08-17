// `sunmi.css` SE IMPORTA ANTES DE `@tailwind utilities`, Y ESO NO ES UN DETALLE.
//
// ── QUÉ DEFECTO CIERRA ESTE CANDADO ────────────────────────────────────────
//
// `SunmiButton` pone `.sunmi-btn-base` y `SunmiInput` pone `.sunmi-input`, las
// dos clases propias de `styles/sunmi.css`. Lo que las pantallas escriben encima
// —`py-3`, `px-3`, `text-xs`, `w-full`— son utilidades de Tailwind. Las dos
// familias tienen especificidad 0-1-0, así que **el orden del atributo no decide
// nada**: decide cuál de las dos reglas se escribió última en la hoja.
//
// Y eso lo decide una línea de `app/globals.css`:
//
//     @import "../styles/sunmi.css";     ← línea 6
//     @tailwind base;                    ← línea 11
//     @tailwind components;
//     @tailwind utilities;               ← línea 13
//
// `sunmi.css` va ANTES. Por eso gana la pantalla. Medido sobre la hoja que sirve
// el dev server el 2026-08-16: `.sunmi-input` en el byte 3.362, `.sunmi-btn-base`
// en el 4.598, `.px-3` en el 63.567 y `.py-3` en el 64.164.
//
// **No es una decisión declarada en ningún lado: es un orden de import.** El día
// que alguien mueva esa línea, las 388 declaraciones medidas del botón y las 147
// del input se dan vuelta EN SILENCIO. No rompe el build, no pone ningún otro
// candado en rojo, y no se ve hasta abrir las pantallas de a una: cada una que
// hoy define su tamaño de letra, su padding o su ancho pasaría a mostrar el del
// kit. Son 535 declaraciones colgando de dos líneas que nadie mira, y hasta hoy
// `git grep globals.css` en los `*.test.mjs` no devolvía nada.
//
// ── LO QUE ESTE CANDADO NO VE, ESCRITO CON TODAS LAS LETRAS ────────────────
//
// Es el barato de los dos, y su alcance termina en este archivo:
//
//   · **No ve un `@layer` agregado en otro archivo.** Una capa declarada en
//     cualquier CSS del proyecto reordena la cascada entera sin tocar estas dos
//     líneas, y acá seguiría todo verde.
//   · **No ve un cambio de motor.** En Tailwind v4 no existe `@tailwind
//     utilities` —se importa con `@import "tailwindcss"`— así que este candado
//     dejaría de encontrar lo que busca. Por eso FALLA CERRADO: si no encuentra
//     las dos marcas, ROJO. Un candado que no encuentra su marca y contesta verde
//     es peor que no tenerlo.
//   · **No ve nada del navegador.** No sabe si Turbopack respetó el orden, si el
//     `@import` se resolvió, ni qué padding termina midiendo un botón.
//
// Lo que sí ve todo eso es el otro, `scripts/sonda-cascada.mjs`, que mide el
// RESULTADO en el navegador. Los dos hacen falta y ninguno tapa al otro.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLOBALS = path.join(RAIZ, "app", "globals.css");
const SUNMI = path.join(RAIZ, "styles", "sunmi.css");

// SE SACAN LOS COMENTARIOS ANTES DE MIRAR.
//
// Este repo ya se comió tres candados por no hacerlo, y el peor de los tres fue
// un VERDE: el de `Escape` encontraba la palabra que buscaba dentro de un
// comentario tres líneas más arriba y pasaba con el chequeo real sacado. Acá el
// riesgo es concreto y está a la vista: `globals.css` tiene un bloque
// `/* ⭐ IMPORTAR ESTILOS SUNMI */` y otro `/* ⭐ TAILWIND BASE */` justo encima
// de las dos líneas que se miden. Alcanza con que alguien escriba el ejemplo al
// revés en un comentario para que el candado mida prosa.
export function sinComentarios(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Dónde cae cada marca en el CSS, ya sin comentarios.
 * Devuelve las POSICIONES de todas las apariciones, no la primera: si hay dos
 * `@tailwind utilities`, "el índice" no significa nada y hay que decirlo.
 */
export function marcasDeLaCascada(css) {
  const limpio = sinComentarios(css);

  const importaSunmi = [];
  for (const m of limpio.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)) {
    if (/(^|\/)sunmi\.css$/.test(m[1])) importaSunmi.push(m.index);
  }

  const utilidades = [];
  for (const m of limpio.matchAll(/@tailwind\s+utilities\s*;/g)) utilidades.push(m.index);

  return { importaSunmi, utilidades };
}

/**
 * El veredicto, como función pura para poder ejercerlo con texto de mentira.
 * `ok: false` con su motivo en cada forma de estar mal, incluidas las dos de
 * "no encontré la marca" — que son las que hacen que falle cerrado.
 */
export function veredicto(css) {
  const { importaSunmi, utilidades } = marcasDeLaCascada(css);

  if (importaSunmi.length === 0)
    return { ok: false, motivo: "no hay ningún @import de sunmi.css: el candado no puede afirmar nada" };
  if (importaSunmi.length > 1)
    return { ok: false, motivo: `sunmi.css se importa ${importaSunmi.length} veces: cuál gana depende de cuál quedó última` };
  if (utilidades.length === 0)
    return { ok: false, motivo: "no hay ningún @tailwind utilities: ¿cambió el motor? En Tailwind v4 esta marca no existe y este candado deja de servir" };
  if (utilidades.length > 1)
    return { ok: false, motivo: `@tailwind utilities aparece ${utilidades.length} veces` };

  if (importaSunmi[0] > utilidades[0])
    return {
      ok: false,
      motivo:
        `sunmi.css se importa DESPUÉS de @tailwind utilities (byte ${importaSunmi[0]} contra ${utilidades[0]}). ` +
        "A igual especificidad gana la última, así que las clases del kit le ganan a las utilidades: " +
        "las 535 declaraciones que las pantallas escriben sobre SunmiButton y SunmiInput dejan de aplicarse.",
    };

  return { ok: true, motivo: `sunmi.css en ${importaSunmi[0]}, @tailwind utilities en ${utilidades[0]}` };
}

test("app/globals.css importa sunmi.css ANTES de @tailwind utilities", () => {
  const v = veredicto(fs.readFileSync(GLOBALS, "utf8"));
  assert.ok(v.ok, v.motivo);
});

// LA PREMISA DEL CANDADO DE ARRIBA.
//
// Mirar el orden solo significa algo si las clases que se están protegiendo
// viven del lado que se importa. Si mañana `.sunmi-btn-base` se mudara a
// `globals.css` —debajo de las utilidades—, el orden del `@import` seguiría
// siendo el correcto y no protegería nada. Es la forma exacta del candado que
// mira el lugar equivocado, así que la premisa se afirma en vez de suponerse.
test("LA PREMISA: las dos clases del kit viven en styles/sunmi.css", () => {
  const sunmi = sinComentarios(fs.readFileSync(SUNMI, "utf8"));
  // `[,{]` Y NO SOLO `{`: el selector puede ser una LISTA. Este candado se puso
  // rojo el 2026-08-17 al partir la base del botón por eje, cuando la regla pasó
  // a ser `.sunmi-btn-base,\n.sunmi-btn-parte-alto {`. La clase seguía declarada
  // —la premisa se sostenía— y lo que estaba mal era el patrón. Es la tercera vez
  // el mismo día: le pasó igual a la espera de `sonda-cascada.mjs` y al lector de
  // colores de `SunmiButton.test.mjs`.
  assert.match(sunmi, /\.sunmi-btn-base\s*[,{]/, "`.sunmi-btn-base` ya no se declara en styles/sunmi.css");
  assert.match(sunmi, /\.sunmi-input\s*[,{]/, "`.sunmi-input` ya no se declara en styles/sunmi.css");

  // Y que no estén REDECLARADAS después de las utilidades, que es la única forma
  // de dar vuelta el resultado sin tocar la línea del `@import`.
  const globals = sinComentarios(fs.readFileSync(GLOBALS, "utf8"));
  const { utilidades } = marcasDeLaCascada(fs.readFileSync(GLOBALS, "utf8"));
  const despues = globals.slice(utilidades[0] ?? 0);
  assert.doesNotMatch(
    despues,
    /\.sunmi-btn-base\s*[,{]|\.sunmi-input\s*[,{]/,
    "una de las clases del kit se redeclara en globals.css DESPUÉS de @tailwind utilities: " +
      "ahí gana el kit y las declaraciones de las pantallas no se aplican"
  );
});

// ── CONTRAPRUEBA ───────────────────────────────────────────────────────────
//
// Un candado sobre un orden que nadie tocó nunca es exactamente el tipo que
// después no afirma nada: pasa siempre, y no se distingue de uno que funciona
// leyéndolo. Así que se le da vuelta el orden a propósito y se comprueba que se
// pone rojo, y que con el orden bueno está en verde.
//
// Esto se ejerce además contra el archivo REAL más abajo, editándolo. Estos casos
// de texto cubren las variantes que el archivo real no tiene hoy.

const BUENO = `
@import url('https://fonts.googleapis.com/css2?family=Inter');
@import "../styles/sunmi.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
:root { --app-bg: #000; }
`;

test("CONTRAPRUEBA: con el orden bueno, verde", () => {
  assert.equal(veredicto(BUENO).ok, true, veredicto(BUENO).motivo);
});

test("CONTRAPRUEBA: dado vuelta el orden, ROJO", () => {
  const dadoVuelta = `
@tailwind base;
@tailwind components;
@tailwind utilities;
@import "../styles/sunmi.css";
`;
  const v = veredicto(dadoVuelta);
  assert.equal(v.ok, false, "no vio la inversión: el candado no afirma nada");
  assert.match(v.motivo, /DESPUÉS de @tailwind utilities/);
});

test("CONTRAPRUEBA: FALLA CERRADO sin el @import — no verde", () => {
  const v = veredicto("@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
  assert.equal(v.ok, false, "sin la marca del import contestó verde, que es el modo mudo");
  assert.match(v.motivo, /no hay ningún @import de sunmi\.css/);
});

test("CONTRAPRUEBA: FALLA CERRADO sin @tailwind utilities — el caso de Tailwind v4", () => {
  // En v4 la hoja arranca con `@import "tailwindcss"` y `@tailwind utilities` no
  // existe. El candado tiene que ponerse rojo y decir que dejó de servir, no
  // contestar verde porque no encontró con qué comparar.
  const v4 = `@import "tailwindcss";\n@import "../styles/sunmi.css";\n`;
  const v = veredicto(v4);
  assert.equal(v.ok, false, "con el motor cambiado contestó verde sin haber mirado nada");
  assert.match(v.motivo, /cambió el motor/);
});

test("CONTRAPRUEBA: el candado no se come un comentario", () => {
  // El caso que ya se cobró tres candados en este repo. La línea buena está en el
  // archivo; la mala, en prosa. Sin sacar comentarios, el orden medido sería el
  // del comentario y el veredicto saldría rojo por nada.
  const conProsa = `
/* OJO: si esto quedara así —@tailwind utilities; antes del
   @import "../styles/sunmi.css";— se daría vuelta todo. */
@import "../styles/sunmi.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
`;
  const v = veredicto(conProsa);
  assert.equal(v.ok, true, `midió el comentario en vez del código: ${v.motivo}`);
});

test("CONTRAPRUEBA: dos @import de sunmi.css tampoco pasan", () => {
  const dosVeces = `
@import "../styles/sunmi.css";
@tailwind utilities;
@import "../styles/sunmi.css";
`;
  assert.equal(veredicto(dosVeces).ok, false, "con dos imports el índice del primero no decide nada");
});

test("EL CANDADO SABE MIRAR: encuentra las dos marcas en el archivo real", () => {
  // Sin esto, una expresión rota devolvería cero marcas y el candado principal se
  // pondría rojo por el motivo equivocado, o —peor— una futura versión indulgente
  // pasaría en verde sin haber leído nada.
  const { importaSunmi, utilidades } = marcasDeLaCascada(fs.readFileSync(GLOBALS, "utf8"));
  assert.equal(importaSunmi.length, 1, "no encontró exactamente un @import de sunmi.css en el archivo real");
  assert.equal(utilidades.length, 1, "no encontró exactamente un @tailwind utilities en el archivo real");
});
