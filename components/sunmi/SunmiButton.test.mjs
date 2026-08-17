// UN COLOR QUE NO EXISTE DEJA EL BOTÓN INVISIBLE.
//
// `sunmi-btn-${color}` es una concatenación: si el color no está definido en el
// CSS, la clase no matchea nada y el botón queda solo con la base, sin fondo y
// sin color. Parece texto suelto, y no hay error de compilación que lo diga.
//
// Pasó con `color="accent"` en cinco botones del panel de comprobantes, incluido
// "Subir fotos", que es la acción principal de esa pantalla.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

import { COLORES } from "@/components/sunmi/SunmiButton";

const RAIZ = path.resolve(new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

// `.sunmi-btn-<algo>` ES EL ESPACIO DE NOMBRES DE LOS COLORES, y las PARTES de
// la base viven aparte, bajo `.sunmi-btn-parte-<eje>`.
//
// No es una convención escrita después: **este candado se puso ROJO** el
// 2026-08-17, al partir `.sunmi-btn-base` por eje. Las sub-clases se habían
// llamado `.sunmi-btn-alto`, `.sunmi-btn-letra`, `.sunmi-btn-peso`… y el
// candado las leyó como cinco colores nuevos que el componente no ofrecía.
// Tenía razón en lo que preguntaba: por la forma del nombre, eran colores.
//
// Se renombraron todas al prefijo `parte-` en vez de aflojar el candado. Y la
// exclusión se declara acá en vez de dejarla al azar del `[a-z]+`, que no
// matchea `parte-alto` solo porque tiene un guion: un nombre de color de dos
// palabras haría lo mismo, y entonces la protección sería una casualidad.
const PREFIJO_DE_PARTES = "parte-";

const leerCss = () => readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8");

/** Los colores que el CSS define de verdad, leídos del archivo. */
function coloresDefinidos() {
  // `[a-z]+` SIN guion, y es a propósito: la llave de apertura importa y el
  // nombre también. `.sunmi-btn-accent-soft {` NO define `.sunmi-btn-accent`, y
  // confundirlos fue justamente cómo pasó desapercibido el botón invisible.
  // Ampliarlo a `[a-z-]+` para acomodar las partes metía `accent-soft` y
  // `link-soft` en la lista de colores — probado, y el candado lo dijo.
  //
  // El `[,{]` sí hizo falta: al partir la base por eje el selector pasó a ser
  // una LISTA, y `.sunmi-btn-base,` termina en coma y no en llave.
  return [...leerCss().matchAll(/^\.sunmi-btn-([a-z]+)\s*[,{]/gm)]
    .map((m) => m[1])
    .filter((c) => c !== "base");
}

/** Las PARTES de la base, que no son colores. */
function partesDefinidas() {
  return [...leerCss().matchAll(/^\.sunmi-btn-parte-([a-z-]+)\s*[,{]/gm)].map((m) => m[1]);
}

test("la lista del componente es exactamente la que define el CSS", () => {
  // Si divergen, o hay un color que el componente ofrece y no existe —invisible—
  // o uno que el CSS define y el componente manda al fallback sin motivo.
  assert.deepEqual([...COLORES].sort(), coloresDefinidos().sort());
});

// LAS PARTES DE LA BASE NO SON COLORES, Y EL NOMBRE ES LO ÚNICO QUE LAS SEPARA.
//
// Este candado se puso ROJO el 2026-08-17 al partir `.sunmi-btn-base` por eje:
// las sub-clases se llamaban `.sunmi-btn-alto`, `.sunmi-btn-letra`,
// `.sunmi-btn-peso`… y las leyó como colores nuevos que el componente no
// ofrecía. Tenía razón: por la forma del nombre, eran colores.
//
// Se renombraron al prefijo `parte-` en vez de aflojar el candado. Y esto lo
// sostiene, en vez de dejarlo al azar de que `[a-z]+` no matchee un guion: el
// día que alguien agregue una parte de una sola palabra, la lista de colores
// crece sola y el candado de arriba se pone rojo sin decir por qué. Éste lo dice.
test("LAS PARTES DE LA BASE VIVEN EN SU PROPIO ESPACIO Y NO SE LEEN COMO COLORES", () => {
  const partes = partesDefinidas();
  // Que haya mirado algo: si el patrón deja de matchear, la lista queda vacía y
  // la afirmación de abajo pasa sin haber comprobado nada.
  assert.ok(
    partes.length >= 9,
    `solo encontró ${partes.length} partes de la base: revisá el patrón o el CSS`
  );

  const colores = new Set(coloresDefinidos());
  const coladas = partes.filter((p) => colores.has(PREFIJO_DE_PARTES + p) || colores.has(p));
  assert.deepEqual(
    coladas,
    [],
    "una parte de la base entró a la lista de colores: renombrala con el prefijo " +
      `\`${PREFIJO_DE_PARTES}\` en vez de sacarla del candado.\n  ` + coladas.join("\n  ")
  );
});

test("NINGÚN LUGAR DEL REPO PIDE UN COLOR QUE NO EXISTE", () => {
  // Se enumera con git: recorre el repo entero, incluidos los subdirectorios que
  // `readdirSync` se saltea.
  const archivos = execFileSync("git", ["ls-files", "*.jsx"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  const definidos = new Set(coloresDefinidos());
  const malos = [];
  for (const rel of archivos) {
    const fuente = readFileSync(path.join(RAIZ, rel), "utf8");
    // Solo los `color="..."` literales; los que salen de una variable no se
    // pueden mirar desde acá y para eso está el fallback.
    for (const m of fuente.matchAll(/<SunmiButton[^>]*?color="([a-z]+)"/gs)) {
      if (!definidos.has(m[1])) malos.push(`${rel}: color="${m[1]}"`);
    }
  }
  assert.deepEqual(
    malos,
    [],
    "estos botones piden un color que el CSS no define y salen sin fondo:\n  " + malos.join("\n  ")
  );
});

test("un color desconocido cae en uno VISIBLE, no en la nada", () => {
  // El fallback es la red, no la solución: lo que corrige el color es el candado
  // de arriba. Pero mientras tanto el botón se ve.
  assert.ok(COLORES.includes("slate"), "el fallback tiene que ser un color definido");
});
