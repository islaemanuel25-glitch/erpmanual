// Qué se puede seleccionar para aplicar.
//
// El predicado es el mismo que usa la pantalla y el que usa el endpoint. Si se
// separaran, un cliente viejo podría marcar filas que el motor nunca consideró
// aplicables y el costo se escribiría igual.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MOTIVO_NO_SELECCIONABLE,
  TEXTO_NO_SELECCIONABLE,
  filaSeleccionable,
  idsSeleccionables,
  validarSeleccion,
  normalizarIds,
  resumirSeleccion,
} from "@/lib/proveedores/listas/seleccion";

const CONCILIADA = { estado: "CONCILIADA" };

function fila(extra = {}) {
  return {
    id: 1,
    estado: "LISTO_PARA_ACTUALIZAR",
    aplicada: false,
    seleccionada: false,
    productoBaseId: 10,
    costoMaestroPropuesto: 1500,
    ...extra,
  };
}

// ── Lo que sí ───────────────────────────────────────────────────────────────

test("una fila lista, no aplicada, en importación conciliada es seleccionable", () => {
  assert.deepEqual(filaSeleccionable(fila(), CONCILIADA), { ok: true, motivo: null });
});

// ── Los tres bloqueos del enunciado ─────────────────────────────────────────

test("importación en BORRADOR: nada es seleccionable", () => {
  const r = filaSeleccionable(fila(), { estado: "BORRADOR" });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_SELECCIONABLE.IMPORTACION_NO_CONCILIADA);
});

test("importación ya APLICADA: nada es seleccionable", () => {
  const r = filaSeleccionable(fila(), { estado: "APLICADA" });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_SELECCIONABLE.IMPORTACION_NO_CONCILIADA);
});

test("importación DESCARTADA: nada es seleccionable", () => {
  assert.equal(filaSeleccionable(fila(), { estado: "DESCARTADA" }).ok, false);
});

for (const estado of ["SIN_CAMBIOS", "NO_MACHEADO", "CODIGO_DUPLICADO", "FACTOR_DUDOSO", "EXCLUIDO", "BLOQUEADO", "ERROR"]) {
  test(`estado ${estado} no es seleccionable`, () => {
    const r = filaSeleccionable(fila({ estado }), CONCILIADA);
    assert.equal(r.ok, false);
    assert.equal(r.motivo, MOTIVO_NO_SELECCIONABLE.ESTADO_NO_APLICABLE);
  });
}

test("una fila ya aplicada no se puede volver a seleccionar", () => {
  const r = filaSeleccionable(fila({ aplicada: true }), CONCILIADA);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_SELECCIONABLE.YA_APLICADA);
});

// ── Defensa en profundidad ──────────────────────────────────────────────────

test("sin producto vinculado no es seleccionable aunque el estado diga que sí", () => {
  const r = filaSeleccionable(fila({ productoBaseId: null }), CONCILIADA);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, MOTIVO_NO_SELECCIONABLE.SIN_PRODUCTO);
});

test("sin costo propuesto no es seleccionable", () => {
  assert.equal(filaSeleccionable(fila({ costoMaestroPropuesto: null }), CONCILIADA).motivo,
    MOTIVO_NO_SELECCIONABLE.SIN_COSTO_PROPUESTO);
});

test("costo propuesto en cero no es seleccionable", () => {
  assert.equal(filaSeleccionable(fila({ costoMaestroPropuesto: 0 }), CONCILIADA).motivo,
    MOTIVO_NO_SELECCIONABLE.SIN_COSTO_PROPUESTO);
});

test("fila o importación ausentes no revientan", () => {
  assert.equal(filaSeleccionable(null, CONCILIADA).ok, false);
  assert.equal(filaSeleccionable(fila(), null).ok, false);
});

// ── Conjuntos ───────────────────────────────────────────────────────────────

test("idsSeleccionables devuelve solo los aplicables", () => {
  const filas = [
    fila({ id: 1 }),
    fila({ id: 2, estado: "BLOQUEADO" }),
    fila({ id: 3, aplicada: true }),
    fila({ id: 4 }),
  ];
  assert.deepEqual(idsSeleccionables(filas, CONCILIADA), [1, 4]);
});

test("validarSeleccion estricta rechaza el pedido completo si una fila no corresponde", () => {
  const filas = [fila({ id: 1 }), fila({ id: 2, estado: "BLOQUEADO" })];
  const r = validarSeleccion([1, 2], filas, CONCILIADA, { estricto: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.aceptadas, [1]);
  assert.equal(r.rechazadas.length, 1);
  assert.equal(r.rechazadas[0].id, 2);
  assert.equal(r.rechazadas[0].texto, TEXTO_NO_SELECCIONABLE.ESTADO_NO_APLICABLE);
});

test("validarSeleccion no estricta acepta lo que puede y explica lo demás", () => {
  const filas = [fila({ id: 1 }), fila({ id: 2, aplicada: true })];
  const r = validarSeleccion([1, 2], filas, CONCILIADA);
  assert.equal(r.ok, true);
  assert.deepEqual(r.aceptadas, [1]);
  assert.equal(r.rechazadas[0].motivo, MOTIVO_NO_SELECCIONABLE.YA_APLICADA);
});

test("un id que no pertenece a la importación se rechaza", () => {
  const r = validarSeleccion([99], [fila({ id: 1 })], CONCILIADA, { estricto: true });
  assert.equal(r.ok, false);
  assert.equal(r.rechazadas[0].id, 99);
});

// ── Entrada del cliente ─────────────────────────────────────────────────────

test("normalizarIds descarta basura y duplicados", () => {
  assert.deepEqual(normalizarIds([1, "2", 2, 0, -3, null, "x", 4.5, 7]), [1, 2, 7]);
});

test("normalizarIds con algo que no es lista devuelve vacío", () => {
  assert.deepEqual(normalizarIds("1,2,3"), []);
  assert.deepEqual(normalizarIds(undefined), []);
});

// ── Contador ────────────────────────────────────────────────────────────────

test("el resumen cuenta seleccionables, seleccionadas y aplicadas", () => {
  const filas = [
    fila({ id: 1, seleccionada: true }),
    fila({ id: 2 }),
    fila({ id: 3, estado: "BLOQUEADO", seleccionada: true }),
    fila({ id: 4, aplicada: true }),
  ];
  assert.deepEqual(resumirSeleccion(filas, CONCILIADA), {
    seleccionables: 2,
    seleccionadas: 1,
    aplicadas: 1,
  });
});

test("una fila marcada que dejó de ser seleccionable NO se cuenta como seleccionada", () => {
  // Es el caso real: se marcó, y mientras tanto alguien la aplicó desde otra
  // pestaña. El contador tiene que reflejar lo que se va a aplicar de verdad.
  const filas = [fila({ id: 1, seleccionada: true, aplicada: true })];
  assert.equal(resumirSeleccion(filas, CONCILIADA).seleccionadas, 0);
});
