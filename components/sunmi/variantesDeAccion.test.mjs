// LAS VARIANTES DE ACCIÓN GANAN POR EL ORDEN DE LA HOJA, Y ESO SE EXIGE.
//
// ── QUÉ PROTEGE ──────────────────────────────────────────────────────────
//
// `SunmiButton` arma su clase así:
//
//     `${baseDeBoton(className)} sunmi-btn-${color} ${className}`
//
// El `sunmi-btn-<color>` va SIEMPRE, aunque la pantalla pida una variante en
// `className`. Las dos reglas ponen `background` y las dos son una sola clase,
// así que tienen la MISMA especificidad: no decide el orden dentro del atributo
// —eso no lo mira nadie— sino el orden en `styles/sunmi.css`.
//
// Hoy las variantes están definidas después del bloque de colores y por eso
// ganan. Es la única razón por la que "✓ Coincide" se ve con contorno y no
// relleno de celeste, y no está escrita en ningún lado excepto acá.
//
// ── POR QUÉ ES UN CANDADO Y NO UN COMENTARIO ─────────────────────────────
//
// Porque el modo de fallar es mudo. Si alguien reordena la hoja —o agrega un
// color nuevo al final, que es lo natural— los botones con variante pasan a
// dibujarse con el color del componente. No rompe el build, no pone roja la
// suite, no tira ningún error: cambia de color y hay que estar mirando esa
// pantalla, en el teléfono, para verlo.
//
// Es exactamente la familia de defectos que CLAUDE.md tiene anotada en la regla
// 1 —"negocia el `className`, no lo concatena"—, con la diferencia de que acá la
// convivencia es deliberada y lo que se protege es que siga resolviéndose para
// el mismo lado.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// El mismo idioma que el resto de los candados del kit. `import.meta.dirname` no
// existe en el Node 18 con el que se corre la suite acá, y el reemplazo de la
// letra de unidad es por Windows, que es donde se escribió el original.
const RAIZ = path.resolve(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const css = readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8");

/**
 * Las variantes que conviven con un color y tienen que ganarle.
 *
 * Son las de nombre compuesto: el candado de `SunmiButton` lee
 * `.sunmi-btn-<una-sola-palabra>` como color, así que todo lo que tenga guion es
 * una variante que se pide por `className`.
 */
const VARIANTES = [...css.matchAll(/^\.sunmi-btn-([a-z]+-[a-z-]+)\s*[,{]/gm)]
  .map((m) => m[1])
  .filter((v) => !v.startsWith("parte-"));

/** Los colores de verdad, con el mismo criterio que usa el candado del botón. */
const COLORES = [...css.matchAll(/^\.sunmi-btn-([a-z]+)\s*[,{]/gm)]
  .map((m) => m[1])
  .filter((c) => c !== "base");

const posicionDe = (sufijo) => css.indexOf(`.sunmi-btn-${sufijo}`);

test("hay variantes de acción que defender", () => {
  // Si esto queda vacío el resto del archivo pasa sin afirmar nada — el candado
  // verde sobre un dato que no existe, que CLAUDE.md tiene anotado tres veces.
  assert.ok(VARIANTES.length > 0, "no se encontró ninguna variante `.sunmi-btn-<algo>-<algo>`");
  assert.ok(COLORES.length > 0, "no se encontró ningún color `.sunmi-btn-<algo>`");
});

test("las dos variantes que usa la tarjeta de recepción existen", () => {
  // Nombradas a mano a propósito: son las que el teléfono pide por `className`,
  // y un `className` que no existe en el CSS es un botón sin estilo que compila
  // igual. Es el defecto del "botón invisible" que ya pasó con `color="accent"`.
  assert.ok(VARIANTES.includes("accent-outline"), "falta `.sunmi-btn-accent-outline`");
  assert.ok(VARIANTES.includes("accent-soft"), "falta `.sunmi-btn-accent-soft`");
});

test("toda variante se define DESPUÉS de todos los colores", () => {
  const ultimoColor = Math.max(...COLORES.map(posicionDe));
  for (const v of VARIANTES) {
    assert.ok(
      posicionDe(v) > ultimoColor,
      `\`.sunmi-btn-${v}\` está definida ANTES de algún color: el color le va a ganar el fondo`
    );
  }
});
