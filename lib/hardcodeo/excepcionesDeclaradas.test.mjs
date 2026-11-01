// LOS GRISES SE CUENTAN, Y LAS EXCEPCIONES ESTÁN DECLARADAS Y NO PERDONAN EN BLOQUE.
//
// ── LAS DOS COSAS QUE ESTE CANDADO SOSTIENE ─────────────────────────────────
//
// 1. Que `gray` esté en la lista de patrones perseguidos. Faltaba, y el agujero
//    se destapó arreglando el detalle de turno: catorce clases de gris que
//    decidían si un número se leía o no, y el contador no veía ninguna.
//
// 2. Que las excepciones de una pantalla NO eximan al repo entero. Antes la
//    whitelist era una lista de regex sobre la LÍNEA, sin archivo: declarar
//    `text-[10px] text-gray-600 uppercase` para los ocho rótulos del documento
//    del turno habría eximido esa combinación en los 300 archivos de interfaz.
//
// ── Y LA TERCERA, QUE ES LA QUE EVITA EL PERDÓN SILENCIOSO ──────────────────
//
// Cada excepción declara CUÁNTAS líneas cubre. Acá se comprueba contra el archivo
// de verdad. Una excepción escrita para ocho rótulos que mañana cubre catorce
// líneas dejó de ser una excepción declarada: se estiró sola.
//
// ── POR QUÉ EL SCOPE SE EJERCE CON UNA EXCEPCIÓN DE PRUEBA ──────────────────
//
// Las 13 excepciones scopeadas que había eran todas del documento imprimible del
// detalle de turno de Auditoría POS, que se borró el 2026-11-01 (turnos y cajas
// viven en /modulos/turnos-y-cierres). Hoy la whitelist real no tiene ninguna
// scopeada, así que un candado montado sobre ella no ejercería la rama del
// archivo. Por eso la regla está en una función pura, `exentoSegun`, y acá se la
// ejerce con UNA excepción de prueba que tiene la forma exacta de las que había
// —copiada de la que cubría los ocho rótulos— apuntando a un archivo inventado.
// Lo que se prueba es la regla, no el contenido de un archivo.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { contarArchivo } from "@/lib/hardcodeo/contador";

const require_ = createRequire(import.meta.url);
const RAIZ = process.cwd();
const { FORBIDDEN, WHITELIST, estaExento, exentoSegun } = require_(
  path.join(RAIZ, "scripts", "check-theme-tokens.js")
);

const estructuradas = WHITELIST.filter((w) => !(w instanceof RegExp));
const peladas = WHITELIST.filter((w) => w instanceof RegExp);

// La forma de la excepción scopeada que existió, con su archivo cambiado.
const HOJA = "app/modulos/hoja-de-prueba/page.jsx";
const DE_PRUEBA = {
  archivo: /^app\/modulos\/hoja-de-prueba\/page\.jsx$/,
  lineas: 8,
  linea: /text-\[10px\] text-gray-600 uppercase tracking-wider/,
  motivo: "los ocho rótulos de los datos del turno y del recuadro de caja",
};
const LISTA_DE_PRUEBA = [...peladas, DE_PRUEBA];
const LINEA = '<div className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Apertura</div>';

// ── 1. Los grises se persiguen ──────────────────────────────────────────────

// Los ocho patrones de gris, por su `source` EXACTO. No por subcadena: la primera
// versión de este test preguntaba si algún patrón CONTENÍA "text-gray-", y
// `placeholder:text-gray-` lo contiene. Sacando el `text-gray-` de verdad el
// candado quedaba VERDE. Un falso verde, que es el peor final y no se distingue
// leyendo el test. Lo encontró la contraprueba de sacar el patrón a mano.
const GRISES_ESPERADOS = [
  "\\btext-gray-",
  "\\bbg-gray-",
  "\\bborder-gray-",
  "\\bhover:bg-gray-",
  "\\bhover:text-gray-",
  "\\bring-gray-",
  "\\bdivide-gray-",
  "\\bplaceholder:text-gray-",
];

test("los ocho patrones de gray están en la lista, cada uno por su cuenta", () => {
  const fuentes = new Set(FORBIDDEN.map((p) => p.source));
  const faltan = GRISES_ESPERADOS.filter((s) => !fuentes.has(s));
  assert.deepEqual(
    faltan,
    [],
    `faltan estos patrones en FORBIDDEN de scripts/check-theme-tokens.js: ${faltan.join(", ")}`
  );
});

test("CONTRAPRUEBA · sacar UNO solo de los ocho se nota", () => {
  // Se ejerce el caso que dejó verde a la primera versión: quitar `text-gray-`
  // dejando `placeholder:text-gray-`, que lo contiene como subcadena.
  const mutilado = new Set(FORBIDDEN.map((p) => p.source));
  mutilado.delete("\\btext-gray-");
  assert.ok(mutilado.has("\\bplaceholder:text-gray-"), "el patrón que confundía sigue ahí");
  const faltan = GRISES_ESPERADOS.filter((s) => !mutilado.has(s));
  assert.deepEqual(faltan, ["\\btext-gray-"], "tiene que nombrar exactamente el que falta");
});

