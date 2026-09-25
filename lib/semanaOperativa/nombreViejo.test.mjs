// «CORTE DE SEMANA» YA NO ES UN NOMBRE DE LA APP.
//
//   node --import ./scripts/alias-loader.mjs --test lib/semanaOperativa/nombreViejo.test.mjs
//
// Se enumera el repo ENTERO —lo trackeado y lo que todavía no se commiteó—, no
// una lista de archivos elegidos: el censo de `permisos.test.mjs` mira tres, y el
// arnés móvil, que no estaba en ninguno, siguió afirmando la pantalla vieja una
// tanda entera. Se mira el CÓDIGO sin comentarios: la historia de por qué se
// llamaba así puede quedar escrita en prosa.
//
// Vive en su propio archivo porque necesita `.git`: `contrapruebas-revision.mjs`
// corre las suites en una copia del árbol sin `.git`, y adentro de
// `permisos.test.mjs` este censo hacía fallar la carga del archivo entero, con lo
// que P-3 y P-4 dejaban de probar nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codigo = (ruta) => sinComentarios(readFileSync(ruta, "utf8"));

// Los únicos que pueden nombrar lo viejo, cada uno con su motivo.
const PUEDEN_NOMBRAR_LO_VIEJO = new Map([
  ["lib/semanaOperativa/rutas.js", "define la constante de la ruta vieja"],
  ["app/modulos/transferencias/corte-de-semana/page.jsx", "es la ruta vieja, que solo redirige"],
  ["app/api/transferencias/acuerdos/route.js", "es el endpoint viejo, sin pantalla; sacarlo no entra en PR-2"],
]);

test("nadie fuera de la redirección nombra la ruta vieja ni dice «corte de semana»", () => {
  const archivos = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", "app", "components", "lib"],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter((r) => /\.(js|jsx|mjs)$/.test(r) && !/\.test\.mjs$/.test(r) && existsSync(r));
  assert.ok(archivos.length > 500, `la enumeración vino corta (${archivos.length})`);

  const ofensores = [];
  for (const ruta of archivos) {
    if (PUEDEN_NOMBRAR_LO_VIEJO.has(ruta)) continue;
    const texto = codigo(ruta);
    if (/corte-de-semana|RUTA_VIEJA_CORTE_DE_SEMANA/.test(texto)) ofensores.push(`${ruta}: la ruta vieja`);
    if (/corte de semana/i.test(texto)) ofensores.push(`${ruta}: «corte de semana» fuera de un comentario`);
  }
  assert.deepEqual(ofensores, []);
});
