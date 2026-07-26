import { test } from "node:test";
import assert from "node:assert/strict";
import { puedeVerConfigLocal, PERMISOS_CONFIG_LOCAL, operarioObligatorio } from "./acceso.js";

// ---------------------------------------------------------------------------
// puedeVerConfigLocal(perfil) — gating de la sección Configuración (menú/landing)
// ---------------------------------------------------------------------------

test("admin (*) ve Configuración", () => {
  assert.equal(puedeVerConfigLocal({ permisos: ["*"] }), true);
});

test("DUEÑO_LOCAL con cualquier config_local.* ve Configuración", () => {
  assert.equal(puedeVerConfigLocal({ permisos: ["config_local.apariencia"] }), true);
  assert.equal(puedeVerConfigLocal({ permisos: ["config_local.pos"] }), true);
  assert.equal(puedeVerConfigLocal({ permisos: ["config_local.ticket"] }), true);
});

test("permiso de listas de precios también habilita la sección", () => {
  assert.equal(puedeVerConfigLocal({ permisos: ["listas_precios.ver"] }), true);
});

test("CAJERO (sin permisos de config) NO ve Configuración", () => {
  assert.equal(
    puedeVerConfigLocal({ permisos: ["pos.usar", "clientes.crear"] }),
    false
  );
});

test("perfil sin permisos / nulo → false (fail-closed)", () => {
  assert.equal(puedeVerConfigLocal({ permisos: [] }), false);
  assert.equal(puedeVerConfigLocal({}), false);
  assert.equal(puedeVerConfigLocal(null), false);
  assert.equal(puedeVerConfigLocal(undefined), false);
});

test("no confía en permisos que no sean array", () => {
  assert.equal(puedeVerConfigLocal({ permisos: "config_local.pos" }), false);
});

test("la lista de permisos incluye los 6 config_local.* + listas_precios.ver", () => {
  for (const p of [
    "config_local.apariencia",
    "config_local.stock",
    "config_local.pos",
    "config_local.ticket",
    "config_local.fidelidad",
    "config_local.alertas",
    "listas_precios.ver",
  ]) {
    assert.ok(PERMISOS_CONFIG_LOCAL.includes(p), `falta ${p}`);
  }
});

// ---------------------------------------------------------------------------
// operarioObligatorio(exigirOperador) — semántica CANÓNICA de ConfiguracionLocal
//   null/undefined = OBLIGATORIO (compat histórica; nunca se lee como false)
//   true           = OBLIGATORIO
//   false          = NO obligatorio
// ---------------------------------------------------------------------------

test("operarioObligatorio: null = obligatorio (compat histórica)", () => {
  assert.equal(operarioObligatorio(null), true);
});

test("operarioObligatorio: undefined = obligatorio (sin fila / campo ausente)", () => {
  assert.equal(operarioObligatorio(undefined), true);
});

test("operarioObligatorio: true = obligatorio", () => {
  assert.equal(operarioObligatorio(true), true);
});

test("operarioObligatorio: false = NO obligatorio (único valor que libera)", () => {
  assert.equal(operarioObligatorio(false), false);
});

test("operarioObligatorio: valores raros son fail-safe → obligatorio (nunca null→false)", () => {
  // Solo `false` estricto libera; 0/''/NaN NO deben interpretarse como no-obligatorio.
  assert.equal(operarioObligatorio(0), true);
  assert.equal(operarioObligatorio(""), true);
  assert.equal(operarioObligatorio(NaN), true);
});
