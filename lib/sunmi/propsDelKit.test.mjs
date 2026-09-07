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

import { esComentario } from "@/lib/hardcodeo/contador.mjs";

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
  // Los comentarios AL FINAL DE LA LÍNEA también se sacan. `sinComentarios`
  // saltea la línea entera, así que un `children, // botones opcionales` dejaba
  // "// botones opcionales" adentro de la lista y salía informado como si fuera
  // un prop llamado así. No se notaba porque un nombre inventado nunca coincide
  // con lo que pasa una pantalla — lo destapó el candado del prop declarado y no
  // usado, que sí los mira de a uno.
  const cuerpo = m[1].replace(/\/\/[^\n]*/g, "");
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
  // SunmiButtonIcon salió de la lista: ahora junta el resto y se lo pasa al
  // `<button>`, así que sus cuatro `aria-label` y sus dos `disabled` llegan. Era
  // el único de los ocho que además de perder un texto perdía COMPORTAMIENTO —
  // el "Quitar" que saca un local de un grupo se podía apretar dos veces.
  "SunmiCardHeader.color": 2,
  // LOS DOCE SUBTÍTULOS SALIERON, que era la deuda más grande de esta lista.
  // `SunmiCardHeader` y `SunmiHeader` aprendieron a dibujarlos; los seis que
  // dicen algo que el título no dice ahora se ven, los cuatro que lo repetían se
  // borraron de la pantalla, y los seis de modal siguen sin dibujarse porque
  // `SunmiModalLayout` no los reenvía — eso está anotado aparte, en
  // DECLARADOS_SIN_USAR, con su motivo.
  //
  // `titulo` y `subtitulo` habían salido antes: eran los dos de arqueo-caja, en
  // español, y se descartaron a propósito —el título ya aparece veinte líneas
  // más abajo—. El motivo largo está en el roadmap para que nadie rehaga el
  // análisis.
  // `SunmiTable.className` SALIÓ, y era 5. Las cinco eran `className="text-xs"`
  // —tres en `clientes/[id]` y dos en `clientes`— y las cinco se descartaban:
  // la pieza no declara `className` ni tiene rest spread, así que el valor no
  // llegaba al DOM. Se sacaron del JSX, así que ya no hay nada que perder.
  //
  // ESTE CANDADO FUE EL QUE TUVO RAZÓN. La medición que se hizo antes de tocar
  // nada informó CERO consumidores con `className`, por un extractor con un
  // defecto, y sobre ese cero se concluyó que negociar el eje sería "aditivo
  // puro". Lo desmintieron dos cosas independientes: el encabezado de
  // `SunmiTable.jsx`, que decía a mano que había tres, y esta deuda, que decía
  // cinco — el número correcto. Un contador con su número al lado vale más que
  // una medición nueva sin control.
};

// ── EL OTRO LADO DEL MISMO AGUJERO ─────────────────────────────────────────
//
// Lo de arriba atrapa el prop que una pantalla PASA y la pieza no declara. Falta
// el simétrico: el prop que la pieza DECLARA y después no usa. Se pierde igual
// de callado, y en el camino es peor, porque el que lo lee ve el nombre en la
// firma y da por hecho que llega.
//
// Es el agujero que esta misma tanda podía abrir: `SunmiHeader` y
// `SunmiCardHeader` acaban de ganar `subtitle`, y agregarlo a la firma sin
// dibujarlo habría dejado los diez textos igual de invisibles que antes —con la
// diferencia de que ahora el candado de arriba los daría por resueltos—.
//
// Un prop declarado y no usado a propósito va acá, con su motivo escrito. La
// lista es corta a propósito: si crece, es que la costumbre volvió.
const DECLARADOS_SIN_USAR = {
  // `SunmiModalLayout` lo acepta para que las seis pantallas que se lo pasan no
  // caigan en la deuda de arriba, pero NO lo reenvía al encabezado: encenderlos
  // no era esta tanda, y dos de los seis repiten su propio título, así que por
  // el criterio aprobado habría que borrarlos y no mostrarlos. El motivo largo
  // está al lado de la línea, en la pieza.
  "SunmiModalLayout.subtitle": "los seis subtítulos de modal se deciden aparte",
};

/** Los props que una pieza declara y no menciona en ningún otro lado. */
export function declaradosSinUsar() {
  const kit = archivos().filter((r) => /^components\/sunmi\/[A-Z]\w*\.jsx$/.test(r));
  const sueltos = [];
  for (const ruta of kit) {
    const texto = fs.readFileSync(path.join(RAIZ, ruta), "utf8");
    const declara = propsQueDeclara(texto);
    if (!declara) continue;
    // El cuerpo es lo que va DESPUÉS DE LA FIRMA, y hay que ubicarla de verdad:
    // cortar en el primer `)` del archivo corta adentro de un `color-mix(`, y
    // entonces la firma queda contada como cuerpo y TODO prop parece usado.
    // Sale sin comentarios por lo mismo de siempre: un prop nombrado en su
    // propio comentario de documentación se contaría como usado, que es cómo el
    // candado de la bitácora se comió su propio anzuelo esta misma semana.
    const limpio = sinComentarios(texto).replace(/\/\/[^\n]*/g, "");
    const firma = limpio.match(
      /export default (?:function\s+\w+\s*)?\(?\s*(?:function\s+\w+\s*)?\(\s*\{[\s\S]*?\}\s*(?:,\s*ref\s*)?\)/
    );
    if (!firma) continue;
    const cuerpo = limpio.slice(firma.index + firma[0].length);
    for (const prop of declara) {
      if (prop === "children") continue;
      const usado = new RegExp(`\\b${prop.replace(/[^\w]/g, "\\$&")}\\b`).test(cuerpo);
      if (!usado) sueltos.push(`${path.basename(ruta, ".jsx")}.${prop}`);
    }
  }
  return sueltos;
}

test("UN PROP DECLARADO Y NO USADO ES EL MISMO DEFECTO DADO VUELTA", () => {
  const sueltos = declaradosSinUsar().filter((k) => !(k in DECLARADOS_SIN_USAR));
  assert.deepEqual(
    sueltos,
    [],
    `estas piezas declaran un prop y no lo usan, así que el texto o el ` +
      `comportamiento no llega igual que si no lo declararan: ${sueltos.join(", ")}`
  );
});

test("y la excepción tiene que seguir siendo cierta", () => {
  // La contracara: si `SunmiModalLayout` vuelve a reenviar el subtítulo, esta
  // línea sobra y hay que sacarla. Sin esto la excepción se queda para siempre.
  const sueltos = new Set(declaradosSinUsar());
  for (const k of Object.keys(DECLARADOS_SIN_USAR)) {
    assert.ok(sueltos.has(k), `${k} ya se usa: sacalo de DECLARADOS_SIN_USAR`);
  }
});

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
