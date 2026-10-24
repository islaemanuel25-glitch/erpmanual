// NINGÚN TEXTO DE LA REVISIÓN DICE "TILDAR" (Emanuel, 2026-10-24).
//
//   node --import ./scripts/alias-loader.mjs --test lib/proveedores/listas/sinTildarEnLosTextos.test.mjs
//
// En la pantalla no hay ningún tilde: lo que hay es «✓ Usar», y la palabra es
// "marcar". "3 listos sin tildar" era un texto que Emanuel leía sin saber a qué
// se refería. Lo que se mira son los TEXTOS —literales de cadena y texto de
// JSX—, no los nombres del código: `listosSinTildar` es un campo de la
// respuesta del servidor y no lo lee nadie en la pantalla.
//
// Se recorre el módulo entero con `git ls-files --cached --others
// --exclude-standard` (la regla 10: lo recién escrito también cuenta).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const RAIZ = path.resolve(import.meta.dirname, "../../..");
const CARPETAS = [
  "app/modulos/proveedores/listas",
  "app/api/proveedores/listas",
  "components/proveedores/listas",
  "lib/proveedores/listas",
];

function archivos() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...CARPETAS], {
    cwd: RAIZ,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => /\.(js|jsx|mjs)$/.test(f) && !/\.test\.mjs$/.test(f))
    .filter((f) => fs.existsSync(path.join(RAIZ, f)));
}

const sinComentarios = (t) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

// ── POR QUÉ NO SE EXTRAEN LOS TEXTOS ──────────────────────────────────────
//
// La primera versión juntaba literales y texto entre etiquetas, y la
// contraprueba contra los archivos de antes mostró que no veía "pero sin
// tildar": en JSX ese texto va entre dos `{…}`, no entre `>` y `<`. Así que se
// mira el fuente entero sin comentarios, buscando la palabra SUELTA: un nombre
// del código la lleva pegada a otra letra (`listosSinTildar`) y no cuenta.
const DICE_TILDAR = /(^|[^A-Za-z_$])(des)?tild(ar|ad[oa]s?|a(r?l[oa]s?)?|é|aste|ala|alo)s?(?![A-Za-z])/gi;

/** Los «tildar» sueltos de un fuente, sin contar comentarios. */
export function tildarDe(fuente) {
  return [...sinComentarios(fuente).matchAll(DICE_TILDAR)].map((m) => m[0].trim());
}

test("ningún texto de la revisión dice «tildar»", () => {
  const encontrados = [];
  for (const f of archivos()) {
    for (const t of tildarDe(fs.readFileSync(path.join(RAIZ, f), "utf8"))) encontrados.push(`${f}: ${t}`);
  }
  assert.deepEqual(encontrados, []);
});

test("CONTRAPRUEBA: encuentra «tildar» en un texto o en JSX entre llaves, y no en un nombre ni en un comentario", () => {
  const conTexto = `const x = "3 listos sin tildar";\n<p>Tildalos acá</p>\n{n} {n === 1 ? "está" : "están"} pero sin tildar, así que {x}`;
  assert.equal(tildarDe(conTexto).length, 3);
  const sinTexto = `// sin tildar\nconst listosSinTildar = conteo.listosSinTildar; /* tildados */\n{/* tildalo */}`;
  assert.equal(tildarDe(sinTexto).length, 0);
  assert.ok(archivos().length > 50, "el recorrido no ve el módulo");
});
