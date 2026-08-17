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
// líneas dejó de ser una excepción declarada: se estiró sola. Sin este conteo,
// eso pasa sin que nadie se entere, que es exactamente la forma que tiene el
// perdón en bloque de entrar por la ventana.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { contarArchivo } from "@/lib/hardcodeo/contador";

const require_ = createRequire(import.meta.url);
const RAIZ = process.cwd();
const { FORBIDDEN, WHITELIST, estaExento } = require_(
  path.join(RAIZ, "scripts", "check-theme-tokens.js")
);

const TURNO = "app/modulos/auditoria-pos-ventas/turnos/[id]/page.jsx";
const fuenteDe = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

const estructuradas = WHITELIST.filter((w) => !(w instanceof RegExp));
const peladas = WHITELIST.filter((w) => w instanceof RegExp);

// ── 1. Los grises se persiguen ──────────────────────────────────────────────

// Los ocho patrones de gris, por su `source` EXACTO. No por subcadena: la primera
// versión de este test preguntaba si algún patrón CONTENÍA "text-gray-", y
// `placeholder:text-gray-` lo contiene. Sacando el `text-gray-` de verdad —el que
// agarra 20 de los 23 del documento del turno— el candado quedaba VERDE. Un falso
// verde, que es el peor final y no se distingue leyendo el test. Lo encontró la
// contraprueba de sacar el patrón a mano.
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

test("CONTRAPRUEBA · sin los patrones de gray, el documento del turno no aporta nada", () => {
  // Es lo que demuestra que son ESOS patrones los que agarran los 23, y no que
  // ya estuvieran contados por otro lado. Si esto diera igual con y sin gray, la
  // lista nueva no estaría haciendo nada.
  const sinGray = FORBIDDEN.filter((p) => !p.source.includes("gray-"));
  assert.ok(sinGray.length < FORBIDDEN.length, "no se quitó ningún patrón: la contraprueba no probó nada");

  const txt = fuenteDe(TURNO);
  // Sin excepciones, para aislar el efecto de los patrones.
  const sinNada = () => false;
  const conGray = contarArchivo(TURNO, txt, { patronesColor: FORBIDDEN, exentaColor: sinNada }).conteo.color;
  const sin = contarArchivo(TURNO, txt, { patronesColor: sinGray, exentaColor: sinNada }).conteo.color;
  assert.equal(conGray - sin, 23, "los patrones de gray tienen que agarrar exactamente los 23 del documento");
});

// ── 2. Las excepciones están declaradas, y con scope ────────────────────────

test("toda excepción estructurada trae archivo, línea, conteo y motivo", () => {
  assert.ok(estructuradas.length > 0, "no hay ninguna excepción scopeada por archivo");
  for (const w of estructuradas) {
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

test("CADA EXCEPCIÓN CUBRE EXACTAMENTE LAS LÍNEAS QUE DECLARA", () => {
  // Se mide contra el archivo real, sin comentarios, que es lo que el contador
  // mira. Si una se estira, acá se ve el número.
  const desvios = [];
  for (const w of estructuradas) {
    // Solo se sabe medir las que apuntan al documento del turno; si mañana hay
    // otra pantalla, este test tiene que aprender a leerla en vez de saltearla.
    assert.ok(w.archivo.test(TURNO), `esta excepción no apunta al único archivo que este candado sabe leer: ${w.linea}`);
    const lineas = fuenteDe(TURNO)
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*"))
      .filter((l) => w.linea.test(l));
    if (lineas.length !== w.lineas) {
      desvios.push(`${w.linea} declara ${w.lineas} y cubre ${lineas.length}`);
    }
  }
  assert.deepEqual(desvios, [], `excepciones que se movieron:\n        ${desvios.join("\n        ")}`);
});

test("las 23 del documento del turno quedan todas cubiertas: no aporta ni una", () => {
  const txt = fuenteDe(TURNO);
  const sinGray = FORBIDDEN.filter((p) => !p.source.includes("gray-"));
  const conTodo = contarArchivo(TURNO, txt, { patronesColor: FORBIDDEN, exentaColor: estaExento }).conteo.color;
  const base = contarArchivo(TURNO, txt, { patronesColor: sinGray, exentaColor: estaExento }).conteo.color;
  assert.equal(
    conTodo,
    base,
    "agregar gray no tiene que sumarle nada a esta pantalla: sus 23 grises están declarados uno por uno"
  );
});

// ── 3. El scope es de verdad ────────────────────────────────────────────────

test("LA MISMA LÍNEA EN OTRO ARCHIVO SÍ SE CUENTA", () => {
  // Es la razón de ser del scope. Si esto fallara, las excepciones del turno
  // estarían perdonando el repo entero y el candado no lo notaría.
  const linea = '<div className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Apertura</div>';
  assert.equal(estaExento(linea, TURNO), true, "en su propio archivo tiene que estar exenta");
  assert.equal(
    estaExento(linea, "app/modulos/productos/page.jsx"),
    false,
    "en otro archivo NO puede estar exenta"
  );
});

test("sin ruta, falla CERRADO: no exime", () => {
  const linea = '<div className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">Apertura</div>';
  assert.equal(estaExento(linea, undefined), false);
  assert.equal(estaExento(linea, null), false);
});

test("las regex peladas siguen valiendo en cualquier archivo", () => {
  // Compatibilidad: las dos que ya estaban son del kit y no se scopearon.
  assert.ok(peladas.length >= 2, "desaparecieron las excepciones viejas");
  const linea = '<span className="text-slate-900/80">x</span>';
  assert.equal(estaExento(linea, "app/modulos/cualquiera/page.jsx"), true);
  assert.equal(estaExento(linea, "components/otra/cosa.jsx"), true);
});

test("CONTRAPRUEBA · un contador que no reciba la ruta perdonaría el repo entero", () => {
  // El defecto que el scope vino a evitar, ejercido. `contarArchivo` sin
  // `exentaColor` cae a probar las regex peladas, y las estructuradas quedan
  // afuera: por eso una línea del turno copiada a otra pantalla SÍ se cuenta.
  const linea = '        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-0.5">X</div>\n';
  const ajena = "app/modulos/productos/page.jsx";
  const conScope = contarArchivo(ajena, linea, { patronesColor: FORBIDDEN, exentaColor: estaExento }).conteo.color;
  assert.equal(conScope, 1, "en otra pantalla ese gris tiene que contarse");
  const enSuCasa = contarArchivo(TURNO, linea, { patronesColor: FORBIDDEN, exentaColor: estaExento }).conteo.color;
  assert.equal(enSuCasa, 0, "en el documento del turno está declarado y no se cuenta");
});
