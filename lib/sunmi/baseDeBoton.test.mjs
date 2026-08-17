// LA BASE DEL BOTÓN CEDE EL EJE QUE LA PANTALLA DECLARA, Y NINGUNO MÁS.
//
// ── QUÉ DEFECTO CIERRA ─────────────────────────────────────────────────────
//
// `SunmiButton` emitía `sunmi-btn-base` entero y concatenaba el `className` de
// la pantalla. Misma especificidad las dos, así que no decidía el orden del
// atributo sino el de la hoja — y las 391 declaraciones medidas de sus 248
// consumidores se aplicaban **solo porque `styles/sunmi.css` se importa antes
// que `@tailwind utilities`**.
//
// Con el eje negociado no hay pelea: la pieza no pone lo que la pantalla pidió.
//
// ── LO QUE ESTE CANDADO NO PUEDE VER ───────────────────────────────────────
//
// Que las sub-clases DIBUJEN lo mismo. Eso es del navegador y lo contesta
// `scripts/sonda-estilos.mjs`, que comparó las 606 propiedades calculadas.
// Acá se afirma sobre la CADENA que sale, que es lo que este módulo decide.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { etiquetasDeApertura } from "../hardcodeo/contador.js";

import {
  baseDeBoton,
  PARTES_DEL_BOTON,
  NUCLEO_DEL_BOTON,
} from "./claseNegociada.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSS = path.join(RAIZ, "styles", "sunmi.css");

const partesDe = (s) => s.trim().split(/\s+/);

test("SIN PEDIDO: salen el núcleo y las nueve partes", () => {
  const salida = partesDe(baseDeBoton(""));
  assert.equal(salida[0], NUCLEO_DEL_BOTON, "el núcleo va primero y va siempre");
  assert.equal(salida.length, PARTES_DEL_BOTON.length + 1);
  for (const { clase } of PARTES_DEL_BOTON) {
    assert.ok(salida.includes(clase), `falta ${clase} cuando la pantalla no pide nada`);
  }
});

// ── CADA EJE, UNO POR UNO, CON EL CASO REAL DEL CENSO ──────────────────────
//
// El token de cada fila salió del repo, no de la imaginación: es el más común de
// ese eje entre los 248 consumidores. Y cada caso comprueba las DOS mitades —que
// se caiga el suyo y que NO se caiga ningún otro—, porque un predicado
// demasiado ancho cede ejes que nadie pidió y eso mueve píxeles igual que no
// ceder el que sí.
const CASOS = [
  { eje: "sunmi-btn-parte-pad-y", pide: "py-3", nota: "135 declaraciones, el eje más peleado" },
  { eje: "sunmi-btn-parte-letra", pide: "text-xs", nota: "130" },
  { eje: "sunmi-btn-parte-peso", pide: "font-bold", nota: "43" },
  { eje: "sunmi-btn-parte-pad-x", pide: "px-3", nota: "43" },
  { eje: "sunmi-btn-parte-items", pide: "items-center", nota: "17, todas piden lo mismo que la pieza" },
  { eje: "sunmi-btn-parte-display", pide: "inline-flex", nota: "17" },
  { eje: "sunmi-btn-parte-alto", pide: "min-h-11", nota: "4, todas min-h-*" },
  { eje: "sunmi-btn-parte-radio", pide: "rounded-xl", nota: "1, ColumnManager" },
  { eje: "sunmi-btn-parte-cursor", pide: "cursor-not-allowed", nota: "1, AccionesTicket" },
];

for (const { eje, pide, nota } of CASOS) {
  test(`CEDE "${eje}" ante \`${pide}\` — y solo ése (${nota})`, () => {
    const salida = partesDe(baseDeBoton(pide));
    assert.ok(!salida.includes(eje), `no cedió ${eje} ante \`${pide}\``);
    for (const { clase } of PARTES_DEL_BOTON) {
      if (clase === eje) continue;
      assert.ok(salida.includes(clase), `\`${pide}\` se llevó puesto ${clase}, que nadie pidió`);
    }
    assert.ok(salida.includes(NUCLEO_DEL_BOTON), "el núcleo no cede nunca");
  });
}

test("LA TABLA CUBRE TODOS LOS EJES DEL CENSO", () => {
  // Sin esto, borrar una fila de la tabla deja su eje sin negociar y ningún caso
  // de arriba se entera — los casos recorren la tabla, así que se encogen con ella.
  assert.equal(PARTES_DEL_BOTON.length, CASOS.length, "hay ejes en la tabla sin caso, o al revés");
  const enTabla = new Set(PARTES_DEL_BOTON.map((p) => p.clase));
  for (const { eje } of CASOS) assert.ok(enTabla.has(eje), `${eje} no está en PARTES_DEL_BOTON`);
});

