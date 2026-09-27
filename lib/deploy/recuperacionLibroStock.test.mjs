// CANDADO: LA RECUPERACIÓN DE libro_stock ES ESTRECHA Y NO TOCA LO QUE RECUPERA.
//
//   node --test lib/deploy/recuperacionLibroStock.test.mjs
//
// Lo que ejerce PostgreSQL —que el diagnóstico diga CASO_1 solo cuando debe y que
// la cadena no resuelva cuando dice FRENAR— está en
// `scripts/pruebas-db/recuperacionLibroStock.mjs`. Acá va lo que se puede afirmar
// leyendo archivos, y que nadie más cuidaría:
//
//   · que la migración del libro y la anterior siguen byte por byte como se
//     probaron: la recuperación se diseñó para ESE archivo;
//   · que el diagnóstico sabe cuáles son las migraciones anteriores al libro;
//   · que el diagnóstico y el precheck son de solo lectura;
//   · que el runbook usa el comando exacto que acepta la guardia.
//
// Todo lo que lee SQL lo lee sin comentarios (regla 5 de CLAUDE.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import {
  ARCHIVO_DIAGNOSTICO,
  ARCHIVO_PRECHECK,
  COMANDO_PRECHECK,
  COMANDO_RECUPERACION,
  MIGRACION_ANTERIOR,
  MIGRACION_LIBRO_STOCK,
  RESULTADO,
  comandoDiagnostico,
} from "./recuperacionLibroStock.mjs";

const sinComentariosSql = (t) => t.replace(/--[^\n]*/g, "");
const sha256 = (ruta) => createHash("sha256").update(readFileSync(ruta)).digest("hex");
const archivoDe = (m) => `prisma/migrations/${m}/migration.sql`;

// ── LAS MIGRACIONES NO SE TOCAN ────────────────────────────────────────────

test("la migración del libro sigue siendo EXACTAMENTE la que se probó y se mergeó en #92", () => {
  // Si cambia una línea, la recuperación deja de estar probada para ese archivo, y
  // en producción Prisma además la vería como una migración aplicada modificada.
  // Cambiar este hash obliga a volver a correr la prueba de recuperación.
  assert.equal(sha256(archivoDe(MIGRACION_LIBRO_STOCK)), "b0549080572e026604fb2a99bec00b7ee60eb4560dd897d05274158c4d9840e7");
});

test("la migración anterior, correccion_caja, tampoco se toca", () => {
  assert.equal(sha256(archivoDe(MIGRACION_ANTERIOR)), "ab4f3d15e98ff8b241218e625ff1d1f64265478dcf656dbb3f0625d597bb0f2c");
});

test("el tope de 3 s y el candado de la activación siguen donde el diagnóstico los busca", () => {
  // El diagnóstico reconoce el caso por el lock timeout del LOCK TABLE de la
  // activación. Si la migración dejara de tener ese LOCK, el diagnóstico no
  // reconocería nunca el caso y la recuperación quedaría inalcanzable.
  const m = sinComentariosSql(readFileSync(archivoDe(MIGRACION_LIBRO_STOCK), "utf8"));
  assert.match(m, /set_config\('lock_timeout', '3s', true\)/);
  assert.match(m, /LOCK TABLE "StockLocal", "ProductoBase", "Local" IN SHARE ROW EXCLUSIVE MODE/);
});

// ── EL DIAGNÓSTICO ─────────────────────────────────────────────────────────

const diagnostico = () => readFileSync(ARCHIVO_DIAGNOSTICO, "utf8");

test("el diagnóstico conoce exactamente las migraciones anteriores al libro", () => {
  const delArbol = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "prisma/migrations"], { encoding: "utf8" })
    .split("\n")
    .map((l) => /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(l)?.[1])
    .filter(Boolean)
    .filter((m) => m < MIGRACION_LIBRO_STOCK)
    .sort();
  const bloque = /c_anteriores CONSTANT text\[\] := ARRAY\[([\s\S]*?)\];/.exec(sinComentariosSql(diagnostico()));
  assert.ok(bloque, "el diagnóstico perdió su lista de migraciones anteriores");
  const enElDiagnostico = [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(enElDiagnostico, delArbol);
  assert.ok(enElDiagnostico.includes(MIGRACION_ANTERIOR));
});

