// Candados del CAMBIO DE COSTO sobre una oferta vigente.
// node --test lib/ofertas/revision.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  costoCambio,
  resumenCambioDeCosto,
  textoCambioDeCosto,
  planDeRevision,
} from "./revision.js";

// ── CASO 8 del pedido ────────────────────────────────────────────────────────
test("caso 8: el ejemplo completo — $650 → $820 sobre una oferta de $900", () => {
  const r = resumenCambioDeCosto({
    costoReferencia: 650,
    costoActual: 820,
    precioOferta: 900,
    precioNormalReferencia: 1000,
  });
  assert.equal(r.costoAnterior, 650);
  assert.equal(r.costoActual, 820);
  assert.equal(r.variacion, 170);
  assert.equal(r.variacionPct, 26.15, "el +26,15 % del pedido");
  assert.equal(r.precioOferta, 900, "el precio de oferta NO se movió");
  assert.equal(r.margenAnterior, 250);
  assert.equal(r.margenActual, 80, "el margen actual del pedido");
  assert.equal(r.subio, true);
  assert.equal(r.margenNegativo, false);
});

test("caso 8 bis: el texto del aviso es el del pedido", () => {
  const r = resumenCambioDeCosto({ costoReferencia: 650, costoActual: 820, precioOferta: 900 });
  const texto = textoCambioDeCosto("Nueve de Oro", r);
  assert.match(texto, /Cambió el costo de Nueve de Oro/);
  assert.match(texto, /\$650 → \$820/);
  assert.match(texto, /\+26,15 %/);
  assert.match(texto, /Precio oferta: \$900/);
  assert.match(texto, /Margen actual: \$80/);
});

// ── Detección ────────────────────────────────────────────────────────────────
test("cualquier cambio de costo cuenta, para arriba y para abajo", () => {
  assert.equal(costoCambio(650, 820), true);
  assert.equal(costoCambio(650, 500), true);
  assert.equal(costoCambio(650, 650), false);
});

test("el ruido de coma flotante no marca una línea", () => {
  assert.equal(costoCambio(0.1 + 0.2, 0.3), false);
  assert.equal(costoCambio(650.004, 650.001), false, "misma cifra en centavos");
  assert.equal(costoCambio(650.0, 650.01), true, "un centavo real sí cambia");
});

test("un costo ilegible no marca nada", () => {
  assert.equal(costoCambio(null, 800), false);
  assert.equal(costoCambio(650, undefined), false);
});

test("el margen puede quedar en rojo y se informa", () => {
  const r = resumenCambioDeCosto({ costoReferencia: 650, costoActual: 1000, precioOferta: 900 });
  assert.equal(r.margenActual, -100);
  assert.equal(r.margenNegativo, true);
});

test("un costo de referencia en cero no revienta el porcentaje", () => {
  const r = resumenCambioDeCosto({ costoReferencia: 0, costoActual: 820, precioOferta: 900 });
  assert.equal(r.variacionPct, null);
  assert.equal(r.variacion, 820);
});

// ── Plan de marcado ──────────────────────────────────────────────────────────
test("marca las líneas cuyo costo cambió y deja las demás en paz", () => {
  const plan = planDeRevision(
    [
      { id: 1, costoReferencia: 650, revisionPendienteDesde: null },
      { id: 2, costoReferencia: 300, revisionPendienteDesde: null },
    ],
    { 1: 820, 2: 300 }
  );
  assert.deepEqual(plan.marcar, [1]);
  assert.deepEqual(plan.desmarcar, []);
});

test("no vuelve a marcar una línea ya marcada — la notificación no se duplica", () => {
  const plan = planDeRevision(
    [{ id: 1, costoReferencia: 650, revisionPendienteDesde: new Date("2026-09-06") }],
    { 1: 820 }
  );
  assert.deepEqual(plan.marcar, []);
});

test("si el costo vuelve al de referencia, la marca se levanta sola", () => {
  const plan = planDeRevision(
    [{ id: 1, costoReferencia: 650, revisionPendienteDesde: new Date("2026-09-06") }],
    { 1: 650 }
  );
  assert.deepEqual(plan.desmarcar, [1]);
  assert.deepEqual(plan.marcar, []);
});

test("una línea sin costo actual conocido no se toca en ninguna dirección", () => {
  const plan = planDeRevision(
    [{ id: 1, costoReferencia: 650, revisionPendienteDesde: null }],
    {}
  );
  assert.deepEqual(plan.marcar, []);
  assert.deepEqual(plan.desmarcar, []);
});