test("CONTRAPRUEBA · sin los patrones de gray, una línea gris no se cuenta", () => {
  // Demuestra que son ESOS patrones los que agarran el gris, y no que ya
  // estuviera contado por otro lado.
  const sinGray = FORBIDDEN.filter((p) => !p.source.includes("gray-"));
  assert.ok(sinGray.length < FORBIDDEN.length, "no se quitó ningún patrón: la contraprueba no probó nada");
  const txt = `        ${LINEA}\n`;
  const sinNada = () => false;
  const conGray = contarArchivo(HOJA, txt, { patronesColor: FORBIDDEN, exentaColor: sinNada }).conteo.color;
  const sin = contarArchivo(HOJA, txt, { patronesColor: sinGray, exentaColor: sinNada }).conteo.color;
  assert.equal(conGray, 1, "con gray la línea se cuenta");
  assert.equal(sin, 0, "sin gray no la ve nadie");
});

// ── 2. Las excepciones están declaradas, y con scope ────────────────────────

test("toda excepción estructurada trae archivo, línea, conteo y motivo", () => {
  // Hoy la lista real no tiene ninguna; se valida igual, más la de prueba, para
  // que la primera que se agregue entre con la forma completa.
  for (const w of [...estructuradas, DE_PRUEBA]) {
    assert.ok(w.archivo instanceof RegExp, `una excepción sin \`archivo\`: ${w.linea}`);
    assert.ok(w.linea instanceof RegExp, `una excepción sin \`linea\`: ${w.motivo}`);
    assert.equal(typeof w.lineas, "number", `una excepción sin \`lineas\`: ${w.linea}`);
    assert.ok(w.lineas > 0, `una excepción con \`lineas\` en cero: ${w.linea}`);
    assert.ok(
      typeof w.motivo === "string" && w.motivo.trim().length >= 25,
      `el motivo de ${w.linea} es demasiado corto para ser un motivo: ${JSON.stringify(w.motivo)}`
    );
  }
});

test("CADA EXCEPCIÓN REAL CUBRE EXACTAMENTE LAS LÍNEAS QUE DECLARA", () => {
  // Se mide contra los archivos reales que el `archivo` de cada una nombra, sin
  // comentarios, que es lo que el contador mira. Una excepción cuyo archivo ya
  // no existe también es un desvío: perdona algo que no está.
  const archivos = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app", "components"],
    { cwd: RAIZ, encoding: "utf8" }
  ).split("\n").filter(Boolean);
  const desvios = [];
  for (const w of estructuradas) {
    const suyos = archivos.filter((a) => w.archivo.test(a));
    if (suyos.length === 0) {
      desvios.push(`${w.linea} apunta a un archivo que no existe (${w.archivo})`);
      continue;
    }
    const lineas = suyos.flatMap((a) =>
      fs.readFileSync(path.join(RAIZ, a), "utf8")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
        .filter((l) => w.linea.test(l))
    );
    if (lineas.length !== w.lineas) {
      desvios.push(`${w.linea} declara ${w.lineas} y cubre ${lineas.length}`);
    }
  }
  assert.deepEqual(desvios, [], `excepciones que se movieron:\n        ${desvios.join("\n        ")}`);
});

// ── 3. El scope es de verdad ────────────────────────────────────────────────

test("LA MISMA LÍNEA EN OTRO ARCHIVO SÍ SE CUENTA", () => {
  // Es la razón de ser del scope. Si esto fallara, las excepciones de una hoja
  // estarían perdonando el repo entero y el candado no lo notaría.
  assert.equal(exentoSegun(LISTA_DE_PRUEBA, LINEA, HOJA), true, "en su propio archivo tiene que estar exenta");
  assert.equal(
    exentoSegun(LISTA_DE_PRUEBA, LINEA, "app/modulos/productos/page.jsx"),
    false,
    "en otro archivo NO puede estar exenta"
  );
});

test("sin ruta, falla CERRADO: no exime", () => {
  assert.equal(exentoSegun(LISTA_DE_PRUEBA, LINEA, undefined), false);
  assert.equal(exentoSegun(LISTA_DE_PRUEBA, LINEA, null), false);
});

test("las regex peladas siguen valiendo en cualquier archivo", () => {
  // Compatibilidad: las dos que ya estaban son del kit y no se scopearon.
  assert.ok(peladas.length >= 2, "desaparecieron las excepciones viejas");
  const linea = '<span className="text-slate-900/80">x</span>';
  assert.equal(estaExento(linea, "app/modulos/cualquiera/page.jsx"), true);
  assert.equal(estaExento(linea, "components/otra/cosa.jsx"), true);
});

test("estaExento es exentoSegun sobre la lista real, no una copia", () => {
  // Si `estaExento` volviera a tener su propia implementación, los candados del
  // scope probarían una regla que el contador no usa.
  const fuente = fs.readFileSync(path.join(RAIZ, "scripts", "check-theme-tokens.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  assert.match(fuente, /function estaExento\(linea, ruta\) \{\s*return exentoSegun\(WHITELIST, linea, ruta\);\s*\}/);
});

test("CONTRAPRUEBA · un contador que no reciba la ruta perdonaría el repo entero", () => {
  // El defecto que el scope vino a evitar, ejercido con la lista de prueba.
  const linea = `        ${LINEA}\n`;
  const exenta = (l, r) => exentoSegun(LISTA_DE_PRUEBA, l, r);
  const ajena = "app/modulos/productos/page.jsx";
  const conScope = contarArchivo(ajena, linea, { patronesColor: FORBIDDEN, exentaColor: exenta }).conteo.color;
  assert.equal(conScope, 1, "en otra pantalla ese gris tiene que contarse");
  const enSuCasa = contarArchivo(HOJA, linea, { patronesColor: FORBIDDEN, exentaColor: exenta }).conteo.color;
  assert.equal(enSuCasa, 0, "en su hoja está declarado y no se cuenta");
});
