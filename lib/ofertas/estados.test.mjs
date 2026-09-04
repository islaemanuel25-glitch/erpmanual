// Candados del ESTADO DERIVADO de una oferta.
// node --test lib/ofertas/estados.test.mjs
//
// Hay un test por CADA estado, y no es por prolijidad: el estado se decide con
// una cadena de returns, y en este repo ya pasó dos veces que un estado nuevo
// quedara inalcanzable porque un return anterior se lo comía. Un estado sin
// candado propio es un estado que nadie sabe si se puede alcanzar.
import test from "node:test";
import assert from "node:assert/strict";
import {
  estadoOferta,
  estaPorVencer,
  esEstadoOperativo,
  tieneRevisionPendiente,
  ESTADO_OFERTA,
  ESTADOS_OPERATIVOS,
  ESTADOS_ARCHIVADOS,
} from "./estados.js";

const AHORA = new Date("2026-09-07T15:00:00-03:00");

function oferta(over = {}) {
  return {
    publicadaEn: new Date("2026-09-01T10:00:00-03:00"),
    finalizadaEn: null,
    inicioEn: new Date("2026-09-04T00:00:00-03:00"),
    finEn: new Date("2026-09-11T23:59:59-03:00"),
    lineas: [],
    ...over,
  };
}

test("ACTIVA: publicada, dentro de la ventana, sin nada que revisar", () => {
  assert.equal(estadoOferta(oferta(), AHORA), ESTADO_OFERTA.ACTIVA);
});

test("BORRADOR: nunca se publicó, aunque las fechas ya estén corriendo", () => {
  assert.equal(estadoOferta(oferta({ publicadaEn: null }), AHORA), ESTADO_OFERTA.BORRADOR);
});

test("PROGRAMADA: publicada pero todavía no empezó", () => {
  const o = oferta({ inicioEn: new Date("2026-09-20T00:00:00-03:00"), finEn: new Date("2026-09-27T00:00:00-03:00") });
  assert.equal(estadoOferta(o, AHORA), ESTADO_OFERTA.PROGRAMADA);
});

test("VENCIDA: pasó el final y nadie la finalizó", () => {
  const o = oferta({ inicioEn: new Date("2026-08-01T00:00:00-03:00"), finEn: new Date("2026-08-08T00:00:00-03:00") });
  assert.equal(estadoOferta(o, AHORA), ESTADO_OFERTA.VENCIDA);
});

test("FINALIZADA: la decisión humana gana sobre cualquier fecha", () => {
  const o = oferta({ finalizadaEn: new Date("2026-09-05T12:00:00-03:00") });
  assert.equal(estadoOferta(o, AHORA), ESTADO_OFERTA.FINALIZADA);
});

test("REVISAR: está rigiendo Y una línea quedó marcada — no lo tapa ACTIVA", () => {
  const o = oferta({ lineas: [{ revisionPendienteDesde: new Date("2026-09-06T09:00:00-03:00") }] });
  assert.equal(estadoOferta(o, AHORA), ESTADO_OFERTA.REVISAR);
});

test("REVISAR no tapa a VENCIDA: si ya terminó, lo que hay que decidir es otra cosa", () => {
  const o = oferta({
    inicioEn: new Date("2026-08-01T00:00:00-03:00"),
    finEn: new Date("2026-08-08T00:00:00-03:00"),
    lineas: [{ revisionPendienteDesde: new Date("2026-08-03T09:00:00-03:00") }],
  });
  assert.equal(estadoOferta(o, AHORA), ESTADO_OFERTA.VENCIDA);
});

test("REVISAR no tapa a FINALIZADA", () => {
  const o = oferta({
    finalizadaEn: new Date("2026-09-05T12:00:00-03:00"),
    lineas: [{ revisionPendienteDesde: new Date("2026-09-04T09:00:00-03:00") }],
  });
  assert.equal(estadoOferta(o, AHORA), ESTADO_OFERTA.FINALIZADA);
});

test("el borde de la ventana es semiabierto: en el instante final ya está vencida", () => {
  const fin = new Date("2026-09-11T00:00:00-03:00");
  const o = oferta({ finEn: fin });
  assert.equal(estadoOferta(o, new Date(fin.getTime() - 1)), ESTADO_OFERTA.ACTIVA);
  assert.equal(estadoOferta(o, fin), ESTADO_OFERTA.VENCIDA);
});

test("el inicio SÍ es inclusivo: en el instante de inicio ya está activa", () => {
  const inicio = new Date("2026-09-04T00:00:00-03:00");
  const o = oferta({ inicioEn: inicio });
  assert.equal(estadoOferta(o, new Date(inicio.getTime() - 1)), ESTADO_OFERTA.PROGRAMADA);
  assert.equal(estadoOferta(o, inicio), ESTADO_OFERTA.ACTIVA);
});

test("una oferta publicada sin ventana no queda ACTIVA por accidente", () => {
  assert.equal(estadoOferta(oferta({ inicioEn: null, finEn: null }), AHORA), ESTADO_OFERTA.VENCIDA);
});

test("el flag precalculado por SQL vale lo mismo que recorrer las líneas", () => {
  assert.equal(tieneRevisionPendiente({ tieneRevisionPendiente: true }), true);
  assert.equal(tieneRevisionPendiente({ tieneRevisionPendiente: false, lineas: [{ revisionPendienteDesde: new Date() }] }), false);
  assert.equal(tieneRevisionPendiente({ lineas: [{ revisionPendienteDesde: null }] }), false);
});

test("las finalizadas son las únicas archivadas; el resto es trabajo del día", () => {
  assert.deepEqual(ESTADOS_ARCHIVADOS, [ESTADO_OFERTA.FINALIZADA]);
  for (const e of ESTADOS_OPERATIVOS) assert.equal(esEstadoOperativo(e), true);
  assert.equal(esEstadoOperativo(ESTADO_OFERTA.FINALIZADA), false);
});

// ── Aviso de vencimiento ─────────────────────────────────────────────────────
test("está por vencer si faltan 24 h o menos", () => {
  const o = oferta({ finEn: new Date("2026-09-08T10:00:00-03:00") }); // faltan 19 h
  assert.equal(estaPorVencer(o, { ahora: AHORA }), true);
});

test("no está por vencer si falta más que la ventana", () => {
  assert.equal(estaPorVencer(oferta(), { ahora: AHORA }), false); // faltan ~4 días
});

test("una oferta ya vencida NO está 'por vencer'", () => {
  const o = oferta({ inicioEn: new Date("2026-08-01T00:00:00-03:00"), finEn: new Date("2026-08-08T00:00:00-03:00") });
  assert.equal(estaPorVencer(o, { ahora: AHORA }), false);
});

test("una finalizada nunca está 'por vencer'", () => {
  const o = oferta({ finEn: new Date("2026-09-08T10:00:00-03:00"), finalizadaEn: new Date("2026-09-06T00:00:00-03:00") });
  assert.equal(estaPorVencer(o, { ahora: AHORA }), false);
});

test("una marcada REVISAR igual avisa que está por vencer", () => {
  const o = oferta({
    finEn: new Date("2026-09-08T10:00:00-03:00"),
    lineas: [{ revisionPendienteDesde: new Date("2026-09-06T09:00:00-03:00") }],
  });
  assert.equal(estaPorVencer(o, { ahora: AHORA }), true);
});
