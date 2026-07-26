import { test } from "node:test";
import assert from "node:assert/strict";
import { puedeOperarSinOperador, perfilExentoDeOperador } from "./operador-exencion.js";

// ---------------------------------------------------------------------------
// puedeOperarSinOperador(session, { localId })  — regla central del backend
// ---------------------------------------------------------------------------

test("Admin + cualquier local válido → true", () => {
  assert.equal(puedeOperarSinOperador({ esAdmin: true }, { localId: 7 }), true);
  // Admin también exento aunque no venga localId (comportamiento histórico).
  assert.equal(puedeOperarSinOperador({ esAdmin: true }, {}), true);
});

test("DUEÑO_LOCAL + su propio local → true", () => {
  const s = { esDuenoLocal: true, localId: 5 };
  assert.equal(puedeOperarSinOperador(s, { localId: 5 }), true);
  // Coerción numérica: string "5" también matchea.
  assert.equal(puedeOperarSinOperador(s, { localId: "5" }), true);
});

test("DUEÑO_LOCAL + otro local → false", () => {
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: true, localId: 5 }, { localId: 9 }), false);
});

test("DUEÑO_LOCAL sin session.localId → false", () => {
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: true, localId: null }, { localId: 5 }), false);
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: true }, { localId: 5 }), false);
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: true, localId: 0 }, { localId: 0 }), false);
});

test("DUEÑO_LOCAL sin localId de operación → false", () => {
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: true, localId: 5 }, {}), false);
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: true, localId: 5 }, { localId: null }), false);
});

test("CAJERO (ni admin ni dueño) → false", () => {
  assert.equal(puedeOperarSinOperador({ esAdmin: false, esDuenoLocal: false, localId: 5 }, { localId: 5 }), false);
});

test("ENCARGADO (ni admin ni dueño) → false", () => {
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: false, localId: 5 }, { localId: 5 }), false);
});

test("JWT antiguo sin esDuenoLocal → false (flag ausente = false)", () => {
  // Sesión de un DUEÑO_LOCAL con token viejo: no trae el flag → NO exento.
  assert.equal(puedeOperarSinOperador({ localId: 5 }, { localId: 5 }), false);
});

test("session nula/indefinida → false", () => {
  assert.equal(puedeOperarSinOperador(null, { localId: 5 }), false);
  assert.equal(puedeOperarSinOperador(undefined, { localId: 5 }), false);
});

test("no confía en flags truthy no-booleanos (esDuenoLocal debe ser === true)", () => {
  assert.equal(puedeOperarSinOperador({ esDuenoLocal: 1, localId: 5 }, { localId: 5 }), false);
  assert.equal(puedeOperarSinOperador({ esAdmin: "sí" }, { localId: 5 }), false);
});

// ---------------------------------------------------------------------------
// perfilExentoDeOperador(perfil)  — espejo del predicado en el frontend
// ---------------------------------------------------------------------------

test("perfil: Admin exento", () => {
  assert.equal(perfilExentoDeOperador({ esAdmin: true }), true);
});

test("perfil: DUEÑO_LOCAL exento", () => {
  assert.equal(perfilExentoDeOperador({ esDuenoLocal: true }), true);
});

test("perfil: CAJERO/ENCARGADO NO exentos", () => {
  assert.equal(perfilExentoDeOperador({ esAdmin: false, esDuenoLocal: false }), false);
  assert.equal(perfilExentoDeOperador({}), false);
});

test("perfil: modulos.acceso_sin_operador ya NO exime (legacy)", () => {
  assert.equal(
    perfilExentoDeOperador({ permisos: ["modulos.acceso_sin_operador"] }),
    false
  );
});

test("perfil: null/undefined → false", () => {
  assert.equal(perfilExentoDeOperador(null), false);
  assert.equal(perfilExentoDeOperador(undefined), false);
});
