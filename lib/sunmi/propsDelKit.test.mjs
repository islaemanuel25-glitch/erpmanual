// UN PROP QUE EL COMPONENTE NO CONSUME SE PIERDE SIN RUIDO.
//
// Es la tercera vez del mismo defecto y por eso deja de buscarse de a uno:
//
//   · `label` en SunmiTableEmpty  — diez lugares, el texto salía el genérico
//   · `subtitle` en SunmiCardHeader — no lo acepta, y se lo pasan igual
//   · `color` en SunmiModalLayout   — se lo pasa a SunmiCardHeader, que lo ignora
//
// React no avisa: un prop de más se descarta en silencio, y el que lo escribió se
// va convencido de que lo puso. Arreglar el tercero de a uno garantiza un cuarto.
//
// Este candado compara, para cada componente del kit, LOS PROPS QUE LE PASAN
// contra LOS QUE DECLARA, y falla nombrando el que se pierde.
//
// ── LO QUE A PROPÓSITO NO MIRA ─────────────────────────────────────────────
//
// Un componente que junta el resto con `...algo` acepta cualquier cosa: ahí no
// hay nada que perder y se saltea. Tampoco mira componentes fuera del kit: la
// idea es que el kit sea confiable, no auditar el repo entero.
//
// Enumera con git —incluyendo lo no trackeado— y saltea comentarios con la misma
// función del contador, no con una copia.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { esComentario } from "@/lib/hardcodeo/contador.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const archivos = () => [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "app/**/*.jsx", "components/**/*.jsx"],
      { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    ).split("\n").map((s) => s.trim()).filter(Boolean)
  ),
];

/** Sin comentarios de línea entera, que ya engañaron a cuatro relevamientos. */
const sinComentarios = (texto) => texto.split("\n").filter((l) => !esComentario(l)).join("\n");

/**
 * Los props que un componente DECLARA.
 *
 * Devuelve `null` cuando acepta cualquier cosa —junta el resto con `...`, o
 * recibe el objeto entero en vez de desestructurar—, porque ahí no se pierde
 * nada y no hay nada que comparar.
 */
