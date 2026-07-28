import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esProductoDeDeposito,
  localPropietarioDelCosto,
  puedeEditarCosto,
  mensajeCostoNoEditable,
  mismoCosto,
  puedeEditarBaseProducto,
  alcanceEdicionProducto,
  resolverRutaEdicion,
} from "./propiedadCosto.js";

const DEPO = 1;
const LOCAL_A = 2;
const LOCAL_B = 3;

// ---------------------------------------------------------------------------
// esProductoDeDeposito
// ---------------------------------------------------------------------------
test("producto con creadoEnLocalId=depósito → de depósito", () => {
  assert.equal(esProductoDeDeposito(DEPO, DEPO), true);
});
test("producto con creadoEnLocalId=null (legacy) → de depósito (D2)", () => {
  assert.equal(esProductoDeDeposito(null, DEPO), true);
});
test("producto con creadoEnLocalId=local → NO de depósito", () => {
  assert.equal(esProductoDeDeposito(LOCAL_A, DEPO), false);
});
test("sin depósito resoluble no se asume depósito para un creador concreto", () => {
  assert.equal(esProductoDeDeposito(LOCAL_A, null), false);
});

// ---------------------------------------------------------------------------
// localPropietarioDelCosto
// ---------------------------------------------------------------------------
test("dueño del costo: producto de depósito → el depósito", () => {
  assert.equal(localPropietarioDelCosto(DEPO, DEPO), DEPO);
  assert.equal(localPropietarioDelCosto(null, DEPO), DEPO);
});
test("dueño del costo: producto exclusivo → el local creador", () => {
  assert.equal(localPropietarioDelCosto(LOCAL_A, DEPO), LOCAL_A);
});

// ---------------------------------------------------------------------------
// puedeEditarCosto — el corazón de la regla
// ---------------------------------------------------------------------------
test("depósito edita costo de producto de depósito → permitido", () => {
  assert.equal(puedeEditarCosto(DEPO, DEPO, DEPO), true);
  assert.equal(puedeEditarCosto(DEPO, null, DEPO), true);
});
test("local edita costo de producto de depósito → RECHAZADO", () => {
  assert.equal(puedeEditarCosto(LOCAL_A, DEPO, DEPO), false);
  assert.equal(puedeEditarCosto(LOCAL_A, null, DEPO), false);
});
test("local creador edita costo de su producto exclusivo → permitido", () => {
  assert.equal(puedeEditarCosto(LOCAL_A, LOCAL_A, DEPO), true);
});
test("otro local edita costo de producto exclusivo ajeno → RECHAZADO", () => {
  assert.equal(puedeEditarCosto(LOCAL_B, LOCAL_A, DEPO), false);
});
test("depósito edita costo de producto exclusivo de un local → RECHAZADO", () => {
  assert.equal(puedeEditarCosto(DEPO, LOCAL_A, DEPO), false);
});
test("fail-closed: localId inválido o sin dueño resoluble → false", () => {
  assert.equal(puedeEditarCosto(0, DEPO, DEPO), false);
  assert.equal(puedeEditarCosto(null, DEPO, DEPO), false);
  assert.equal(puedeEditarCosto("x", DEPO, DEPO), false);
  // producto de depósito pero sin depósito resoluble → nadie edita
  assert.equal(puedeEditarCosto(DEPO, null, null), false);
});
test("coerción numérica: strings numéricos válidos", () => {
  assert.equal(puedeEditarCosto("2", "2", DEPO), true); // local A edita su exclusivo
});

// ---------------------------------------------------------------------------
// mensajeCostoNoEditable
// ---------------------------------------------------------------------------
test("mensaje: depósito vs otro local", () => {
  assert.match(mensajeCostoNoEditable(DEPO, DEPO), /administrado por el depósito/i);
  assert.match(mensajeCostoNoEditable(LOCAL_A, DEPO), /local que lo creó/i);
});

// ---------------------------------------------------------------------------
// mismoCosto — para distinguir "intento de cambio" de "reenvío sin cambio"
// ---------------------------------------------------------------------------
test("mismoCosto: iguales / distintos / null", () => {
  assert.equal(mismoCosto(100, 100), true);
  assert.equal(mismoCosto(100, 100.004), true); // dentro de tolerancia
  assert.equal(mismoCosto(100, 101), false);
  assert.equal(mismoCosto(null, null), true);
  assert.equal(mismoCosto(100, null), false);
  assert.equal(mismoCosto("100", 100), true);
  assert.equal(mismoCosto("", null), true);
});

