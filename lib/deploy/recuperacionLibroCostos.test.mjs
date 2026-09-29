// CANDADO: LA RECUPERACIÓN DE LA ACTIVACIÓN DEL LIBRO DE COSTOS ES ESTRECHA Y
// NO TOCA LO QUE RECUPERA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/deploy/recuperacionLibroCostos.test.mjs
//
// Lo que ejerce PostgreSQL —que el diagnóstico diga CASO_1 solo cuando debe y que
// la cadena no resuelva cuando dice FRENAR— está en
// `scripts/pruebas-db/recuperacionLibroCostos.mjs`. Acá va lo que se afirma
// leyendo archivos:
//
//   · que el módulo de la guardia nombra lo mismo que `lib/libros/libroCostos.js`
//     (no lo puede importar: el hook corre con node 18);
//   · que los checksums del diagnóstico son los de los archivos del árbol, y que
//     conoce exactamente las migraciones anteriores a la activación;
//   · que el diagnóstico es de solo lectura y exige cada condición;
//   · que el runbook y la documentación usan el comando exacto que acepta la
//     guardia, y ya no mandan un `resolve` que la guardia rechaza.
//
// Todo lo que lee SQL lo lee sin comentarios (regla 5 de CLAUDE.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import {
  ARCHIVO_DIAGNOSTICO_COSTOS,
  COMANDO_RECUPERACION_COSTOS,
  MIGRACION_ACTIVACION_COSTOS,
  MIGRACION_INSTALACION_COSTOS,
  RESOLVE_PERMITIDO_COSTOS,
  RESULTADO,
  comandoDiagnosticoCostos,
} from "./recuperacionLibroCostos.mjs";
import { MIGRACION_ACTIVACION_COSTOS as ACTIVACION_DEL_LIBRO, MIGRACION_LIBRO_COSTOS, TRIGGERS_DE_ACTIVACION } from "../libros/libroCostos.js";

