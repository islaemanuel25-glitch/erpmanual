import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarCodigoPropio,
  esRedundanteConGlobalPropio,
  mensajeColisionCodigoPropio,
} from "./codigoBarraPropio.js";

// ---------------------------------------------------------------------------
// normalizarCodigoPropio
// ---------------------------------------------------------------------------
test("normalizar: vacío / whitespace / null / undefined → null", () => {
  assert.equal(normalizarCodigoPropio(""), null);
  assert.equal(normalizarCodigoPropio("   "), null);
  assert.equal(normalizarCodigoPropio(null), null);
  assert.equal(normalizarCodigoPropio(undefined), null);
});
test("normalizar: recorta espacios y conserva el valor", () => {
  assert.equal(normalizarCodigoPropio("  ABC123 "), "ABC123");
  assert.equal(normalizarCodigoPropio(779123), "779123");
});

// ---------------------------------------------------------------------------
// esRedundanteConGlobalPropio — colapsar si == un global del propio producto
// ---------------------------------------------------------------------------
test("redundante: igual al principal o al secundario del propio producto → true", () => {
  assert.equal(esRedundanteConGlobalPropio("111", "111", "222"), true);
  assert.equal(esRedundanteConGlobalPropio("222", "111", "222"), true);
});
test("redundante: distinto de ambos globales → false", () => {
  assert.equal(esRedundanteConGlobalPropio("999", "111", "222"), false);
});
test("redundante: null nunca es redundante", () => {
  assert.equal(esRedundanteConGlobalPropio(null, "111", "222"), false);
  assert.equal(esRedundanteConGlobalPropio(null, null, null), false);
});

// ---------------------------------------------------------------------------
// mensajeColisionCodigoPropio — distingue el tipo de choque
// ---------------------------------------------------------------------------
test("mensaje: choque contra código propio de otro producto del local", () => {
  const row = { id: 5, codigo_barra_propio: "X1", base: { codigo_barra: "A", codigo_barra_secundario: null } };
  assert.match(mensajeColisionCodigoPropio(row, "X1"), /código propio de otro producto/i);
});
test("mensaje: choque contra código PRINCIPAL global de otro producto visible", () => {
  const row = { id: 6, codigo_barra_propio: null, base: { codigo_barra: "G9", codigo_barra_secundario: null } };
  assert.match(mensajeColisionCodigoPropio(row, "G9"), /código principal/i);
});
test("mensaje: choque contra código SECUNDARIO global de otro producto visible", () => {
  const row = { id: 7, codigo_barra_propio: null, base: { codigo_barra: "A", codigo_barra_secundario: "S5" } };
  assert.match(mensajeColisionCodigoPropio(row, "S5"), /código secundario/i);
});
test("mensaje: sin fila → null", () => {
  assert.equal(mensajeColisionCodigoPropio(null, "X"), null);
});
