// UN FIXTURE CONFIGURADO QUE IGUAL SE SALTEA ES PEOR QUE NO TENERLO.
//
// ── EL AGUJERO QUE ESTE CANDADO TAPA ───────────────────────────────────────
//
// Los 21 candados del parser de listas de Arcor se saltean solos cuando falta el
// Excel real, con su motivo escrito en la salida. Eso está bien: el archivo lleva
// precios y nombres de proveedores y no puede entrar a un repositorio público.
//
// El problema es el otro caso, el que pasó el 2026-08-17: **el fixture estaba
// configurado en el `.env` y los 21 se salteaban igual**, porque el corredor de la
// suite no leía ese archivo. La suite informaba "skipped 21" en un renglón que
// nadie mira, terminaba en verde, y quien la leyera concluiría que el parser está
// probado. No lo estaba.
//
// Y no es una hipótesis: hasta ese día los 21 NO CORRIERON NUNCA en esta máquina.
//
// ── QUÉ AFIRMA, Y POR QUÉ ASÍ ──────────────────────────────────────────────
//
// **Si el `.env` declara un fixture, ese fixture tiene que llegar a los candados.**
// Ni más ni menos. En concreto, para cada variable declarada en el `.env`:
//
//   1. tiene que estar en `process.env` — si no está, el corredor dejó de cargar
//      el `.env` y los candados se van a saltear sin que nada se ponga rojo;
//   2. la ruta tiene que existir en el disco — un `.env` que apunta a un archivo
//      mudado deja el candado salteado por "no está", que se lee igual que "no lo
//      configuré".
//
// **Lo que NO afirma, a propósito:** que el fixture exista. En una máquina nueva o
// en una sesión de nube no está, el `.env` no lo declara, y este candado no dice
// nada. Exigirlo convertiría un salteo declarado —que es información— en un rojo
// permanente que nadie puede arreglar, y a los tres días alguien lo aflojaría.
//
// La asimetría es deliberada: no tener el archivo es una situación legítima;
// tenerlo configurado y que no llegue, no.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENV = path.join(RAIZ, ".env");

// Las variables de fixture que este candado vigila. Se leen del archivo de
// candados que las consume, NO de una lista escrita a mano acá: si mañana aparece
// un `ARCOR_FIXTURE_C`, entra solo.
const CONSUMIDOR = path.join(RAIZ, "lib/proveedores/listas/parsers/arcor.test.mjs");

function variablesDeFixture() {
  const src = fs.readFileSync(CONSUMIDOR, "utf8");
  // Sin los comentarios: la cabecera de ese archivo NOMBRA las variables en
  // prosa, y un candado que busca texto crudo las tomaría por código. Es la misma
  // trampa que ya se cobró tres veces en este repo.
  const codigo = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const nombres = new Set();
  for (const m of codigo.matchAll(/process\.env\.([A-Z0-9_]*FIXTURE[A-Z0-9_]*)/g)) {
    nombres.add(m[1]);
  }
  return [...nombres].sort();
}

/** Lo que el `.env` declara, sin tocar `process.env`. */
function declaradoEnElArchivo() {
  if (!fs.existsSync(ENV)) return {};
  const out = {};
  for (const linea of fs.readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const t = linea.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = val;
  }
  return out;
}

test("el consumidor sigue leyendo variables de fixture — si no, este candado no vigila nada", () => {
  // CONTROL DEL PROPIO CANDADO. Sin esto, el día que el archivo de candados se
  // renombre o cambie la forma de leer las variables, la lista sale vacía y los
  // dos tests de abajo pasan sin comprobar absolutamente nada. Un candado que se
  // queda sin objeto tiene que quejarse, no seguir en verde.
  assert.ok(fs.existsSync(CONSUMIDOR), `no existe ${path.relative(RAIZ, CONSUMIDOR)}`);
  const vars = variablesDeFixture();
  assert.ok(
    vars.length >= 2,
    `se esperaban al menos dos variables de fixture y se encontraron ${vars.length}: ${vars.join(", ") || "(ninguna)"}`
  );
});

test("un fixture declarado en el .env LLEGA a los candados", () => {
  const declarado = declaradoEnElArchivo();
  const vigiladas = variablesDeFixture().filter((v) => declarado[v] !== undefined);

  if (vigiladas.length === 0) {
    // Nada declarado: no hay nada que exigir. El salteo, si ocurre, es legítimo.
    return;
  }

  for (const nombre of vigiladas) {
    assert.ok(
      process.env[nombre],
      `${nombre} está en el .env y NO llegó a process.env. El corredor dejó de cargar el .env: ` +
        `los candados que la usan se van a saltear en silencio y la suite igual va a dar verde. ` +
        `Ver scripts/test/correr.mjs, cargarEnv().`
    );
  }
});

test("la ruta que declara el .env existe en el disco", () => {
  const declarado = declaradoEnElArchivo();
  const vigiladas = variablesDeFixture().filter((v) => declarado[v] !== undefined);

  for (const nombre of vigiladas) {
    const ruta = process.env[nombre] || declarado[nombre];
    assert.ok(
      fs.existsSync(ruta),
      `${nombre} apunta a un archivo que no está: ${ruta}. ` +
        `El candado que lo usa se saltea diciendo "no está en el repositorio", que se lee igual ` +
        `que "no lo configuré" — y acá SÍ estaba configurado.`
    );
  }
});
