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

/** Los colores que el CSS define de verdad, leídos del archivo. */
function coloresDefinidos() {
  const css = readFileSync(path.join(RAIZ, "styles/sunmi.css"), "utf8");
  // La llave de apertura importa: `.sunmi-btn-accent-soft {` NO define
  // `.sunmi-btn-accent`, y confundirlos fue justamente cómo pasó desapercibido.
  return [...css.matchAll(/^\.sunmi-btn-([a-z]+)\s*\{/gm)].map((m) => m[1]).filter((c) => c !== "base");
}

test("la lista del componente es exactamente la que define el CSS", () => {
  // Si divergen, o hay un color que el componente ofrece y no existe —invisible—
  // o uno que el CSS define y el componente manda al fallback sin motivo.
  assert.deepEqual([...COLORES].sort(), coloresDefinidos().sort());
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
