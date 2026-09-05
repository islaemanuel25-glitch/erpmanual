// Candados de VIGENCIA, CONDICIÓN DE PAGO y SOLAPAMIENTO de ofertas.
// node --test lib/ofertas/vigencia.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  ofertaVigente,
  cumpleCondicionPago,
  ventanasSeSolapan,
  validarVentana,
  conflictoDeCarga,
  CONDICION_PAGO_OFERTA,
} from "./vigencia.js";

const AHORA = new Date("2026-09-07T15:00:00-03:00");

function oferta(over = {}) {
  return {
    id: 1,
    nombre: "Semana Nueve de Oro",
    publicadaEn: new Date("2026-09-01T10:00:00-03:00"),
    finalizadaEn: null,
    inicioEn: new Date("2026-09-04T00:00:00-03:00"),
    finEn: new Date("2026-09-11T23:59:59-03:00"),
    ...over,
  };
}

// ── CASO 9 del pedido: vencimiento ───────────────────────────────────────────
test("caso 9: después de la fecha/hora final la oferta ya no rige", () => {
  const o = oferta();
  assert.equal(ofertaVigente(o, new Date("2026-09-11T23:59:58-03:00")), true);
  assert.equal(ofertaVigente(o, new Date("2026-09-11T23:59:59-03:00")), false);
  assert.equal(ofertaVigente(o, new Date("2026-09-12T00:00:01-03:00")), false);
});

test("antes del inicio tampoco rige", () => {
  assert.equal(ofertaVigente(oferta(), new Date("2026-09-03T23:59:59-03:00")), false);
});

test("un borrador no rige aunque las fechas den", () => {
  assert.equal(ofertaVigente(oferta({ publicadaEn: null }), AHORA), false);
});

test("una finalizada no rige aunque las fechas den", () => {
  assert.equal(ofertaVigente(oferta({ finalizadaEn: AHORA }), AHORA), false);
});

test("una oferta marcada para revisar SIGUE rigiendo — el aviso no cambia el precio", () => {
  const o = oferta({ lineas: [{ revisionPendienteDesde: AHORA }] });
  assert.equal(ofertaVigente(o, AHORA), true);
});

// ── Condición de pago ────────────────────────────────────────────────────────
test("SOLO_EFECTIVO exige que el único medio sea efectivo", () => {
  const c = CONDICION_PAGO_OFERTA.SOLO_EFECTIVO;
  assert.equal(cumpleCondicionPago(c, ["EFECTIVO"]), true);
  assert.equal(cumpleCondicionPago(c, ["EFECTIVO", "DEBITO"]), false);
  assert.equal(cumpleCondicionPago(c, ["DEBITO"]), false);
  assert.equal(cumpleCondicionPago(c, ["EFECTIVO", "EFECTIVO"]), true, "el mismo medio repetido sigue siendo uno");
});

test("CUALQUIER_MEDIO acepta lo que sea, pero exige que haya medios", () => {
  const c = CONDICION_PAGO_OFERTA.CUALQUIER_MEDIO;
  assert.equal(cumpleCondicionPago(c, ["DEBITO"]), true);
  assert.equal(cumpleCondicionPago(c, ["EFECTIVO", "CREDITO"]), true);
  assert.equal(cumpleCondicionPago(c, []), false);
});

test("una condición desconocida no habilita nada", () => {
  assert.equal(cumpleCondicionPago("SOLO_LOS_MARTES", ["EFECTIVO"]), false);
});

// ── Ventanas ─────────────────────────────────────────────────────────────────
test("dos ventanas que se tocan en el borde NO se solapan", () => {
  const a = { inicioEn: new Date("2026-09-01"), finEn: new Date("2026-09-08") };
  const b = { inicioEn: new Date("2026-09-08"), finEn: new Date("2026-09-15") };
  assert.equal(ventanasSeSolapan(a, b), false);
});

test("dos ventanas que se pisan un segundo SÍ se solapan", () => {
  const a = { inicioEn: new Date("2026-09-01"), finEn: new Date("2026-09-08T00:00:01") };
  const b = { inicioEn: new Date("2026-09-08"), finEn: new Date("2026-09-15") };
  assert.equal(ventanasSeSolapan(a, b), true);
});

