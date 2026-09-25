// UNA SOLA FUENTE PARA LA SEMANA OPERATIVA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/semanaOperativa/unaSolaFuente.test.mjs
//
// Desde la migración `20260924230000_semana_operativa_ubicacion` la semana de una
// ubicación sale de `SemanaOperativaVigencia` y de ningún otro lado. La tabla
// vieja, `AcuerdoDepositoLocal`, quedó congelada con lo que tenía. Si algo del
// runtime la volviera a leer, habría dos fuentes: las dos andarían, ninguna
// fallaría, y un día dirían semanas distintas del mismo local sin que nada avise.
//
// Estos candados miran el CÓDIGO, así que sacan los comentarios antes de mirar:
// medio repo nombra la tabla vieja en prosa para explicar por qué ya no la usa.
//
// La enumeración es `git ls-files --cached --others --exclude-standard`: un
// archivo recién escrito y sin commitear también cuenta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const archivos = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.js", "*.jsx", "*.mjs", "*.ts", "*.tsx"],
  { encoding: "utf8" }
)
  .split("\n")
  .filter(Boolean)
  .filter((r) => !r.endsWith(".test.mjs"))
  .filter((r) => !r.startsWith("node_modules/") && !r.startsWith(".next/"));

const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const codigo = (ruta) => {
  try {
    return sinComentarios(readFileSync(ruta, "utf8"));
  } catch {
    return ""; // borrado en el árbol y todavía listado
  }
};

// ── LOS LUGARES DONDE LA TABLA VIEJA SÍ PUEDE APARECER ─────────────────────
//
// Una lista y no un `if`, cada uno con su motivo. Las migraciones y los
// documentos no son código de runtime y ni siquiera se enumeran acá.
const PUEDEN_LEER_EL_ACUERDO = new Map([
  [
    "scripts/diagnostico-semana-operativa.mjs",
    "compara el acuerdo viejo contra la vigencia migrada; nunca decide una semana",
  ],
  [
    "scripts/pruebas-db/semanaOperativa.mjs",
    "siembra acuerdos para ejercer el backfill de la migración contra PostgreSQL",
  ],
]);

const LA_TABLA_VIEJA = /\bacuerdoDepositoLocal\b|\bacuerdosComo(Local|Deposito)\b|"AcuerdoDepositoLocal"|\bacuerdoDeLocal\b/;

test("NADIE fuera de la lista lee ni escribe `AcuerdoDepositoLocal`", () => {
  const infractores = archivos.filter((r) => !PUEDEN_LEER_EL_ACUERDO.has(r) && LA_TABLA_VIEJA.test(codigo(r)));
  assert.deepEqual(
    infractores,
    [],
    `volvió a haber dos fuentes para la semana operativa: ${infractores.join(", ")}`
  );
  // Y la lista no tiene entradas muertas: un permiso que nadie usa es un agujero
  // esperando a alguien.
  for (const ruta of PUEDEN_LEER_EL_ACUERDO.keys()) {
    assert.ok(archivos.includes(ruta), `${ruta} está en la lista y ya no existe`);
  }
});

// Dos puertas desde el PR-2 —`programarSemanaOperativa` y
// `cancelarSemanaPendiente`—, y las dos viven en el mismo módulo, detrás del
// mismo bloqueo. Lo que se afirma es que nadie más escribe la tabla.
test("solo `semanaOperativaServer.js` escribe `SemanaOperativaVigencia` (programar y cancelar)", () => {
  const ESCRIBE = /\bsemanaOperativaVigencia\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\b|INSERT\s+INTO\s+"SemanaOperativaVigencia"|UPDATE\s+"SemanaOperativaVigencia"|DELETE\s+FROM\s+"SemanaOperativaVigencia"/i;
  const PUEDEN_ESCRIBIR = new Set([
    "lib/semanaOperativa/semanaOperativaServer.js",
    // El candado de base siembra y limpia sus propias filas.
    "scripts/pruebas-db/semanaOperativa.mjs",
  ]);
  const escriben = archivos.filter((r) => !PUEDEN_ESCRIBIR.has(r) && ESCRIBE.test(codigo(r)));
  assert.deepEqual(escriben, [], `escriben la semana sin pasar por las reglas: ${escriben.join(", ")}`);
});

test("el PUT viejo de «Corte de semana» escribe SOLO por la puerta nueva, con el permiso nuevo", () => {
  const ruta = codigo("app/api/transferencias/acuerdos/route.js");
  const put = ruta.slice(ruta.indexOf("export async function PUT"));
  assert.ok(put.length > 0 && put !== ruta, "no se encontró el PUT");
  assert.match(put, /programarSemanaOperativa\(/, "el PUT dejó de escribir por `programarSemanaOperativa`");
  assert.match(put, /checkPerm\(session,\s*PERMISO_SEMANA_OPERATIVA\)/, "el PUT no pide `config_local.semana_operativa`");
  assert.doesNotMatch(put, /transferencias\.crear/, "el PUT volvió a aceptar `transferencias.crear`");
  assert.doesNotMatch(put, /\.(upsert|create|update)\(/, "el PUT escribe algo más que la puerta canónica");
});

test("las lecturas de Transferencias pasan por el cargador canónico", () => {
  for (const ruta of ["app/api/transferencias/tablero/route.js", "app/api/transferencias/acuerdos/route.js"]) {
    assert.match(codigo(ruta), /vigenciasDeUbicaciones\(/, `${ruta} dejó de leer la semana del cargador canónico`);
  }
});

test("Finanzas y Compras NO se migraron en esta tanda", () => {
  // Decisión explícita: el período financiero sigue con su corte fijo y la
  // recepción de compras con lo suyo. Si alguno empieza a leer la semana de la
  // ubicación, es otra tanda y tiene que decirlo.
  for (const ruta of [
    "lib/finanzas/periodoFinanciero.js",
    "lib/finanzas/calendarioDePagos.js",
    "app/modulos/compras-proveedor/recepcion/page.jsx",
  ]) {
    assert.doesNotMatch(codigo(ruta), /semanaOperativa/i, `${ruta} se migró sin que la tanda lo diga`);
  }
});
