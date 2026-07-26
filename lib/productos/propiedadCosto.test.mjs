import { test } from "node:test";
import assert from "node:assert/strict";
import {
  esProductoDeDeposito,
  localPropietarioDelCosto,
  puedeEditarCosto,
  mensajeCostoNoEditable,
  mismoCosto,
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
