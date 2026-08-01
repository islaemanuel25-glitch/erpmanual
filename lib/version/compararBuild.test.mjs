// Comparación de build ids: la decisión de bloquear un guardado sale de acá.
// La regla que más importa es la de seguridad: solo se bloquea con CERTEZA.

import test from "node:test";
import assert from "node:assert/strict";
import {
  compararBuild,
  normalizarBuildId,
  permiteGuardar,
  guardActivo,
  MISMA,
  DISTINTA,
  INDETERMINADO,
} from "./compararBuild.js";

const SHA = "49ea192155598471f77048bacf85e94016902cd7";
const OTRO = "990d7c3ef9f0e88df00a00dab4a1088d98dadc61";

// ── IDs iguales ──────────────────────────────────────────────────────────────

test("1. ids idénticos → MISMA, permite guardar", () => {
  assert.equal(compararBuild(SHA, SHA), MISMA);
  assert.equal(permiteGuardar(compararBuild(SHA, SHA)), true);
});

// ── IDs distintos ────────────────────────────────────────────────────────────

test("2. ids distintos → DISTINTA, bloquea", () => {
  assert.equal(compararBuild(SHA, OTRO), DISTINTA);
  assert.equal(permiteGuardar(compararBuild(SHA, OTRO)), false);
});

test("2b. mismo largo pero un carácter distinto → DISTINTA", () => {
  const casi = SHA.slice(0, -1) + "0";
  assert.equal(compararBuild(SHA, casi), DISTINTA);
});

// ── Espacios y mayúsculas ────────────────────────────────────────────────────

test("3. espacios laterales no cuentan", () => {
  assert.equal(compararBuild(`  ${SHA}  `, SHA), MISMA);
  assert.equal(compararBuild(SHA, `\n${SHA}\t`), MISMA);
});

test("3b. mayúsculas y minúsculas son el mismo SHA", () => {
  assert.equal(compararBuild(SHA.toUpperCase(), SHA), MISMA);
  assert.equal(compararBuild(SHA.toUpperCase(), SHA.toLowerCase()), MISMA);
});

test("3c. normalizarBuildId recorta y baja a minúsculas", () => {
  assert.equal(normalizarBuildId("  ABC123  "), "abc123");
  assert.equal(normalizarBuildId(""), "");
  assert.equal(normalizarBuildId(null), "");
  assert.equal(normalizarBuildId(undefined), "");
  assert.equal(normalizarBuildId(12345), "");
  assert.equal(normalizarBuildId({}), "");
});

// ── SHA corto vs largo ───────────────────────────────────────────────────────

test("4. SHA abreviado de 7 contra el completo → MISMA", () => {
  const corto = SHA.slice(0, 7); // 49ea192
  assert.equal(compararBuild(corto, SHA), MISMA);
  assert.equal(compararBuild(SHA, corto), MISMA);
});

test("4b. abreviados de 8 a 12 también coinciden", () => {
  for (const n of [8, 10, 12, 20, 39]) {
    assert.equal(compararBuild(SHA.slice(0, n), SHA), MISMA, `largo ${n}`);
  }
});

test("4c. abreviado con mayúsculas y espacios sigue coincidiendo", () => {
  assert.equal(compararBuild(`  ${SHA.slice(0, 7).toUpperCase()} `, SHA), MISMA);
});

// ── Prefijos NO compatibles ──────────────────────────────────────────────────

test("5. prefijo de menos de 7 no alcanza → DISTINTA", () => {
  for (const n of [1, 3, 6]) {
    assert.equal(compararBuild(SHA.slice(0, n), SHA), DISTINTA, `largo ${n}`);
  }
});

test("5b. un SHA que no es prefijo del otro → DISTINTA", () => {
  assert.equal(compararBuild(OTRO.slice(0, 10), SHA), DISTINTA);
});

test("5c. prefijo correcto pero de OTRO commit → DISTINTA", () => {
  // Comparte los primeros caracteres pero diverge dentro de los 7.
  assert.equal(compararBuild("49ea000", SHA), DISTINTA);
});

// ── Ausencias: fail open ─────────────────────────────────────────────────────

test("6. cliente vacío → INDETERMINADO, permite guardar", () => {
  for (const v of ["", "   ", null, undefined]) {
    const r = compararBuild(v, SHA);
    assert.equal(r, INDETERMINADO, `valor ${String(v)}`);
    assert.equal(permiteGuardar(r), true);
  }
});

test("7. servidor vacío → INDETERMINADO, permite guardar", () => {
  for (const v of ["", "   ", null, undefined]) {
    const r = compararBuild(SHA, v);
    assert.equal(r, INDETERMINADO, `valor ${String(v)}`);
    assert.equal(permiteGuardar(r), true);
  }
});

test("7b. los dos vacíos → INDETERMINADO", () => {
  assert.equal(compararBuild("", ""), INDETERMINADO);
  assert.equal(compararBuild(), INDETERMINADO);
});

// ── Política ─────────────────────────────────────────────────────────────────

test("8. solo DISTINTA bloquea", () => {
  assert.equal(permiteGuardar(MISMA), true);
  assert.equal(permiteGuardar(INDETERMINADO), true);
  assert.equal(permiteGuardar(DISTINTA), false);
});

test("8b. guardActivo: sin build id de cliente el guard no opera", () => {
  assert.equal(guardActivo(""), false);
  assert.equal(guardActivo("   "), false);
  assert.equal(guardActivo(null), false);
  assert.equal(guardActivo(undefined), false);
  assert.equal(guardActivo(SHA), true);
});

test("9. el caso real del 31/07: bundle viejo contra servidor nuevo", () => {
  const bundleViejo = "dcc84a1804eeda90ebf4ec2575359ecc5b62f73a";
  const servidorNuevo = "990d7c3ef9f0e88df00a00dab4a1088d98dadc61";
  const r = compararBuild(bundleViejo, servidorNuevo);
  assert.equal(r, DISTINTA);
  assert.equal(permiteGuardar(r), false);
});