export function propsQueDeclara(texto) {
  const t = sinComentarios(texto);
  const m = t.match(/export default (?:function\s+\w+\s*)?\(?\s*(?:function\s+\w+\s*)?\(\s*\{([\s\S]*?)\}\s*(?:,\s*ref\s*)?\)/);
  if (!m) return null; // no desestructura: acepta el objeto entero
  const cuerpo = m[1];
  if (/\.\.\./.test(cuerpo)) return null; // junta el resto
  const nombres = [];
  let prof = 0;
  let actual = "";
  for (const ch of cuerpo) {
    if ("{[(".includes(ch)) prof++;
    else if ("}])".includes(ch)) prof--;
    if (ch === "," && prof === 0) { nombres.push(actual); actual = ""; continue; }
    actual += ch;
  }
  nombres.push(actual);
  return nombres
    .map((n) => n.split("=")[0].split(":")[0].trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

/** Las etiquetas de apertura de `<Componente …>` de un archivo. */
function aperturas(texto, componente) {
  const t = sinComentarios(texto);
  const out = [];
  for (const m of t.matchAll(new RegExp(`<${componente}(?![A-Za-z0-9_])`, "g"))) {
    let i = m.index, prof = 0;
    for (; i < t.length; i++) {
      if (t[i] === "{") prof++;
      else if (t[i] === "}") prof--;
      else if (t[i] === ">" && prof === 0) break;
    }
    out.push(t.slice(m.index, i + 1));
  }
  return out;
}

/** Los props que una etiqueta pasa, sin mirar adentro de las llaves. */
function propsQuePasa(etiqueta) {
  const nombres = [];
  let prof = 0;
  for (let i = 0; i < etiqueta.length; i++) {
    const ch = etiqueta[i];
    if (ch === "{") { prof++; continue; }
    if (ch === "}") { prof--; continue; }
    if (prof !== 0) continue;
    const m = /^([A-Za-z_][\w:-]*)\s*=/.exec(etiqueta.slice(i));
    if (m && /[\s<]/.test(etiqueta[i - 1] ?? " ")) { nombres.push(m[1]); i += m[0].length - 1; }
  }
  return nombres;
}

/** Todo lo que se pierde, por componente del kit. */
export function loQueSePierde() {
  const kit = archivos().filter((r) => /^components\/sunmi\/[A-Z]\w*\.jsx$/.test(r));
  const perdidos = [];
  for (const ruta of kit) {
    const nombre = path.basename(ruta, ".jsx");
    const declara = propsQueDeclara(fs.readFileSync(path.join(RAIZ, ruta), "utf8"));
    if (!declara) continue;
    const acepta = new Set([...declara, "key", "ref", "children"]);
    for (const consumidor of archivos()) {
      if (consumidor === ruta) continue;
      const texto = fs.readFileSync(path.join(RAIZ, consumidor), "utf8");
      if (!texto.includes(`<${nombre}`)) continue;
      for (const etiqueta of aperturas(texto, nombre)) {
        for (const p of propsQuePasa(etiqueta)) {
          if (!acepta.has(p)) perdidos.push({ componente: nombre, prop: p, archivo: consumidor });
        }
      }
    }
  }
  return perdidos;
}

test("HAY KIT QUE MIRAR, o este candado no prueba nada", () => {
  const kit = archivos().filter((r) => /^components\/sunmi\/[A-Z]\w*\.jsx$/.test(r));
  assert.ok(kit.length >= 15, `solo ${kit.length} componentes del kit encontrados`);
  const conProps = kit.filter((r) => propsQueDeclara(fs.readFileSync(path.join(RAIZ, r), "utf8")));
  assert.ok(conProps.length >= 10, `solo ${conProps.length} declaran props: ¿cambió cómo se escriben?`);
});

test("el lector de props no se confunde con lo que hay adentro de las llaves", () => {
  // `onClick={() => f({ a: 1 })}` no pasa un prop llamado `a`.
  const props = propsQuePasa('<X onClick={() => f({ a: 1 })} title="t" style={{ color: "red" }} />');
  assert.deepEqual(props, ["onClick", "title", "style"]);
});

test("un componente que junta el resto acepta cualquier cosa y se saltea", () => {
  assert.equal(propsQueDeclara('export default function X({ a, ...resto }) {'), null);
  assert.deepEqual(propsQueDeclara('export default function X({ a, b = 1 }) {'), ["a", "b"]);
});

// ── LO QUE HOY SE PIERDE, ANOTADO ──────────────────────────────────────────
//
// El candado nace con treinta pérdidas encontradas, así que no puede exigir cero
// sin quedar rojo desde el primer día. Funciona como trinquete: esta lista es la
// que hay, y cualquier prop nuevo que se pierda la rompe.
//
// NO ES UNA LISTA DE COSAS ACEPTABLES. Es la deuda, y cada línea es un texto o
// un comportamiento que alguien escribió y no llega:
//
//   SunmiCardHeader.subtitle  10  subtítulos que no se dibujan
//   SunmiHeader.subtitle       5  ídem, en el otro encabezado
//   SunmiTable.className       5  la tabla lo ignora A PROPÓSITO y está escrito
//                                 en su encabezado: implementarlo cambiaría el
//                                 aspecto de esas pantallas solo por existir
//   SunmiButtonIcon.aria-label 4  botones de solo ícono que se quedan SIN NOMBRE
//                                 para un lector de pantalla
//   SunmiButtonIcon.disabled   2  botones que se creen deshabilitados y no lo están
//   SunmiCardHeader.color      2
//   SunmiHeader.titulo         1  en español, y el componente espera `title`:
//   SunmiHeader.subtitulo      1  ese encabezado se dibuja SIN TÍTULO
const DEUDA = {
  "SunmiButtonIcon.aria-label": 4,
  "SunmiButtonIcon.disabled": 2,
  "SunmiCardHeader.color": 2,
  "SunmiCardHeader.subtitle": 10,
  "SunmiHeader.subtitle": 5,
  "SunmiHeader.subtitulo": 1,
  "SunmiHeader.titulo": 1,
  "SunmiTable.className": 5,
};

test("NO SE PIERDE NINGÚN PROP NUEVO", () => {
  const cuenta = {};
  for (const p of loQueSePierde()) {
    const k = `${p.componente}.${p.prop}`;
    cuenta[k] = (cuenta[k] ?? 0) + 1;
  }
  const nuevos = Object.keys(cuenta).filter((k) => !(k in DEUDA));
  assert.deepEqual(nuevos, [], `props nuevos que se pierden: ${nuevos.join(", ")}`);
  for (const [k, n] of Object.entries(cuenta)) {
    assert.ok(n <= DEUDA[k], `${k} pasó de ${DEUDA[k]} a ${n} lugares donde se pierde`);
  }
});

test("y si alguno SE ARREGLA, la deuda se baja a mano", () => {
  // La contracara del trinquete: sin esto, arreglar diez subtítulos dejaría la
  // deuda anotada en diez para siempre y el candado seguiría en verde.
  const cuenta = {};
  for (const p of loQueSePierde()) {
    const k = `${p.componente}.${p.prop}`;
    cuenta[k] = (cuenta[k] ?? 0) + 1;
  }
  const bajaron = Object.entries(DEUDA).filter(([k, n]) => (cuenta[k] ?? 0) < n);
  assert.deepEqual(
    bajaron.map(([k, n]) => `${k}: ${n} → ${cuenta[k] ?? 0}`),
    [],
    "bajó la deuda: actualizá DEUDA en este archivo para fijar el terreno ganado"
  );
});
