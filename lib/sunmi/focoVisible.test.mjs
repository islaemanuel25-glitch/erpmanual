// EL FOCO DE TECLADO TIENE QUE VERSE, Y NADIE PUEDE VOLVER A APAGARLO DESDE UNA
// REGLA GLOBAL.
//
// ── QUÉ DEFECTO CIERRA ────────────────────────────────────────────────────
//
// Hasta el 2026-09-07 `app/globals.css` traía dos reglas, del commit inicial y
// sin motivo escrito en ningún lado:
//
//     *:focus { outline: none; }
//
//     input:not([type="date"]):focus, select:focus, button:focus {
//       outline: none !important;
//       box-shadow: none !important;
//     }
//
// Entre las dos dejaban la aplicación **sin foco de teclado**. Medido con un
// navegador de verdad sobre nueve familias, cuatro temas y dos anchos: SIETE DE
// NUEVE no mostraban ninguna señal al llegar con Tab.
//
// La segunda es la que destruía los contratos del kit. Las siete reglas de foco
// de `styles/sunmi.css` son de especificidad de clase y ninguna lleva
// `!important`, así que perdían contra ésta **aun estando después en la
// cascada** — lo confirmó el navegador vía `CSS.getMatchedStylesForNode`: la del
// kit aparecía en el índice 16 y la global en el 15, y ganaba la 15.
//
// La primera borraba el anillo que el navegador dibuja solo en las piezas que no
// tienen contrato propio: el botón nativo, los enlaces, la TarjetaOferta y el
// botón-enlace.
//
// ── POR QUÉ ESTE CANDADO NO EXIGE UN CSS TEXTUAL ──────────────────────────
//
// Lo que hay que proteger es el CONTRATO, no una redacción. Un candado que
// exigiera un texto exacto se pondría rojo con cualquier reordenamiento inocente
// y, peor, se quedaría verde si alguien escribe la misma supresión con otro
// selector. Por eso lo que se afirma es:
//
//   · que no exista ninguna supresión de foco de alcance global, escrita como
//     sea;
//   · que las piezas del kit que hoy tienen señal propia la sigan definiendo;
//   · que la señal de teclado del botón cuelgue de `:focus-visible` y no de
//     `:focus`, que es lo que impide que el mouse deje anillo.
//
// ── LO QUE ESTE CANDADO NO VE ─────────────────────────────────────────────
//
// No ve si la señal **se percibe**: eso son píxeles y lo mide
// `scripts/sonda-foco-boton.mjs --exigir` en el navegador. Acá se afirma que las
// reglas están y que nadie puso una supresión global; que el anillo tenga
// contraste suficiente sobre los catorce temas es otra pregunta, y tiene otra
// herramienta.
//
// Tampoco ve una supresión escrita en un tercer archivo CSS que hoy no existe.
// Mira las dos hojas que hay. Si mañana aparece una tercera, este candado sigue
// verde y no afirma nada sobre ella.

import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `import.meta.dirname` no existe en Node 18 y el proyecto todavía corre ahí.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GLOBALS = path.join(RAIZ, "app/globals.css");
const KIT = path.join(RAIZ, "styles/sunmi.css");

const leer = (p) => {
  const t = fs.readFileSync(p, "utf8");
  // Los comentarios se sacan ANTES de mirar. Es el defecto que ya se cobró tres
  // candados en este proyecto, y acá pica seguro: el bloque que reemplazó a las
  // reglas borradas las TRANSCRIBE para explicar qué se fue. Sin esta línea,
  // este candado encontraría su propia documentación y daría rojo para siempre.
  return t.replace(/\/\*[\s\S]*?\*\//g, "");
};

const globals = leer(GLOBALS);
const kit = leer(KIT);
const hoja = globals + "\n" + kit;

// Cada regla de la hoja, como { selector, cuerpo }. Alcanza con esto: no hay
// anidamiento en ninguna de las dos, comprobado.
function reglas(css) {
  const salida = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    salida.push({ selector: m[1].trim().replace(/\s+/g, " "), cuerpo: m[2] });
  }
  return salida;
}

const apagaFoco = (cuerpo) =>
  /outline\s*:\s*(none|0)/i.test(cuerpo) || /box-shadow\s*:\s*none/i.test(cuerpo);