// ---------------------------------------------------------------------------
// puedeEditarBaseProducto — misma regla de propiedad que el costo
// ---------------------------------------------------------------------------
test("editar base: depósito edita producto de depósito → permitido", () => {
  assert.equal(puedeEditarBaseProducto(DEPO, DEPO, DEPO), true);
  assert.equal(puedeEditarBaseProducto(DEPO, null, DEPO), true); // legacy → depósito
});
test("editar base: local creador edita su exclusivo → permitido", () => {
  assert.equal(puedeEditarBaseProducto(LOCAL_A, LOCAL_A, DEPO), true);
});
test("editar base: local sobre producto de depósito → RECHAZADO (solo override)", () => {
  assert.equal(puedeEditarBaseProducto(LOCAL_A, DEPO, DEPO), false);
  assert.equal(puedeEditarBaseProducto(LOCAL_A, null, DEPO), false);
});
test("editar base: local sobre exclusivo de otro local → RECHAZADO", () => {
  assert.equal(puedeEditarBaseProducto(LOCAL_B, LOCAL_A, DEPO), false);
});
test("editar base: es idéntico a puedeEditarCosto (dueño gobierna ambos)", () => {
  const casos = [
    [DEPO, DEPO, DEPO], [LOCAL_A, DEPO, DEPO], [LOCAL_A, LOCAL_A, DEPO],
    [LOCAL_B, LOCAL_A, DEPO], [DEPO, LOCAL_A, DEPO], [0, DEPO, DEPO], [DEPO, null, null],
  ];
  for (const [op, creado, depo] of casos) {
    assert.equal(puedeEditarBaseProducto(op, creado, depo), puedeEditarCosto(op, creado, depo));
  }
});

// ---------------------------------------------------------------------------
// alcanceEdicionProducto — base | override | deny
// ---------------------------------------------------------------------------
test("alcance: dueño (depósito de producto de depósito) → base", () => {
  assert.equal(alcanceEdicionProducto(DEPO, DEPO, DEPO), "base");
  assert.equal(alcanceEdicionProducto(DEPO, null, DEPO), "base");
});
test("alcance: dueño (local creador de su exclusivo) → base", () => {
  assert.equal(alcanceEdicionProducto(LOCAL_A, LOCAL_A, DEPO), "base");
});
test("alcance: local NO dueño sobre producto de depósito → override", () => {
  assert.equal(alcanceEdicionProducto(LOCAL_A, DEPO, DEPO), "override");
  assert.equal(alcanceEdicionProducto(LOCAL_A, null, DEPO), "override"); // legacy=depósito
});
test("alcance: local sobre exclusivo de OTRO local → deny", () => {
  assert.equal(alcanceEdicionProducto(LOCAL_B, LOCAL_A, DEPO), "deny");
  assert.equal(alcanceEdicionProducto(LOCAL_A, LOCAL_B, DEPO), "deny");
});
test("alcance: fail-closed con localId inválido → deny", () => {
  assert.equal(alcanceEdicionProducto(0, DEPO, DEPO), "deny");
  assert.equal(alcanceEdicionProducto(null, DEPO, DEPO), "deny");
});
test("alcance: sin depósito resoluble, producto de depósito legacy → override (nadie edita base)", () => {
  // creado=null → de depósito; sin dueño resoluble → no base; es de depósito → override.
  assert.equal(alcanceEdicionProducto(LOCAL_A, null, null), "override");
});

// ---------------------------------------------------------------------------
// resolverRutaEdicion — admin conserva comportamiento por ubicación
// ---------------------------------------------------------------------------
test("ruta admin: contexto depósito → base (cualquier producto)", () => {
  assert.equal(
    resolverRutaEdicion({ esAdmin: true, operandoEnLocalId: DEPO, esDepositoContext: true, creadoEnLocalId: LOCAL_A, depositoLocalId: DEPO }),
    "base"
  );
});
test("ruta admin: contexto local → override (producto de depósito)", () => {
  assert.equal(
    resolverRutaEdicion({ esAdmin: true, operandoEnLocalId: LOCAL_A, esDepositoContext: false, creadoEnLocalId: DEPO, depositoLocalId: DEPO }),
    "override"
  );
});
test("ruta admin: sin local → base", () => {
  assert.equal(
    resolverRutaEdicion({ esAdmin: true, operandoEnLocalId: 0, esDepositoContext: false, creadoEnLocalId: DEPO, depositoLocalId: DEPO }),
    "base"
  );
});
test("ruta no-admin: usa alcance por propiedad (dueño local → base)", () => {
  assert.equal(
    resolverRutaEdicion({ esAdmin: false, operandoEnLocalId: LOCAL_A, esDepositoContext: false, creadoEnLocalId: LOCAL_A, depositoLocalId: DEPO }),
    "base"
  );
});
test("ruta no-admin: local sobre producto de depósito → override", () => {
  assert.equal(
    resolverRutaEdicion({ esAdmin: false, operandoEnLocalId: LOCAL_A, esDepositoContext: false, creadoEnLocalId: DEPO, depositoLocalId: DEPO }),
    "override"
  );
});
test("ruta no-admin: local sobre exclusivo ajeno → deny", () => {
  assert.equal(
    resolverRutaEdicion({ esAdmin: false, operandoEnLocalId: LOCAL_B, esDepositoContext: false, creadoEnLocalId: LOCAL_A, depositoLocalId: DEPO }),
    "deny"
  );
});
