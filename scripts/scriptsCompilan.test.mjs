// TODOS LOS SCRIPTS COMPILAN.
//
// ── POR QUÉ HACE FALTA, Y ES LA CUARTA VEZ ─────────────────────────────────
//
// Los scripts de `scripts/` no los importa ningún candado, así que la suite
// puede estar entera en verde con uno que ni siquiera parsea. El 2026-08-13
// pasó: un backtick adentro de un COMENTARIO, adentro de un template literal,
// cerró el literal y dejó `medir-desborde.mjs` sin compilar. Nada lo dijo — se
// descubrió al correrlo, y el error que salió apuntaba a una línea que no era.
//
// Es la cuarta vez del backtick en este repo, y la primera dentro de un
// comentario, que es donde menos se mira. Las tres anteriores fueron escribiendo
// código por shell, y por eso `CLAUDE.md` prohíbe esa vía. Ésta entró por el
// editor: la regla vieja no la tapaba.
//
// Con esto, la quinta se agarra sola y en la corrida normal.
//
// ── QUÉ COMPRUEBA, QUE NO ES LO MISMO QUE FUNCIONAR ────────────────────────
//
// `node --check` parsea; no ejecuta. No dice que el script haga lo suyo — dice
// que es JavaScript. Alcanza para esta familia de defectos y no pretende más.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

/** `git ls-files` recorre el repo entero; `readdirSync` mira un solo nivel. */
const listados = execSync("git ls-files scripts", { cwd: RAIZ, encoding: "utf8" })
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /\.(mjs|cjs|js)$/.test(l))
  // Los `.test.mjs` los compila el propio corredor al importarlos.
  .filter((l) => !l.endsWith(".test.mjs"));

const compila = (rutaAbs) => spawnSync(process.execPath, ["--check", rutaAbs], { encoding: "utf8" });

test("EL CHEQUEO ATRAPA UN BACKTICK QUE CIERRA EL LITERAL", () => {
  // Primero se ejerce el caso que lo activa, con la forma exacta del defecto
  // real: un backtick adentro de un comentario adentro de un template literal.
  // Sin esto no se sabe si el candado prueba algo.
  const carpeta = fs.mkdtempSync(path.join(RAIZ, ".compila-"));
  const roto = path.join(carpeta, "roto.mjs");
  fs.writeFileSync(
    roto,
    'const x = `(() => {\n  // el `componente` de acá cierra el literal\n  return 1;\n})()`;\nexport default x;\n'
  );
  try {
    const r = compila(roto);
    assert.notEqual(r.status, 0, "el chequeo no vio un archivo que no parsea");
    assert.match(`${r.stderr}`, /SyntaxError/);
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
});

test("TODOS LOS SCRIPTS DEL REPO PARSEAN", () => {
  // Que haya mirado algo: un patrón que no matchea nada da cero errores y
  // parece un verde.
  assert.ok(listados.length > 40, `solo se enumeraron ${listados.length} scripts: revisá el alcance`);

  const rotos = [];
  for (const rel of listados) {
    const r = compila(path.join(RAIZ, rel));
    if (r.status !== 0) {
      const primera = `${r.stderr}`.split("\n").find((l) => /Error/.test(l)) || "(sin detalle)";
      rotos.push(`${rel} — ${primera.trim()}`);
    }
  }

  assert.deepEqual(rotos, [], `hay scripts que no compilan:\n  ${rotos.join("\n  ")}`);
});