// ── LO QUE NO TIENE QUE CEDER ──────────────────────────────────────────────

test("`p-2` cede los DOS paddings, porque fija los cuatro lados", () => {
  const salida = partesDe(baseDeBoton("p-2"));
  assert.ok(!salida.includes("sunmi-btn-parte-pad-x"));
  assert.ok(!salida.includes("sunmi-btn-parte-pad-y"));
  assert.ok(salida.includes("sunmi-btn-parte-alto"), "`p-2` no tiene nada que ver con el alto");
});

test("UN `h-*` PELADO NO ES UNA DECLARACIÓN DE ALTO MÍNIMO", () => {
  // Es la distinción que decide todo este eje. `min-height` le gana a `height`
  // por regla de LAYOUT, no por cascada: un `h-8` no está peleando con el mínimo
  // y ceder el piso de 36 ante él cambiaría el dibujo de un botón que solo pidió
  // un alto. Ya pasó con `ColumnManager` y se resolvió sacando el `h-8`, después
  // de mirarlo, no cediendo por defecto.
  const salida = partesDe(baseDeBoton("h-8"));
  assert.ok(
    salida.includes("sunmi-btn-parte-alto"),
    "cedió el alto mínimo ante un `h-*`: el botón se quedaría sin su piso de 36"
  );
});

test("UNA DECLARACIÓN CON VARIANTE NO HACE CEDER", () => {
  // `sm:text-[13px]` pide un tamaño de `sm` para arriba. Ceder el default
  // incondicional por un pedido condicional dejaría al botón sin tamaño abajo de
  // `sm`. Hay una en el censo y es exactamente ésta.
  const salida = partesDe(baseDeBoton("sm:text-[13px]"));
  assert.ok(
    salida.includes("sunmi-btn-parte-letra"),
    "cedió la letra por una variante: abajo del breakpoint el botón se queda sin tamaño"
  );
});

test("LOS EJES QUE NO SON: `flex-col`, `font-mono`, `text-left`, `border-collapse`", () => {
  // Los cuatro empiezan como un eje y son otra propiedad. Un predicado por
  // prefijo —`/^flex/`, `/^font-/`— se los lleva puestos.
  for (const pide of ["flex-col", "flex-1", "font-mono", "text-left", "border-collapse"]) {
    const salida = partesDe(baseDeBoton(pide));
    assert.equal(
      salida.length,
      PARTES_DEL_BOTON.length + 1,
      `\`${pide}\` hizo ceder algún eje y no es ninguno: salió "${salida.join(" ")}"`
    );
  }
});

test("EL `!` NO CAMBIA DE QUÉ EJE ES EL TOKEN", () => {
  // Quedan 35 `!` a propósito sobre ejes que la pieza no declara, pero los que
  // caigan sobre un eje negociado tienen que hacer ceder igual: si no, quedarían
  // los dos y volvería la pelea que esto viene a sacar.
  assert.ok(!partesDe(baseDeBoton("!py-1")).includes("sunmi-btn-parte-pad-y"));
  assert.ok(!partesDe(baseDeBoton("!text-xs")).includes("sunmi-btn-parte-letra"));
});

// ── LA TABLA CONTRA EL CSS ─────────────────────────────────────────────────

test("CADA SUB-CLASE DE LA TABLA EXISTE EN styles/sunmi.css", () => {
  // Una fila que nombre una clase que el CSS no define hace que la pieza CEDA un
  // eje y no ponga nada en su lugar — el botón perdería esa propiedad y nadie lo
  // vería hasta abrir la pantalla. Es JSX contra CSS: no hay compilador que ate
  // los dos lados.
  const css = fs.readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const clase of [NUCLEO_DEL_BOTON, ...PARTES_DEL_BOTON.map((p) => p.clase)]) {
    assert.match(
      css,
      new RegExp(`\\.${clase}\\s*[,{]`),
      `la tabla nombra \`${clase}\` y styles/sunmi.css no la define`
    );
  }
});