test("el diagnóstico habla de la misma migración y dice los mismos resultados que el código", () => {
  const d = sinComentariosSql(diagnostico());
  assert.ok(d.includes(`c_libro CONSTANT text := '${MIGRACION_LIBRO_STOCK}'`));
  assert.ok(d.includes(`c_anterior CONSTANT text := '${MIGRACION_ANTERIOR}'`));
  for (const r of Object.values(RESULTADO)) assert.ok(d.includes(`RESULTADO: ${r}`), r);
});

test("el diagnóstico exige las seis condiciones, y 55P03 y lock timeout por separado", () => {
  const d = sinComentariosSql(diagnostico());
  assert.match(d, /v_pendientes = ARRAY\[c_libro\]/, "1. la única fallida");
  assert.match(d, /applied_steps_count = 0/, "2. sin pasos");
  assert.match(d, /v_logs LIKE '%55P03%'/, "3. SQLSTATE");
  assert.match(d, /v_logs ILIKE '%lock timeout%'/, "4. lock timeout");
  assert.match(d, /cardinality\(v_faltan\) = 0/, "5. anteriores aplicadas");
  assert.match(d, /cardinality\(v_restos\) = 0/, "6. ningún objeto del libro");
});

test("el diagnóstico y el precheck son de SOLO LECTURA", () => {
  for (const archivo of [ARCHIVO_DIAGNOSTICO, ARCHIVO_PRECHECK]) {
    assert.ok(existsSync(archivo), archivo);
    const s = sinComentariosSql(readFileSync(archivo, "utf8"));
    assert.match(s, /BEGIN TRANSACTION READ ONLY;/, `${archivo}: tiene que correr en una transacción de solo lectura`);
    assert.match(s.trim(), /ROLLBACK;$/, `${archivo}: tiene que terminar en ROLLBACK`);
    assert.doesNotMatch(s, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|VACUUM|COPY)\b/i, archivo);
    assert.match(s, /\\set ON_ERROR_STOP 1/, `${archivo}: un error tiene que cortar psql con código distinto de 0`);
  }
});

// ── LOS COMANDOS Y EL RUNBOOK ──────────────────────────────────────────────

test("el runbook de /deploy usa los comandos EXACTOS, no una copia a mano", () => {
  // Si alguien copia el comando al runbook con un espacio de más, la guardia lo
  // rechaza el día que hace falta. Un runbook que no coincide con la guardia es
  // peor que ninguno.
  const skill = readFileSync(".claude/skills/deploy/SKILL.md", "utf8");
  assert.ok(skill.includes(COMANDO_RECUPERACION), "el runbook no trae el comando de recuperación exacto");
  assert.ok(skill.includes(COMANDO_PRECHECK), "el runbook no trae el precheck exacto");
  assert.ok(skill.includes(comandoDiagnostico("recuperar")), "el runbook no trae el diagnóstico en modo recuperar");
  assert.ok(skill.includes(comandoDiagnostico("revertida")), "el runbook no trae el diagnóstico en modo revertida");
  assert.match(skill, /DOS intentos/);
  assert.match(skill, /NUNCA\s+un\s+tercer\s+intento/i);
});

test("ni el diagnóstico ni el precheck nombran a prisma: la guardia no los intercepta", () => {
  for (const c of [comandoDiagnostico("recuperar"), comandoDiagnostico("revertida"), COMANDO_PRECHECK]) {
    assert.doesNotMatch(c, /\bprisma\b/, c);
  }
});

test("la prueba de base de la recuperación corre en CI", () => {
  assert.match(readFileSync(".github/workflows/verificacion.yml", "utf8"), /scripts\/pruebas-db\/recuperacionLibroStock\.mjs/);
});
