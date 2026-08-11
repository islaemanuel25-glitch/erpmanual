// Candados de la identidad del comprobante y del CUIT.
//
// Lo que se protege: que la misma factura no entre dos veces, que anular libere
// el número, y que el CUIT leído NUNCA complete el del proveedor.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizarNumero,
  claveIdentidad,
  evaluarAlta,
  compararCuit,
  CUIT,
  MOTIVO_RECHAZO,
} from "./identidad.js";

// ── Normalización ──────────────────────────────────────────────────────────

test("el mismo número escrito de distintas formas es el mismo número", () => {
  // Las dos facturas reales: DYSSA 0011-00794708 y DAS 0021 00011125.
  for (const [a, b] of [
    ["0011", "11"],
    ["00794708", "794708"],
    ["0021", "21"],
    ["00011125", "11125"],
    ["0011-00794708", "1100794708"],
  ]) {
    assert.equal(normalizarNumero(a), normalizarNumero(b), `${a} vs ${b}`);
  }
});

test("un número de todos ceros es cero, no vacío", () => {
  // Son cosas distintas: vacío es "no vino", cero es un número.
  assert.equal(normalizarNumero("0000"), "0");
  assert.equal(normalizarNumero(""), "");
  assert.equal(normalizarNumero(null), "");
});

test("EL TIPO NO ENTRA EN LA IDENTIDAD, a propósito", () => {
  // Una A y una B con el mismo punto de venta y número son un error de carga,
  // no dos comprobantes. Dejar el tipo afuera hace que se detecte.
  const a = claveIdentidad({ proveedorId: 17, puntoVenta: "0011", numero: "794708" });
  const b = claveIdentidad({ proveedorId: 17, puntoVenta: "0011", numero: "794708" });
  assert.equal(a, b);
  assert.ok(a);
});

test("sin proveedor, punto de venta o número no hay identidad", () => {
  for (const c of [
    {},
    { proveedorId: 17 },
    { proveedorId: 17, puntoVenta: "0011" },
    { proveedorId: 0, puntoVenta: "1", numero: "1" },
    { proveedorId: 17, puntoVenta: "", numero: "794708" },
  ]) {
    assert.equal(claveIdentidad(c), null, JSON.stringify(c));
  }
});

// ── El duplicado ───────────────────────────────────────────────────────────

const DYSSA_1 = { id: 1, puntoVenta: "0011", numero: "00794708", estado: "CIERRA", archivoHash: "abc" };

test("LA MISMA FACTURA SUBIDA DOS VECES SE RECHAZA", () => {
  const r = evaluarAlta({
    candidato: { proveedorId: 17, puntoVenta: "0011", numero: "00794708" },
    existentes: [DYSSA_1],
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_RECHAZO.DUPLICADO);
  assert.equal(r.choca, 1);
});

test("y se rechaza aunque se escriba distinto", () => {
  const r = evaluarAlta({
    candidato: { proveedorId: 17, puntoVenta: "11", numero: "794708" },
    existentes: [DYSSA_1],
  });
  assert.equal(r.ok, false, "sin normalizar, esta entraba dos veces");
});

test("ANULAR LIBERA EL NÚMERO", () => {
  // Tiene que decir lo mismo que el índice parcial de la migración, que
  // también excluye los ANULADO. Si una de las dos reglas cambia sin la otra,
  // una de las dos miente.
  const r = evaluarAlta({
    candidato: { proveedorId: 17, puntoVenta: "0011", numero: "00794708" },
    existentes: [{ ...DYSSA_1, estado: "ANULADO" }],
  });
  assert.equal(r.ok, true);
});

test("el mismo ARCHIVO se rechaza aunque el número se haya tipeado distinto", () => {
  const r = evaluarAlta({
    candidato: { proveedorId: 17, puntoVenta: "0011", numero: "999999", archivoHash: "abc" },
    existentes: [DYSSA_1],
  });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_RECHAZO.DUPLICADO_ARCHIVO);
});

test("un comprobante nuevo del mismo proveedor entra", () => {
  const r = evaluarAlta({
    candidato: { proveedorId: 17, puntoVenta: "0011", numero: "00794709", archivoHash: "otro" },
    existentes: [DYSSA_1],
  });
  assert.equal(r.ok, true);
  assert.equal(r.motivo, null);
});

test("el mismo número de OTRO proveedor entra: la identidad incluye al proveedor", () => {
  const r = evaluarAlta({
    candidato: { proveedorId: 8, puntoVenta: "0011", numero: "00794708" },
    existentes: [{ ...DYSSA_1, proveedorId: 17 }],
  });
  assert.equal(r.ok, true);
});

test("sin identidad se rechaza con su motivo, no con el de duplicado", () => {
  const r = evaluarAlta({ candidato: { proveedorId: 17, numero: "1" }, existentes: [] });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_RECHAZO.SIN_IDENTIDAD);
});

test("basura en la lista de existentes no rompe ni deja pasar de más", () => {
  for (const ex of [null, undefined, "no soy lista", [null, {}, { estado: "CIERRA" }]]) {
    const r = evaluarAlta({ candidato: { proveedorId: 17, puntoVenta: "1", numero: "1" }, existentes: ex });
    assert.equal(r.ok, true, JSON.stringify(ex));
  }
});

// ── El CUIT ────────────────────────────────────────────────────────────────

test("EL CUIT LEÍDO NUNCA COMPLETA EL DEL PROVEEDOR", () => {
  // El candado central de esta parte. Un CUIT mal leído que se autocompletara
  // dejaría al proveedor con un dato falso que nadie volvería a mirar — y como
  // Proveedor.cuit es único, un valor equivocado bloquea el alta del proveedor
  // que sí lo tiene.
  for (const caso of [
    { cuitLeido: "30-12345678-9", cuitProveedor: null },
    { cuitLeido: "30-12345678-9", cuitProveedor: "" },
    { cuitLeido: "30-12345678-9", cuitProveedor: "30-99999999-1" },
    { cuitLeido: "30-12345678-9", cuitProveedor: "30-12345678-9" },
  ]) {
    assert.equal(compararCuit(caso).completar, false, JSON.stringify(caso));
  }
});

test("si el proveedor no tiene CUIT, avisa y no completa", () => {
  const r = compararCuit({ cuitLeido: "30-12345678-9", cuitProveedor: null });
  assert.equal(r.estado, CUIT.PROVEEDOR_SIN_CUIT);
  assert.equal(r.avisa, true);
  assert.equal(r.completar, false);
});

test("si difieren, avisa", () => {
  const r = compararCuit({ cuitLeido: "30-12345678-9", cuitProveedor: "30-99999999-1" });
  assert.equal(r.estado, CUIT.DIFIERE);
  assert.equal(r.avisa, true);
});

test("si coinciden, no molesta — aunque estén escritos distinto", () => {
  for (const [a, b] of [
    ["30-12345678-9", "30123456789"],
    ["30.12345678.9", "30-12345678-9"],
    ["  30123456789  ", "30-12345678-9"],
  ]) {
    const r = compararCuit({ cuitLeido: a, cuitProveedor: b });
    assert.equal(r.estado, CUIT.COINCIDE, `${a} vs ${b}`);
    assert.equal(r.avisa, false);
  }
});

test("si el comprobante no trajo CUIT, no se inventa un aviso", () => {
  const r = compararCuit({ cuitLeido: null, cuitProveedor: "30-12345678-9" });
  assert.equal(r.estado, CUIT.SIN_LEER);
  assert.equal(r.avisa, false);
});

test("sin argumentos no explota", () => {
  assert.equal(compararCuit().estado, CUIT.SIN_LEER);
});