test("una ventana contenida en otra se solapa", () => {
  const a = { inicioEn: new Date("2026-09-01"), finEn: new Date("2026-09-30") };
  const b = { inicioEn: new Date("2026-09-05"), finEn: new Date("2026-09-06") };
  assert.equal(ventanasSeSolapan(a, b), true);
});

test("la finalización tiene que ser posterior al inicio", () => {
  assert.equal(validarVentana({ inicioEn: "2026-09-10", finEn: "2026-09-01" }).valido, false);
  assert.equal(validarVentana({ inicioEn: "2026-09-01", finEn: "2026-09-01" }).valido, false);
  assert.equal(validarVentana({ inicioEn: "2026-09-01", finEn: "2026-09-02" }).valido, true);
  assert.equal(validarVentana({ inicioEn: "no es fecha", finEn: "2026-09-02" }).valido, false);
});

// ── Conflicto de carga ───────────────────────────────────────────────────────
const VIGENTE = {
  id: 7,
  nombre: "Semana Nueve de Oro",
  publicadaEn: new Date("2026-09-01"),
  finalizadaEn: null,
  inicioEn: new Date("2026-09-04"),
  finEn: new Date("2026-09-11"),
  productoLocalIds: [1, 2],
};

test("el ejemplo del pedido: otra oferta del mismo producto en el mismo período choca", () => {
  const choques = conflictoDeCarga(
    { inicioEn: new Date("2026-09-06"), finEn: new Date("2026-09-09"), productoLocalIds: [1] },
    [VIGENTE]
  );
  assert.equal(choques.length, 1);
  assert.equal(choques[0].ofertaId, 7);
  assert.deepEqual(choques[0].productoLocalIds, [1]);
});

test("dos condiciones de pago distintas NO habilitan el solapamiento", () => {
  // Es la decisión de la v1: en una venta 100 % efectivo las dos cumplirían y
  // habría que desempatar. Se evita desde la carga.
  const choques = conflictoDeCarga(
    {
      inicioEn: new Date("2026-09-06"),
      finEn: new Date("2026-09-09"),
      productoLocalIds: [1],
      condicionPago: "CUALQUIER_MEDIO",
    },
    [{ ...VIGENTE, condicionPago: "SOLO_EFECTIVO" }]
  );
  assert.equal(choques.length, 1);
});

test("sin producto en común no hay conflicto", () => {
  const choques = conflictoDeCarga(
    { inicioEn: new Date("2026-09-06"), finEn: new Date("2026-09-09"), productoLocalIds: [99] },
    [VIGENTE]
  );
  assert.equal(choques.length, 0);
});

test("sin solapamiento de fechas no hay conflicto", () => {
  const choques = conflictoDeCarga(
    { inicioEn: new Date("2026-09-12"), finEn: new Date("2026-09-20"), productoLocalIds: [1] },
    [VIGENTE]
  );
  assert.equal(choques.length, 0);
});

test("una oferta finalizada no compite", () => {
  const choques = conflictoDeCarga(
    { inicioEn: new Date("2026-09-06"), finEn: new Date("2026-09-09"), productoLocalIds: [1] },
    [{ ...VIGENTE, finalizadaEn: new Date("2026-09-05") }]
  );
  assert.equal(choques.length, 0);
});

test("un borrador no compite", () => {
  const choques = conflictoDeCarga(
    { inicioEn: new Date("2026-09-06"), finEn: new Date("2026-09-09"), productoLocalIds: [1] },
    [{ ...VIGENTE, publicadaEn: null }]
  );
  assert.equal(choques.length, 0);
});

test("una oferta no choca consigo misma al editarla", () => {
  const choques = conflictoDeCarga(
    { id: 7, inicioEn: new Date("2026-09-04"), finEn: new Date("2026-09-11"), productoLocalIds: [1, 2] },
    [VIGENTE]
  );
  assert.equal(choques.length, 0);
});

test("sin productos cargados no se declara conflicto", () => {
  const choques = conflictoDeCarga(
    { inicioEn: new Date("2026-09-06"), finEn: new Date("2026-09-09"), productoLocalIds: [] },
    [VIGENTE]
  );
  assert.equal(choques.length, 0);
});
