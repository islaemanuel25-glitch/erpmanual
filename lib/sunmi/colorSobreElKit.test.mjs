// EL DÍA QUE APAREZCA EL PRIMER COLOR SOBRE UNA PIEZA DEL KIT, ESTO SE PONE ROJO.
//
// ── QUÉ DEFIENDE, Y POR QUÉ NO ALCANZA CON HABER ARREGLADO EL PREDICADO ────
//
// El predicado ya no confunde un color con un tamaño, así que escribir
// `className="text-white"` sobre un `SunmiButton` no le apaga la letra. El
// defecto está cerrado.
//
// Lo que este candado defiende es otra cosa: que **un color escrito sobre una
// pieza del kit es una decisión de aspecto que nadie tomó**. El kit resuelve el
// color por variante —`sunmi-btn-slate`, `sunmi-text-muted`— justamente para que
// el tema mande. Un `text-white` suelto en el `className` se aplica encima, no
// sigue al tema, y en los catorce temas del proyecto no hay ninguna garantía de
// que se lea: es la misma familia de problemas que los rótulos de 10px, que dan
// 2,54:1 sobre blanco.
//
// Se decidió NO agregarle al botón una variante de texto blanco: cuando aparezca
// el primer caso real, se mira y se decide con él a la vista. Este candado es lo
// que hace que ese día llegue con aviso en vez de en silencio.
//
// ── POR QUÉ NO LO CUBRE EL TRINQUETE DE HARDCODEO ─────────────────────────
//
// El trinquete persigue ocho familias —slate, red, amber, cyan, emerald, green,
// orange y gray— y **no ve blue, indigo, violet, sky, teal, yellow, ni
// `text-white`, `text-black`, `text-transparent`, `text-current`, `text-inherit`,
// ni los arbitrarios**. Medido: hay 21 `text-white` en el repo y ninguno le
// aparece. Acá se miran TODOS, porque el alcance es chico —las cuatro piezas que
// negocian el tamaño— y ahí un color sí importa.
//
//   node --test lib/sunmi/colorSobreElKit.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { esTamanoDeLetra } from "./claseNegociada.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Las cuatro que negocian el eje del tamaño de letra. El alcance es ése a
// propósito: son las piezas donde un color, además de no seguir al tema, convivía
// con el defecto del predicado.
const PIEZAS = ["SunmiButton", "SunmiTableRow", "SunmiPar", "SunmiTable"];

const ALINEACION = new Set(["left", "right", "center", "justify", "start", "end"]);
const NO_COLOR = new Set(["wrap", "nowrap", "balance", "pretty", "ellipsis", "clip"]);

/**
 * ¿Este token es un COLOR de texto escrito a mano?
 *
 * Se define por descarte y no por lista de colores, que es el error que tiene el
 * trinquete: cualquier `text-…` que no sea un tamaño, ni alineación, ni una de
 * las familias de ajuste o desborde, ni una clase del tema, es un color.
 * Así entran blue, indigo, `text-white` y los arbitrarios sin enumerarlos.
 */
export function esColorDeTexto(bruto) {
  const t = String(bruto).startsWith("!") ? String(bruto).slice(1) : String(bruto);
  if (/^[a-z-]+:/.test(t)) return false;         // con variante: otra discusión
  if (!t.startsWith("text-")) return false;       // `sunmi-text-*` es del tema y está bien
  const r = t.slice("text-".length);
  if (r === "" || ALINEACION.has(r)) return false;
  if (NO_COLOR.has(r) || r.startsWith("opacity-")) return false;
  if (esTamanoDeLetra(t)) return false;
  return true;
}

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

/** Aperturas `<Pieza …>`, sin comentarios. */
function aperturas(texto, pieza) {
  const salida = [];
  const re = new RegExp(`<${pieza}(?![A-Za-z0-9_])`, "g");
  let m;
  while ((m = re.exec(texto)) !== null) {
    let i = m.index + m[0].length, llaves = 0, fin = -1;
    while (i < texto.length) {
      const c = texto[i];
      if (c === "{") llaves++;
      else if (c === "}") llaves--;
      else if (c === '"' || c === "'" || c === "`") {
        const cita = c; i++;
        while (i < texto.length && texto[i] !== cita) { if (texto[i] === "\\") i++; i++; }
      } else if (c === ">" && llaves === 0) { fin = i; break; }
      i++;
    }
    salida.push({
      linea: texto.slice(0, m.index).split("\n").length,
      // SIN COMENTARIOS antes de mirar. Van tres veces en este repo que un candado
      // encuentra su patrón en prosa, y una de las tres fue un falso VERDE.
      bruto: texto.slice(m.index, fin === -1 ? m.index + 1200 : fin + 1).replace(/\/\/[^\n]*/g, ""),
    });
  }
  return salida;
}