test("Y EL CSS NO DEFINE PARTES QUE LA TABLA NO CONOZCA", () => {
  // El otro sentido. Una sub-clase huérfana en el CSS es un eje que se partió y
  // que la pieza nunca emite: la base quedaría incompleta y el botón perdería esa
  // propiedad.
  const css = fs.readFileSync(CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const enCss = new Set([...css.matchAll(/\.(sunmi-btn-parte-[a-z-]+)\s*[,{:]/g)].map((m) => m[1]));
  const enTabla = new Set([NUCLEO_DEL_BOTON, ...PARTES_DEL_BOTON.map((p) => p.clase)]);
  const huerfanas = [...enCss].filter((c) => !enTabla.has(c));
  assert.deepEqual(huerfanas, [], "el CSS define partes que la pieza nunca emite");
  assert.ok(enCss.size >= enTabla.size, `el CSS solo define ${enCss.size} partes de ${enTabla.size}`);
});

// ── EL ÚNICO HUECO LATENTE QUE ENCONTRÓ LA VERIFICACIÓN ────────────────────
//
// **`.sunmi-btn-parte-radio` aporta OCHO propiedades** —las cuatro esquinas
// físicas y sus cuatro alias lógicos—, medido con `scripts/sonda-estilos.mjs`
// contra un elemento pelado. Un `rounded-xl` repone las ocho, así que hoy no se
// pierde nada: es el único token de ese eje en el repo y la medición dio 606 de
// 606 idénticas.
//
// Pero un `rounded-t-lg` repondría **cuatro de las ocho**, y las otras cuatro
// esquinas caerían de 5,25 px a 0 sin que nada avise. Es la misma forma que el
// `theme.card` de `SunmiPanel`, donde ceder la cadena entera se llevaba un borde
// que nadie había pedido.
//
// No se cambió el predicado, porque hoy no hay ni un caso y una rama sin ejercer
// es una defensa inalcanzable. Lo que sí se pone es este candado: el día que
// alguien escriba el primer `rounded-<lado>-*` sobre un `SunmiButton`, la suite
// se pone roja y ahí se parte el eje en cuatro esquinas o se acota el predicado,
// con el caso real a la vista.
test("NINGÚN CONSUMIDOR DECLARA UN RADIO PARCIAL, que cedería ocho esquinas y repondría cuatro", () => {
  const archivos = execSync("git ls-files app components", { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.endsWith(".jsx"));

  const PARCIAL = /\brounded-(t|b|l|r|s|e|tl|tr|bl|br|ss|se|ee|es)-/;
  const malos = [];
  let conBoton = 0;
  for (const rel of archivos) {
    const texto = fs.readFileSync(path.join(RAIZ, rel), "utf8");
    if (!texto.includes("<SunmiButton")) continue;
    conBoton += 1;
    for (const { texto: tag } of etiquetasDeApertura(texto, "SunmiButton")) {
      const m = tag.match(PARCIAL);
      if (m) malos.push(`${rel} -> ${m[0]}…`);
    }
  }
  assert.deepEqual(
    malos,
    [],
    "un SunmiButton declara un radio de un solo lado. La pieza cede las OCHO esquinas y " +
      "ese token repone cuatro: las otras cuatro se pierden. Partí el eje o acotá `declaraRadio`.\n  " +
      malos.join("\n  ")
  );

  // Que haya mirado algo: si el enumerado se rompe, la lista queda vacía y esto
  // pasa sin haber leído un solo archivo. Los dos números salen de MEDIR el repo
  // el 2026-08-17 —304 `.jsx` bajo `app` y `components`, 149 con `<SunmiButton`—
  // y no de estimarlos: el primer umbral se escribió a ojo en 400 y puso el
  // candado rojo por nada.
  assert.ok(archivos.length > 250, `solo enumeró ${archivos.length} .jsx: revisá el comando`);
  assert.ok(conBoton > 100, `solo ${conBoton} archivos con <SunmiButton: el patrón no está llegando`);
});

// ── QUE EL COMPONENTE LA USE ───────────────────────────────────────────────

test("SunmiButton NO EMITE `sunmi-btn-base` Y SÍ LLAMA A `baseDeBoton`", () => {
  // Las dos mitades. Sin la primera, la base entera volvería y la negociación no
  // serviría de nada; sin la segunda, el botón se quedaría sin base.
  const fuente = fs
    .readFileSync(path.join(RAIZ, "components", "sunmi", "SunmiButton.jsx"), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  assert.doesNotMatch(fuente, /sunmi-btn-base/, "el componente volvió a emitir la base entera");
  assert.match(fuente, /baseDeBoton\(\s*className\s*\)/, "el componente no está negociando");
});
