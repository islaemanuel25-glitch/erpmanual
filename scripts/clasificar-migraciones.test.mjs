// Candados de scripts/clasificar-migraciones.mjs.
//
// Este candado existe para que el clasificador se pueda ROMPER SOLO. Un chequeo
// de despliegue que nadie prueba es un chequeo que el día que deje de marcar
// nada va a parecer que está diciendo "todo bien".
//
// Las dos fixtures viven en tests/migraciones/ y no se aplican nunca: no están
// en prisma/migrations/, así que Prisma no las ve.
//
// Correr con: node --test scripts/clasificar-migraciones.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { clasificarSql, sinComentarios, SALIDA, PATRONES } from "./clasificar-migraciones.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(AQUI, "..");
const SCRIPT = path.join(AQUI, "clasificar-migraciones.mjs");

const ADITIVA = "tests/migraciones/20260101000000_fixture_aditiva";
const DESTRUCTIVA = "tests/migraciones/20260101000001_fixture_destructiva";

const correr = (...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" });

// ---------------------------------------------------------------------------
// Los códigos de salida, que son el contrato con el que despliega
// ---------------------------------------------------------------------------

test("la fixture aditiva sale con 0", () => {
  const r = correr("--dir", ADITIVA);
  assert.equal(r.status, SALIDA.LIMPIO, r.stdout + r.stderr);
});

test("salir con 0 dice explícitamente que no es una autorización", () => {
  // Está en el candado porque es la parte que se borra sin querer al "limpiar"
  // la salida, y es justo la que evita que un 0 se lea como permiso.
  const r = correr("--dir", ADITIVA);
  assert.match(r.stdout, /NO ES UNA AUTORIZACIÓN/);
});

test("la fixture destructiva sale con 1 y nombra el archivo", () => {
  const r = correr("--dir", DESTRUCTIVA);
  assert.equal(r.status, SALIDA.MARCADO, r.stdout + r.stderr);
  assert.match(r.stdout, /NO ADITIVA/);
  assert.match(r.stdout, /fixture_destructiva/);
});

// ---------------------------------------------------------------------------
// Falla cerrado: nunca sale con 0 por no haber podido mirar
// ---------------------------------------------------------------------------

test("sin rango sale con 2, no con 0", () => {
  const r = correr();
  assert.equal(r.status, SALIDA.INDETERMINADO, r.stdout + r.stderr);
  assert.match(r.stderr, /INDETERMINADO/);
});

test("un SHA que no existe sale con 2", () => {
  const r = correr("--desde", "0".repeat(40));
  assert.equal(r.status, SALIDA.INDETERMINADO, r.stdout + r.stderr);
});

test("un directorio que no existe sale con 2", () => {
  const r = correr("--dir", "tests/migraciones/no-existe-a-proposito");
  assert.equal(r.status, SALIDA.INDETERMINADO, r.stdout + r.stderr);
});

// ---------------------------------------------------------------------------
// Los patrones, uno por uno
// ---------------------------------------------------------------------------

test("la fixture destructiva dispara los ocho patrones que ejercita", () => {
  const nombres = clasificarSql(
    `ALTER TABLE "P" DROP COLUMN "a";
     DROP INDEX IF EXISTS "i";
     ALTER TABLE "F" ALTER COLUMN "t" SET NOT NULL;
     ALTER TABLE "F" ALTER COLUMN "t" TYPE VARCHAR(50);
     ALTER TABLE "F" RENAME COLUMN "t" TO "d";
     ALTER TABLE "F"
       ADD COLUMN "o" TEXT NOT NULL;
     UPDATE "F" SET "a" = false;
     DELETE FROM "F" WHERE "id" < 0;`
  ).map((h) => h.patron);

  for (const esperado of [
    "DROP COLUMN",
    "DROP INDEX",
    "SET NOT NULL",
    "cambio de tipo de columna",
    "RENAME",
    "ADD COLUMN NOT NULL sin DEFAULT",
    "UPDATE de datos",
    "DELETE FROM",
  ]) {
    assert.ok(nombres.includes(esperado), `faltó marcar ${esperado}: ${nombres.join(", ")}`);
  }
});

test("ADD COLUMN NOT NULL CON default es aditiva", () => {
  // La distinción que más importa del set: con default, la versión vieja puede
  // seguir insertando sin mandar el campo. Sin default, no.
  const h = clasificarSql(`ALTER TABLE "F" ADD COLUMN "activo" BOOLEAN NOT NULL DEFAULT true;`);
  assert.deepEqual(h, []);
});

test("ADD COLUMN NOT NULL sin default sí se marca", () => {
  const h = clasificarSql(`ALTER TABLE "F" ADD COLUMN "obligatorio" TEXT NOT NULL;`);
  assert.equal(h.length, 1);
  assert.equal(h[0].patron, "ADD COLUMN NOT NULL sin DEFAULT");
});

test("ALTER TYPE ADD VALUE IF NOT EXISTS no se marca", () => {
  // Es la forma con la que este repo agrega valores de enum. Si se marcara,
  // frenaría todos los despliegues normales y el candado se terminaría
  // desactivando, que es la peor forma de perderlo.
  const h = clasificarSql(`ALTER TYPE "Estado" ADD VALUE IF NOT EXISTS 'TERMINADA';`);
  assert.deepEqual(h, []);
});

// ---------------------------------------------------------------------------
// Comentarios: una migración no se marca por su propia explicación
// ---------------------------------------------------------------------------

test("un comentario que menciona DROP COLUMN no marca la migración", () => {
  const h = clasificarSql(`-- Acá NO se hace DROP COLUMN a propósito, ver más abajo.
ALTER TABLE "F" ADD COLUMN "nota" TEXT;`);
  assert.deepEqual(h, []);
});

test("un bloque /* */ que menciona TRUNCATE tampoco marca", () => {
  const h = clasificarSql(`/* nada de TRUNCATE acá */
ALTER TABLE "F" ADD COLUMN "nota" TEXT;`);
  assert.deepEqual(h, []);
});

test("sacar comentarios conserva las posiciones", () => {
  // Se reemplaza por espacios y no por vacío: si se comieran los caracteres,
  // el número de línea que se le muestra a la persona apuntaría al renglón
  // equivocado, y peor, dos palabras separadas por un comentario quedarían
  // pegadas formando una coincidencia que no existe.
  const original = `ALTER /* x */ TABLE "F";`;
  assert.equal(sinComentarios(original).length, original.length);
  assert.match(sinComentarios(original), /ALTER {9}TABLE/);
});

test("la fixture aditiva menciona DROP COLUMN en un comentario y aun así pasa", () => {
  // Cierra el circuito: la fixture del disco, no una cadena de este archivo.
  const r = correr("--dir", ADITIVA);
  assert.equal(r.status, SALIDA.LIMPIO, r.stdout);
});

// ---------------------------------------------------------------------------
// Inventario: sumar un patrón tiene que ser deliberado
// ---------------------------------------------------------------------------

test("los patrones son los 13 esperados, cada uno con su motivo", () => {
  assert.equal(PATRONES.length, 13);
  for (const p of PATRONES) {
    assert.ok(p.nombre, "un patrón sin nombre");
    assert.ok(p.motivo && p.motivo.length > 20, `el patrón ${p.nombre} no explica por qué rompe`);
    assert.ok(p.re instanceof RegExp);
  }
});