// Un selector es de ALCANCE GLOBAL si toca elementos por su tipo o por el
// universal, sin exigir ninguna clase. `.sunmi-btn:focus` no lo es; `button:focus`
// y `*:focus` sí, y también lo sería `[type="text"]:focus` o `:where(button):focus`.
const esGlobal = (selector) =>
  selector
    .split(",")
    .map((s) => s.trim())
    .some((s) => /:focus(-visible|-within)?\b/.test(s) && !/[.#]/.test(s));

test("A · no existe ningún reset universal de foco", () => {
  const universales = reglas(hoja).filter(
    (r) => /^\*?:focus(-visible|-within)?$/.test(r.selector) && apagaFoco(r.cuerpo)
  );
  assert.deepEqual(
    universales.map((r) => r.selector),
    [],
    "volvió un '*:focus { outline: none }': eso deja sin foco a todas las piezas que no tienen contrato propio"
  );
});

test("B · no existe un bloque global sobre input/select/button que apague el foco", () => {
  const culpables = reglas(hoja).filter((r) => esGlobal(r.selector) && apagaFoco(r.cuerpo));
  assert.deepEqual(
    culpables.map((r) => r.selector),
    [],
    "una regla de foco sin clase apaga outline o box-shadow: eso le gana a los contratos del kit y los deja mudos"
  );
});

test("C · la supresión global no vuelve escrita con otro selector", () => {
  // El mismo daño con otra ropa: `:where(button):focus`, `[type]:focus`,
  // `:is(input, select):focus`. La afirmación B ya los cubre porque ninguno
  // lleva clase; este candado deja el caso escrito para que se entienda que la
  // prohibición es del ALCANCE y no de tres selectores concretos.
  for (const disfraz of [":where(button):focus", ':is(input, select):focus', '[type="text"]:focus']) {
    assert.equal(esGlobal(disfraz), true, `'${disfraz}' tiene que contar como global`);
  }
  assert.equal(esGlobal(".sunmi-btn:focus-visible"), false, "una regla del kit NO es global");
  assert.equal(esGlobal(".sunmi-input:focus"), false, "una regla del kit NO es global");
});

test("D · SunmiButton conserva su contrato de focus-visible", () => {
  const r = reglas(kit).find((x) => x.selector === ".sunmi-btn:focus-visible");
  assert.ok(r, "se fue '.sunmi-btn:focus-visible': el botón se queda sin señal de teclado");
  assert.match(
    r.cuerpo,
    /box-shadow\s*:\s*0 0 0 2px/,
    "el contrato del botón perdió su anillo"
  );
  // Y tiene que ser `:focus-visible`, no `:focus`. Con `:focus` el anillo de
  // teclado aparecería también al clickear con el mouse, que es justo lo que no
  // se quiere. Medido: con este contrato, el click deja `:focus-visible` en
  // falso y el botón conserva su sombra ambiental, sin anillo.
  assert.equal(
    reglas(kit).some((x) => x.selector === ".sunmi-btn:focus" && /box-shadow\s*:\s*0 0 0/.test(x.cuerpo)),
    false,
    "el anillo del botón pasó a ':focus': con el mouse va a dejar anillo de teclado"
  );
});

test("E · los controles del kit con señal propia la siguen definiendo", () => {
  // Los que la medición mostró con anillo propio. Si alguno pierde su regla, se
  // queda sin señal Y sin el anillo del navegador, porque su contrato lo apaga.
  const conSenal = [
    ".sunmi-input:focus",
    ".sunmi-textarea:focus",
    ".sunmi-select-native:focus",
    ".sunmi-select-trigger:focus",
    ".sunmi-btn-primary:focus",
    ".sunmi-btn-secondary:focus",
  ];
  const faltan = conSenal.filter((sel) => {
    const r = reglas(kit).find((x) => x.selector === sel);
    return !r || !/box-shadow\s*:\s*0 0 0/.test(r.cuerpo);
  });
  assert.deepEqual(faltan, [], "estos contratos perdieron su anillo de foco");
});

test("E bis · ninguna pieza del kit apaga su contorno sin dar otra señal", () => {
  // La regla que evita el doble indicador es legítima: el kit apaga el contorno
  // del navegador porque pone el suyo. Lo que NO puede pasar es que apague el
  // contorno y no ponga nada, porque ahí la pieza queda muda y encima ya no
  // hereda el anillo nativo.
  const mudas = reglas(kit)
    .filter((r) => /:focus(-visible)?$/.test(r.selector) && /outline\s*:\s*none/i.test(r.cuerpo))
    .filter((r) => !/box-shadow\s*:\s*0 0 0/.test(r.cuerpo) && !/border-color/.test(r.cuerpo));
  assert.deepEqual(
    mudas.map((r) => r.selector),
    [],
    "estas piezas apagan el contorno nativo sin ofrecer ninguna señal a cambio"
  );
});

test("F · la sonda de navegador exige estado estable, no una lectura en transición", () => {
  // El falso verde más caro de esta tanda: `.sunmi-btn` transiciona `box-shadow`
  // durante 150 ms, la sonda leía a los 25, y la sombra ambiental agonizando
  // hacia `none` se informaba como anillo de foco. Si alguien saca la espera, el
  // candado del navegador vuelve a poder dar verde sobre un botón mudo.
  const sonda = fs.readFileSync(path.join(RAIZ, "scripts/sonda-foco-boton.mjs"), "utf8");
  assert.match(
    sonda,
    /getAnimations\(\)\.length > 0/,
    "la sonda dejó de esperar a que terminen las transiciones antes de leer"
  );
  assert.match(
    sonda,
    /awaitPromise/,
    "la lectura estable es asíncrona: sin awaitPromise devuelve una promesa y no un valor"
  );
});