const sinComentariosSql = (t) => t.replace(/--[^\n]*/g, "");
const sha256 = (ruta) => createHash("sha256").update(readFileSync(ruta)).digest("hex");
const archivoDe = (m) => `prisma/migrations/${m}/migration.sql`;
const diagnostico = () => sinComentariosSql(readFileSync(ARCHIVO_DIAGNOSTICO_COSTOS, "utf8"));
const constanteTexto = (nombre) => new RegExp(`${nombre} CONSTANT text := '([^']+)'`).exec(diagnostico())?.[1];
const constanteArreglo = (nombre) => {
  const bloque = new RegExp(`${nombre} CONSTANT text\\[\\] := ARRAY\\[([\\s\\S]*?)\\];`).exec(diagnostico());
  assert.ok(bloque, `el diagnóstico perdió ${nombre}`);
  return [...bloque[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

// ── LOS NOMBRES ────────────────────────────────────────────────────────────

test("la guardia y el libro nombran las mismas migraciones", () => {
  assert.equal(MIGRACION_ACTIVACION_COSTOS, ACTIVACION_DEL_LIBRO);
  assert.equal(MIGRACION_INSTALACION_COSTOS, MIGRACION_LIBRO_COSTOS);
  assert.equal(RESOLVE_PERMITIDO_COSTOS, `prisma migrate resolve --rolled-back ${MIGRACION_ACTIVACION_COSTOS}`);
});

test("el diagnóstico habla de las mismas migraciones y dice los mismos resultados que el código", () => {
  assert.equal(constanteTexto("c_activacion"), MIGRACION_ACTIVACION_COSTOS);
  assert.equal(constanteTexto("c_instalacion"), MIGRACION_INSTALACION_COSTOS);
  for (const r of Object.values(RESULTADO)) assert.ok(diagnostico().includes(`RESULTADO: ${r}`), r);
});

test("los checksums del diagnóstico son los sha256 de los archivos del árbol", () => {
  // Prisma guarda el sha256 del migration.sql en `checksum` (medido). Si un
  // archivo cambia, la fila fallida ya no es de ESE archivo y el diagnóstico
  // frena: cambiar el hash obliga a volver a correr la prueba de base.
  assert.equal(constanteTexto("c_checksum_activacion"), sha256(archivoDe(MIGRACION_ACTIVACION_COSTOS)));
  assert.equal(constanteTexto("c_checksum_instalacion"), sha256(archivoDe(MIGRACION_INSTALACION_COSTOS)));
});

test("el diagnóstico conoce exactamente las migraciones anteriores a la activación", () => {
  const delArbol = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "prisma/migrations"], { encoding: "utf8" })
    .split("\n")
    .map((l) => /^prisma\/migrations\/([^/]+)\/migration\.sql$/.exec(l)?.[1])
    .filter(Boolean)
    .filter((m) => m < MIGRACION_ACTIVACION_COSTOS)
    .sort();
  assert.deepEqual(constanteArreglo("c_anteriores").sort(), delArbol);
  assert.ok(delArbol.includes(MIGRACION_INSTALACION_COSTOS));
});

test("el diagnóstico mira los mismos seis triggers que libro_costo_estado()", () => {
  assert.deepEqual(constanteArreglo("c_triggers"), [...TRIGGERS_DE_ACTIVACION]);
});

// ── EL DIAGNÓSTICO ─────────────────────────────────────────────────────────

test("el diagnóstico exige cada condición del caso recuperable", () => {
  const d = diagnostico();
  assert.match(d, /v_pendientes = ARRAY\[c_activacion\]/, "1. la única fallida");
  assert.match(d, /applied_steps_count = 0/, "2. sin pasos");
  assert.match(d, /v_logs LIKE '%55P03%'/, "3. SQLSTATE");
  assert.match(d, /v_logs ILIKE '%lock timeout%'/, "4. lock timeout");
  assert.match(d, /v_logs LIKE '%function libro_costo_activar\(\)%'/, "4. en la función de activación");
  assert.match(d, /v_ultima\.checksum = c_checksum_activacion/, "5. el archivo exacto");
  assert.match(d, /cardinality\(v_faltan\) = 0/, "6. anteriores aplicadas");
  assert.match(d, /checksum = c_checksum_instalacion/, "6. la instalación del árbol");
  assert.match(d, /cardinality\(v_restos\) = 0/, "7. el libro vacío");
  assert.match(d, /"libro_costo_estado"\(\)/, "8. la pregunta canónica");
  assert.match(d, /v_estado\.estado = 'INTENTO_FALLIDO'/);
  assert.match(d, /v_estado\.estado = 'NO_ACTIVADO'/);
});

test("el diagnóstico es de SOLO LECTURA", () => {
  assert.ok(existsSync(ARCHIVO_DIAGNOSTICO_COSTOS));
  const s = diagnostico();
  assert.match(s, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(s.trim(), /ROLLBACK;$/);
  assert.doesNotMatch(s, /\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COMMIT|VACUUM|COPY)\b/i);
  assert.doesNotMatch(s, /libro_costo_activar"?\s*\(\)\s*;/, "el diagnóstico no llama a la activación");
  assert.match(s, /\\set ON_ERROR_STOP 1/);
});

// ── LOS COMANDOS, EL RUNBOOK Y LA DOCUMENTACIÓN ────────────────────────────

test("el runbook de /deploy usa los comandos EXACTOS", () => {
  const skill = readFileSync(".claude/skills/deploy/SKILL.md", "utf8");
  assert.ok(skill.includes(COMANDO_RECUPERACION_COSTOS), "el runbook no trae el comando de recuperación exacto");
  assert.ok(skill.includes(comandoDiagnosticoCostos("recuperar")), "el runbook no trae el diagnóstico en modo recuperar");
  assert.ok(skill.includes(comandoDiagnosticoCostos("revertida")), "el runbook no trae el diagnóstico en modo revertida");
});

test("la documentación del libro ya no manda un resolve que la guardia rechaza", () => {
  // Era la contradicción: `docs/architecture/libro-de-costos.md` decía
  // `prisma migrate resolve --rolled-back <esa migración>`, y la guardia lo
  // rechaza siempre. El único resolve que puede nombrar es el comando exacto.
  const doc = readFileSync("docs/architecture/libro-de-costos.md", "utf8");
  assert.ok(doc.includes(COMANDO_RECUPERACION_COSTOS), "el doc no trae el comando exacto");
  assert.doesNotMatch(doc.split(COMANDO_RECUPERACION_COSTOS).join(""), /migrate resolve/, "el doc nombra otro migrate resolve");
});

test("ni el diagnóstico solo nombra a prisma: la guardia no lo intercepta", () => {
  for (const c of [comandoDiagnosticoCostos("recuperar"), comandoDiagnosticoCostos("revertida")]) {
    assert.doesNotMatch(c, /\bprisma\b/, c);
  }
});

test("la prueba de base de la recuperación corre en CI", () => {
  assert.match(readFileSync(".github/workflows/verificacion.yml", "utf8"), /scripts\/pruebas-db\/recuperacionLibroCostos\.mjs/);
});