/** Los colores escritos en el `className` de una apertura. */
function coloresDe(bruto) {
  const i = bruto.search(/className\s*=/);
  if (i === -1) return [];
  const cola = bruto.slice(i);
  const lit = cola.match(/^className\s*=\s*"([^"]*)"/);
  // El literal directo, o —si viene en expresión— cada cadena escrita adentro.
  const trozos = lit ? [lit[1]] : [...cola.matchAll(/["'`]([^"'`]*)["'`]/g)].map((x) => x[1]);
  return [...new Set(trozos.flatMap((s) => s.split(/\s+/)).filter(Boolean).filter(esColorDeTexto))];
}

test("ninguna pieza del kit recibe un color de texto escrito a mano", () => {
  const culpables = [];
  let instancias = 0;
  for (const archivo of jsxDelRepo()) {
    const texto = fs.readFileSync(archivo, "utf8");
    for (const pieza of PIEZAS) {
      if (!texto.includes(`<${pieza}`)) continue;
      for (const ap of aperturas(texto, pieza)) {
        instancias++;
        const colores = coloresDe(ap.bruto);
        if (colores.length) {
          culpables.push(
            `${path.relative(RAIZ, archivo).replace(/\\/g, "/")}:${ap.linea}  <${pieza}>  ${colores.join(", ")}`
          );
        }
      }
    }
  }

  // CONTROL: sin esto, "no encontré ninguno" no se distingue de "no busqué en
  // ningún lado". Son 596 al escribir esto; el piso queda holgado para que no
  // se ponga rojo por una migración normal.
  assert.ok(
    instancias >= 400,
    `sólo se encontraron ${instancias} instancias de las cuatro piezas: el candado no está midiendo nada`
  );

  assert.deepEqual(
    culpables,
    [],
    "Hay un color de texto escrito a mano sobre una pieza del kit:\n  " +
      culpables.join("\n  ") +
      "\n\nEl kit resuelve el color por variante para que el tema mande. Un color suelto se\n" +
      "aplica igual y NO sigue al tema, así que en alguno de los catorce puede no leerse.\n" +
      "Lo que corresponde es mirar el caso y decidir: o sale, o el kit gana una variante\n" +
      "que lo contemple. NO aflojar este candado."
  );
});

// ── LA CONTRAPRUEBA, ADENTRO DEL CANDADO ──────────────────────────────────
//
// Romper el reconocedor a propósito es lo único que distingue un candado que
// afirma de uno que acompaña. Acá se ejerce sobre un texto escrito a mano, con
// los casos que tienen que dar rojo y los que NO tienen que darlo.
test("el reconocedor de colores distingue lo que tiene que distinguir", () => {
  // Colores: TIENEN que dar true, incluidos los que el trinquete no ve.
  for (const c of [
    "text-white", "text-black", "text-blue-600", "text-indigo-700", "text-violet-400",
    "text-slate-400", "text-transparent", "text-current", "text-inherit",
    "text-[#ff0000]", "text-[var(--pos-accent)]", "!text-white",
  ]) {
    assert.equal(esColorDeTexto(c), true, `${c} debería contar como color`);
  }

  // NO son colores: tamaños, alineación, las familias de ajuste y desborde, la
  // opacidad, y sobre todo las clases del TEMA, que son la forma correcta.
  for (const c of [
    "text-xs", "text-[12px]", "text-2xl", "text-xs2",
    "text-left", "text-right", "text-center",
    "text-nowrap", "text-ellipsis", "text-balance", "text-opacity-50",
    "sunmi-text-muted", "sunmi-text-strong", "sunmi-text-accent",
    "font-bold", "px-2", "hover:text-white", "sm:text-blue-600", "",
  ]) {
    assert.equal(esColorDeTexto(c), false, `${c} NO debería contar como color`);
  }
});

test("el barrido encuentra un color cuando lo hay, y no lo confunde con prosa", () => {
  // El control del barrido, sobre un texto escrito acá: si esto no distinguiera,
  // el cero del primer candado no probaría nada.
  const control = `
    <SunmiButton className="text-white font-bold">sí</SunmiButton>
    <SunmiButton className="text-xs sunmi-text-muted">no</SunmiButton>
    <SunmiTableRow className={activo ? "text-blue-600" : "text-xs"}>sí</SunmiTableRow>
    <SunmiButtonIcon className="text-white">no cuenta, no es de la lista</SunmiButtonIcon>
    <SunmiButton
      // acá se explica por qué NO se usa text-white
      variante="slate"
    >no</SunmiButton>
  `;
  const encontrados = [];
  for (const pieza of PIEZAS) {
    for (const ap of aperturas(control, pieza)) {
      const c = coloresDe(ap.bruto);
      if (c.length) encontrados.push(`${pieza}:${c.join(",")}`);
    }
  }
  assert.deepEqual(
    encontrados.sort(),
    ["SunmiButton:text-white", "SunmiTableRow:text-blue-600"],
    "tiene que encontrar los dos colores de verdad, ignorar el de `SunmiButtonIcon` " +
      "—que no es de las cuatro—, el del tema, y el nombrado en un comentario"
  );
});
