// EL COMANDO DE LA SUITE TIENE QUE MIRAR TODOS LOS CANDADOS QUE EXISTEN.
//
// ── QUÉ QUEDÓ DE LA VERSIÓN ANTERIOR, Y QUÉ SE FUE ────────────────────────
//
// Esta prueba nació con dos mitades. La primera preguntaba si cada archivo
// LLEGARÍA A CARGARSE, recorriendo su árbol de imports a mano. **Esa mitad se
// borró entera**, y no por simplificar: estaba de más desde el primer día.
//
// `scripts/alias-loader.mjs` —que ya existía en el repo— resuelve el alias,
// transforma el JSX con el SWC que Next trae y sustituye `next/link` por un
// doble. Con ese cargador CARGAN LOS 159 ARCHIVOS, así que una mitad dedicada a
// detectar los que no cargan estaba modelando un problema que no existe. Las ocho
// excepciones que declaraba —los seis de caja, `SunmiButton` y `authorize`— corren
// y pasan sus candados; se fueron con ella.
//
// ── LA MITAD QUE SIGUE VIVA, Y POR QUÉ ────────────────────────────────────
//
// Que un archivo PUEDA correr no sirve de nada si el comando no lo mira. Eso sí
// pasó y es lo que esto defiende: durante mucho tiempo `package.json` no tuvo
// script `test`, y cuando se le puso uno, la primera versión enumeraba con tres
// globs escritos mirando dónde estaban los archivos ESE DÍA.
//
// **Un candado que el comando no mira se ve igual que uno que pasa.** No aparece
// en rojo con el nombre de lo que afirma: no aparece.
//
// ── CÓMO PREGUNTA ────────────────────────────────────────────────────────
//
// Compara DOS enumeraciones que se hacen distinto a propósito:
//
//   · lo que HAY — recorriendo el disco con `readdirSync` desde la raíz, que ve
//     todo: trackeado, sin trackear e incluso ignorado.
//   · lo que el COMANDO MIRA — llamando a `archivosDeCandado()` de
//     `scripts/test/correr.mjs`, o sea la función que el comando usa de verdad y
//     no una copia de su criterio.
//
// Si las dos se hicieran igual, la comparación sería una tautología y daría verde
// siempre.
//
//   npm test    (o: node --import ./scripts/alias-loader.mjs --test <archivo>)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { archivosDeCandado } from "../../scripts/test/correr.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** El piso que hace que un verde signifique algo. Al escribirlo eran 159. */
const PISO = 120;

// Árboles que no son código del proyecto. `.next` y `node_modules` traen sus
// propios archivos de prueba y no son candados de nadie.
const SALTAR = new Set(["node_modules", ".next", ".git", "backups", "pgdata", "public"]);

/** Todo lo que hay en el disco, mire git lo que mire. */
function enElDisco() {
  const salida = [];
  const recorrer = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SALTAR.has(ent.name)) continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) recorrer(p);
      else if (ent.name.endsWith(".test.mjs")) {
        salida.push(path.relative(RAIZ, p).replace(/\\/g, "/"));
      }
    }
  };
  recorrer(RAIZ);
  return salida.sort();
}

test("el comando de suite MIRA todos los archivos de candados que existen", () => {
  const hay = enElDisco();
  const mira = archivosDeCandado();

  // ── EL CONTROL QUE HACE QUE EL VERDE VALGA ───────────────────────────────
  //
  // Si cualquiera de las dos enumeraciones devolviera poco —porque cambió la
  // extensión, porque se movió una carpeta, porque `git ls-files` falló y
  // devolvió vacío— la comparación daría verde sin haber mirado nada. Un verde
  // así es peor que un rojo, y la salida NO es bajar el piso.
  assert.ok(
    hay.length >= PISO,
    `el recorrido del disco encontró ${hay.length} archivos y el piso es ${PISO}. La corrida NO vale.`
  );
  assert.ok(
    mira.length >= PISO,
    `el comando enumeró ${mira.length} archivos y el piso es ${PISO}. La corrida NO vale: ` +
      "revisar `archivosDeCandado` en scripts/test/correr.mjs."
  );

  const sinMirar = hay.filter((rel) => !mira.includes(rel));
  assert.deepEqual(
    sinMirar,
    [],
    "ESTOS ARCHIVOS DE CANDADOS EXISTEN Y EL COMANDO NO LOS MIRA:\n  " +
      sinMirar.join("\n  ") +
      "\n\nNo fallan ni pasan: no se ejecutan, y en el total no se nota. Casi siempre es que\n" +
      "el archivo está en una carpeta ignorada por git, o que `archivosDeCandado` se quedó\n" +
      "corta. Arreglar la enumeración, no agregar una excepción."
  );
});

test("las dos enumeraciones no son la misma cosa disfrazada", () => {
  // La contraprueba del control de arriba. Si `archivosDeCandado` pasara a
  // recorrer el disco igual que `enElDisco`, la comparación sería una tautología
  // y daría verde para siempre. Se afirma que llegan al mismo resultado por
  // caminos distintos: una lo pregunta a git, la otra al sistema de archivos.
  const fuente = fs.readFileSync(path.join(RAIZ, "scripts/test/correr.mjs"), "utf8");
  assert.ok(
    /git\b[\s\S]{0,80}ls-files/.test(fuente),
    "`archivosDeCandado` dejó de preguntarle a git: la comparación del candado de arriba " +
      "pasa a ser una tautología y no afirma nada"
  );
  assert.ok(
    fuente.includes("--others"),
    "`archivosDeCandado` dejó de pedir `--others`: un candado nuevo sin commitear volvería " +
      "a quedar afuera del comando, que es una de las dos formas de nacer mudo"
  );
});

test("un candado sin commitear ENTRA en la enumeración del comando", () => {
  // Es la mitad que `git ls-files` a secas no cubre, y se ejerce de verdad: se
  // crea un archivo sin trackear, se pregunta, y se borra.
  const nuevo = path.join(RAIZ, "lib", "sunmi", "_sinCommitear.test.mjs");
  fs.writeFileSync(nuevo, "// archivo temporal del candado de cobertura\n");
  try {
    const mira = archivosDeCandado();
    assert.ok(
      mira.includes("lib/sunmi/_sinCommitear.test.mjs"),
      "un archivo de candados recién escrito y sin commitear NO entra en la enumeración: " +
        "nacería mudo justo mientras alguien lo escribe"
    );
  } finally {
    fs.rmSync(nuevo, { force: true });
  }
});
