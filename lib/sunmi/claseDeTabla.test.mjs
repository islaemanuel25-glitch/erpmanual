// Candados de quién gana en el `<table>` de SunmiTable.
//
// Afirman COMPORTAMIENTO —con qué cadena de clases termina la tabla— y no la
// forma del archivo, por el mismo motivo que los de `claseAncho`: el día que
// alguien reordene o renombre la base, estos siguen valiendo mientras lo que la
// pantalla pide siga ganando.
//
// El caso: `SunmiTable` no aceptaba `className` y cinco pantallas se lo pasaban.
// Se sacaron las cinco primero —commit aparte, a propósito— y recién después la
// pieza pasó a aceptarlo. Con cero consumidores pasándola, aceptarla no puede
// mover nada; estos candados son los que fijan ese "no puede".
//
//   node --test lib/sunmi/claseDeTabla.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { claseDeTabla } from "./claseNegociada.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tokens = (s) => s.split(/\s+/).filter(Boolean);
const tiene = (s, t) => tokens(s).includes(t);

// ═══════════════════════════════════════════════════════════════════════════
// 1 · SIN `className`, LA CADENA ES EXACTAMENTE ESAS TRES
// ═══════════════════════════════════════════════════════════════════════════
//
// Es el candado que sostiene la afirmación entera de la tanda: las 57 instancias
// que no pasan nada tienen que seguir recibiendo lo mismo que antes, carácter por
// carácter. Se afirma la cadena COMPLETA y no que "contenga" las tres: contener
// no distingue de haber sumado una cuarta.
test("sin className, la clase del <table> es exactamente `w-full text-[12px] table-auto`", () => {
  for (const nada of ["", undefined, null, "   ", 123, {}]) {
    assert.equal(claseDeTabla(nada), "w-full text-[12px] table-auto", `con ${JSON.stringify(nada)}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 · CON UN TAMAÑO DECLARADO, CEDE ESE EJE Y NINGÚN OTRO
// ═══════════════════════════════════════════════════════════════════════════
test("con un tamaño declarado, la pieza no pone el suyo — y el ancho se queda", () => {
  // Las cinco que se sacaron decían `text-xs`. Éste es el caso que las haría
  // funcionar el día que alguien decida devolvérselas.
  for (const pedido of ["text-xs", "text-[9.5px]", "text-sm2", "!text-xs2"]) {
    const r = claseDeTabla(pedido);
    assert.equal(tiene(r, "text-[12px]"), false, `no debería quedar el tamaño de la pieza: ${r}`);
    assert.equal(tiene(r, "w-full"), true, `el ancho NO se pedía y tiene que seguir: ${r}`);
    assert.equal(tiene(r, "table-auto"), true, `table-auto va siempre: ${r}`);
    assert.equal(tiene(r, pedido), true, `falta lo que pidió la pantalla: ${r}`);
  }
});

test("NUNCA DOS TAMAÑOS en la cadena que sale", () => {
  // El corazón del asunto: dos clases de la misma familia tienen la misma
  // especificidad, así que tenerlas las dos es dejar que gane la hoja de estilos.
  const esTamano = (t) => /^!?text-/.test(t) && !/^!?text-(left|right|center|justify|start|end)$/.test(t);
  for (const pedido of ["text-xs", "text-[9.5px] text-right", "w-auto text-sm", ""]) {
    const cuantos = tokens(claseDeTabla(pedido)).filter(esTamano).length;
    assert.ok(cuantos <= 1, `"${pedido}" -> ${claseDeTabla(pedido)}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 · CON UN ANCHO DECLARADO, CEDE ESE EJE Y NINGÚN OTRO
// ═══════════════════════════════════════════════════════════════════════════
test("con un ancho declarado, la pieza no pone w-full — y el tamaño se queda", () => {
  for (const pedido of ["w-auto", "w-[600px]", "w-1/2", "!w-full"]) {
    const r = claseDeTabla(pedido);
    assert.equal(tiene(r, "w-full"), false, `no debería quedar el ancho de la pieza: ${r}`);
    assert.equal(tiene(r, "text-[12px]"), true, `el tamaño NO se pedía y tiene que seguir: ${r}`);
    assert.equal(tiene(r, "table-auto"), true, `table-auto va siempre: ${r}`);
  }
});

test("min-w- y max-w- NO son un ancho: w-full se conserva", () => {
  // Misma distinción que en `claseAncho.js`: acotar no es definir.
  for (const pedido of ["max-w-3xl", "min-w-0", "min-w-[640px]"]) {
    assert.equal(tiene(claseDeTabla(pedido), "w-full"), true, `con "${pedido}"`);
  }
});

test("un ancho o un tamaño CON VARIANTE no hacen ceder", () => {
  // `sm:w-auto` sólo vale de sm para arriba. Si la pieza soltara su default
  // incondicional por un pedido condicional, abajo del breakpoint la tabla se
  // quedaría sin ancho — que es mover píxeles, justo lo que esta tanda no hace.
  for (const pedido of ["sm:w-auto", "md:text-sm", "hover:w-1/2"]) {
    const r = claseDeTabla(pedido);
    assert.equal(tiene(r, "w-full"), true, `con "${pedido}" -> ${r}`);
    assert.equal(tiene(r, "text-[12px]"), true, `con "${pedido}" -> ${r}`);
  }
});

test("los dos ejes juntos: ceden los dos y table-auto sigue", () => {
  const r = claseDeTabla("w-auto text-xs");
  assert.equal(tiene(r, "w-full"), false, r);
  assert.equal(tiene(r, "text-[12px]"), false, r);
  assert.equal(tiene(r, "table-auto"), true, r);
  assert.equal(r, "table-auto w-auto text-xs", r);
});

test("lo que pide la pantalla va DESPUÉS de lo de la pieza", () => {
  // No decide especificidad —para eso está el ceder— pero sí legibilidad al
  // inspeccionar el DOM: lo último escrito es lo que alguien puso a mano.
  const r = claseDeTabla("border-separate");
  assert.ok(r.indexOf("border-separate") > r.indexOf("table-auto"), r);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4 · `table-auto` NO CEDE, Y ES A PROPÓSITO
// ═══════════════════════════════════════════════════════════════════════════
test("table-auto va siempre, aunque la pantalla pida otra cosa", () => {
  // Esto NO es que esté bien tener dos layouts en el atributo: es que hoy no hay
  // ninguna pantalla que declare uno, así que negociar el eje sería escribir una
  // rama que nunca corre. El candado de más abajo avisa el día que aparezca la
  // primera, y ahí se decide con el caso a la vista.
  assert.equal(tiene(claseDeTabla(""), "table-auto"), true);
  assert.equal(tiene(claseDeTabla("w-auto text-xs"), "table-auto"), true);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5 · NINGÚN CONSUMIDOR DECLARA UN LAYOUT DE TABLA
// ═══════════════════════════════════════════════════════════════════════════
//
// El candado que sostiene la decisión de arriba. Si alguien escribe `table-fixed`
// en una `<SunmiTable>`, esto se pone ROJO NOMBRANDO EL ARCHIVO Y LA LÍNEA, y lo
// que hay que hacer entonces no es aflojarlo: es agregarle el eje a `claseDeTabla`
// con este caso como el que lo ejerce.
//
// ── DOS COSAS QUE ESTE CANDADO TIENE QUE ESQUIVAR ─────────────────────────
//
// 1. `<SunmiTable` matchea también `<SunmiTableRow` y `<SunmiTableEmpty`. Se
//    exige que el nombre termine ahí.
// 2. **UN CANDADO QUE MIRA CÓDIGO TIENE QUE SACAR LOS COMENTARIOS ANTES DE
//    MIRAR.** Ya van tres veces en el proyecto que uno encuentra su patrón en
//    prosa: dos falsos positivos y —la peligrosa— un falso VERDE. Acá además
//    hace falta por otro motivo: dos de las tablas del repo llevan comentarios
//    `//` adentro de su propia etiqueta de apertura.
// 3. Y sólo cuenta lo que está en el NIVEL CERO de la etiqueta: un `className`
//    adentro de `headers={[<label className=…>]}` es de un `<label>`, no de la
//    tabla. Sin esto el recuento previo a esta tanda daba 3 y los 3 eran falsos.
/** Las etiquetas de apertura `<SunmiTable …>` de un archivo, ya sin comentarios. */
function aperturasDeTabla(texto) {
  const salida = [];
  const re = /<SunmiTable(?![A-Za-z0-9_])/g;
  let m;
  while ((m = re.exec(texto)) !== null) {
    let i = m.index + m[0].length;
    let llaves = 0;
    let fin = -1;
    while (i < texto.length) {
      const c = texto[i];
      if (c === "{") llaves++;
      else if (c === "}") llaves--;
      else if (c === '"' || c === "'" || c === "`") {
        const cita = c;
        i++;
        while (i < texto.length && texto[i] !== cita) {
          if (texto[i] === "\\") i++;
          i++;
        }
      } else if (c === ">" && llaves === 0) {
        fin = i;
        break;
      }
      i++;
    }
    const bruto = texto.slice(m.index, fin === -1 ? m.index + 600 : fin + 1);
    // Nivel cero: se descarta lo que viaja adentro de una expresión.
    let nivelCero = "";
    let prof = 0;
    for (const c of bruto) {
      if (c === "{") { prof++; continue; }
      if (c === "}") { prof--; continue; }
      if (prof === 0) nivelCero += c;
    }
    salida.push({
      linea: texto.slice(0, m.index).split("\n").length,
      // Sin comentarios de línea. Ver el punto 2 de arriba.
      texto: nivelCero.replace(/\/\/[^\n]*/g, ""),
    });
  }
  return salida;
}

// RECORRE EL REPO ENTERO Y NO DOS DIRECTORIOS ELEGIDOS. Es la regla 10: un
// `readdirSync` de un nivel —o de una carpeta que uno supone— deja afuera lo que
// vive en otro lado, y eso ya escondió un script peligroso en tres auditorías
// seguidas. Se arranca de la raíz y se saltan sólo los árboles que no son código
// del proyecto.
function jsxDelRepo() {
  const salida = [];
  const saltar = new Set(["node_modules", ".next", ".git", "backups", "pgdata", "public"]);
  const recorrer = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (saltar.has(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) recorrer(p);
      else if (ent.name.endsWith(".jsx")) salida.push(p);
    }
  };
  recorrer(RAIZ);
  return salida;
}

test("ningún consumidor de SunmiTable declara un layout de tabla", () => {
  const culpables = [];
  let instancias = 0;
  for (const archivo of jsxDelRepo()) {
    const texto = fs.readFileSync(archivo, "utf8");
    if (!texto.includes("<SunmiTable")) continue;
    for (const ap of aperturasDeTabla(texto)) {
      instancias++;
      if (/\btable-(fixed|auto)\b/.test(ap.texto)) {
        culpables.push(`${path.relative(RAIZ, archivo)}:${ap.linea}`);
      }
    }
  }
  // CONTROL DEL CANDADO: si no encontró ninguna instancia, el cero de abajo no
  // significa "nadie declara layout" sino "no busqué en ningún lado". Es la misma
  // regla del grep vacío: un vacío sólo vale si la misma búsqueda encuentra algo
  // cuando tiene que encontrarlo.
  assert.ok(instancias >= 50, `el candado no encontró instancias de <SunmiTable> (${instancias}): no está midiendo nada`);
  assert.deepEqual(
    culpables,
    [],
    `declaran un layout de tabla y \`claseDeTabla\` pone \`table-auto\` igual, así que quedan las dos y gana la hoja de estilos.\n` +
      `Lo que corresponde es agregarle el eje a \`claseDeTabla\` con este caso como el que lo ejerce, NO aflojar este candado:\n  ${culpables.join("\n  ")}`
  );
});

test("el reconocedor de etiquetas no confunde a los hermanos ni a los comentarios", () => {
  // La contraprueba del candado de arriba, sobre un texto escrito acá: sin esto,
  // un "no encontré nada" no se distingue de un reconocedor roto.
  const control = `
    <SunmiTableRow className="table-fixed">x</SunmiTableRow>
    <SunmiTable headers={["a"]}>
    <SunmiTable headers={["b"]} className="table-fixed">
    <SunmiTable headers={[<label className="table-fixed">x</label>]}>
    <SunmiTable headers={["c"]}> {/* ojo: table-fixed nombrado en prosa */}
    <SunmiTable
      headers={["d"]}
      // acá se explica por qué NO se usa table-fixed
      densidad="compacta"
    >
  `;
  const aps = aperturasDeTabla(control);
  assert.equal(aps.length, 5, `debería reconocer 5 tablas y no los SunmiTableRow: ${aps.length}`);
  const conLayout = aps.filter((a) => /\btable-(fixed|auto)\b/.test(a.texto)).length;
  assert.equal(
    conLayout,
    1,
    "sólo la segunda declara layout de verdad: la del <label> viaja adentro de headers, " +
      "y las otras dos lo nombran en un comentario"
  );
});
