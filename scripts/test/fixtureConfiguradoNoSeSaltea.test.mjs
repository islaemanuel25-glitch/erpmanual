// UN FIXTURE QUE ESTÁ PUESTO Y IGUAL SE SALTEA ES PEOR QUE NO TENERLO.
//
// ── EL AGUJERO QUE ESTE CANDADO TAPA ───────────────────────────────────────
//
// Los 21 candados del parser de listas de Arcor se saltean solos cuando falta el
// Excel real, con su motivo escrito en la salida. Eso está bien: el archivo lleva
// precios y nombres de proveedores y no puede entrar a un repositorio público.
//
// El problema es el otro caso, el que pasó el 2026-08-17: **el archivo estaba en
// la máquina y los 21 se salteaban igual**, porque lo que los conectaba era una
// variable de entorno que había que acordarse de exportar. La suite informaba
// "skipped 21" en un renglón que nadie mira, terminaba en verde, y quien la leyera
// concluiría que el parser está probado. No lo estaba: hasta ese día los 21 NO
// CORRIERON NUNCA en esta máquina.
//
// ── QUÉ AFIRMA ─────────────────────────────────────────────────────────────
//
// **Si la carpeta hermana está, sus fixtures tienen que LLEGAR a los candados.**
// Se rompería de tres formas y las tres tienen que ponerse rojas:
//
//   1. que el resolutor deje de encontrar la carpeta —una ruta relativa mal
//      contada, un renombre—;
//   2. que encuentre la carpeta pero no sepa clasificar sus archivos, por ejemplo
//      si alguien cambia las marcas del nombre;
//   3. que elija un archivo que no está en el disco.
//
// **Lo que NO afirma, a propósito:** que la carpeta exista. En una máquina nueva o
// en una sesión de nube no está, y este candado calla. Exigirla convertiría un
// salteo declarado —que es información— en un rojo permanente que nadie puede
// arreglar, y a los tres días alguien lo aflojaría.
//
// La asimetría es deliberada: no tener los archivos es una situación legítima;
// tenerlos y que no lleguen, no.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspeccionarFixtures, rutaFixture, CARPETA_FIXTURES } from "./fixturesExternos.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// El archivo que consume los fixtures. Se lee para comprobar que sigue pidiéndolos
// por acá — si volviera a leerlos de una variable de entorno, este candado dejaría
// de vigilar nada sin quejarse.
const CONSUMIDOR = path.join(RAIZ, "lib/proveedores/listas/parsers/arcor.test.mjs");

test("el consumidor pide sus fixtures al resolutor, no a una variable de entorno", () => {
  // CONTROL DEL PROPIO CANDADO, y de la decisión: los fixtures NO se configuran.
  // Sin esto, alguien podría volver a `process.env.ARCOR_FIXTURE` y todo lo de
  // abajo seguiría pasando mientras los candados vuelven a ser mudos.
  assert.ok(fs.existsSync(CONSUMIDOR), `no existe ${path.relative(RAIZ, CONSUMIDOR)}`);
  const src = fs.readFileSync(CONSUMIDOR, "utf8");
  // Sin comentarios: la cabecera de ese archivo NOMBRA las variables viejas al
  // explicar por qué se fueron, y un candado que busca texto crudo las tomaría por
  // código. Es la trampa que ya se cobró tres veces en este repo.
  const codigo = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  assert.match(codigo, /rutaFixture\(/, "el consumidor ya no le pide la ruta al resolutor");
  assert.doesNotMatch(
    codigo,
    /process\.env\.[A-Z0-9_]*FIXTURE/,
    "volvió a leer el fixture de una variable de entorno: eso lo devuelve a depender de que alguien la exporte"
  );
});

test("si la carpeta de fixtures está, los dos formatos se resuelven", () => {
  const r = inspeccionarFixtures();

  if (!r.existe) {
    // Sin carpeta no hay nada que exigir. El salteo es legítimo y está declarado.
    return;
  }

  for (const clave of ["A", "B"]) {
    assert.ok(
      r.elegidos[clave],
      `la carpeta ${path.basename(CARPETA_FIXTURES)} existe y NO se pudo elegir el formato ${clave}. ` +
        `Hay: ${r.archivos.join(", ") || "(ningún .xlsx)"}. ` +
        (r.ambiguos[clave] ? `Ambiguo entre: ${r.ambiguos[clave].join(", ")}. ` : "") +
        `Los candados que lo usan se van a saltear en silencio y la suite igual va a dar verde. ` +
        `Ver scripts/test/fixturesExternos.mjs.`
    );
  }
});

test("la ruta elegida existe de verdad en el disco", () => {
  const r = inspeccionarFixtures();
  if (!r.existe) return;

  for (const clave of ["A", "B"]) {
    const ruta = rutaFixture(clave);
    if (!ruta) continue; // ya lo cubre el test de arriba, y con mejor mensaje.
    assert.ok(
      fs.existsSync(ruta),
      `el formato ${clave} se resolvió a un archivo que no está: ${ruta}`
    );
  }
});
