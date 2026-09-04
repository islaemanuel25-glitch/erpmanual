// Candados de los avisos de ofertas.
// node --test lib/ofertas/notificaciones.test.mjs
//
// Lo que más se cuida acá es que NO se dupliquen. Un aviso repetido cuarenta
// veces en una mañana no molesta y ya: enseña a ignorar la campanita, y a partir
// de ahí el aviso que sí importa tampoco se lee.
import test from "node:test";
import assert from "node:assert/strict";
import {
  avisosDelBarrido,
  debeAvisarVencimiento,
  TIPO_NOTIFICACION,
  HORAS_AVISO_VENCIMIENTO,
} from "./notificaciones.js";

const AHORA = new Date("2026-09-10T15:00:00-03:00");

function oferta(over = {}) {
  return {
    id: 7,
    nombre: "Semana Nueve de Oro",
    publicadaEn: new Date("2026-09-01T10:00:00-03:00"),
    finalizadaEn: null,
    inicioEn: new Date("2026-09-04T00:00:00-03:00"),
    finEn: new Date("2026-09-11T10:00:00-03:00"), // faltan 19 h
    lineas: [],
    ...over,
  };
}

// ── Vencimiento ──────────────────────────────────────────────────────────────
test("avisa cuando faltan menos de 24 h", () => {
  assert.equal(debeAvisarVencimiento(oferta(), [], AHORA), true);
});

test("no avisa si falta más que la ventana", () => {
  const lejos = oferta({ finEn: new Date("2026-09-20T10:00:00-03:00") });
  assert.equal(debeAvisarVencimiento(lejos, [], AHORA), false);
});

test("NO avisa dos veces dentro de la misma ventana de vencimiento", () => {
  const previa = [{ entidadId: 7, createdAt: new Date("2026-09-10T11:00:00-03:00") }];
  assert.equal(debeAvisarVencimiento(oferta(), previa, AHORA), false);
});

test("una notificación de una vigencia ANTERIOR no bloquea el aviso de ahora", () => {
  // La oferta se renovó: su finEn se corrió a septiembre. El aviso de agosto no
  // cuenta, y tiene que volver a avisar.
  const previa = [{ entidadId: 7, createdAt: new Date("2026-08-01T11:00:00-03:00") }];
  assert.equal(debeAvisarVencimiento(oferta(), previa, AHORA), true);
});

test("una notificación de OTRA oferta no bloquea la de ésta", () => {
  const previa = [{ entidadId: 99, createdAt: new Date("2026-09-10T11:00:00-03:00") }];
  assert.equal(debeAvisarVencimiento(oferta(), previa, AHORA), true);
});

test("una oferta ya vencida no avisa que 'está por vencer'", () => {
  const vencida = oferta({ finEn: new Date("2026-09-09T10:00:00-03:00") });
  assert.equal(debeAvisarVencimiento(vencida, [], AHORA), false);
});

test("una finalizada no avisa nada", () => {
  const fin = oferta({ finalizadaEn: new Date("2026-09-09T10:00:00-03:00") });
  assert.equal(debeAvisarVencimiento(fin, [], AHORA), false);
});

test("la ventana de aviso está definida en un solo lugar", () => {
  assert.equal(HORAS_AVISO_VENCIMIENTO, 24);
});

// ── Cambio de costo ──────────────────────────────────────────────────────────
test("avisa el cambio de costo con los números adentro, no con un 'entrá a ver'", () => {
  const avisos = avisosDelBarrido({
    ofertas: [oferta({ finEn: new Date("2026-09-30T10:00:00-03:00"), lineas: [{ id: 55 }] })],
    lineasRecienMarcadas: [55],
    detalleLineas: {
      55: {
        nombre: "Nueve de Oro",
        resumen: {
          costoAnterior: 650,
          costoActual: 820,
          variacionPct: 26.15,
          precioOferta: 900,
          margenActual: 80,
        },
      },
    },
    ahora: AHORA,
  });
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].tipo, TIPO_NOTIFICACION.REVISAR);
  assert.match(avisos[0].titulo, /Revisá "Semana Nueve de Oro": cambió un costo/);
  assert.match(avisos[0].cuerpo, /\$650 → \$820/);
  assert.match(avisos[0].cuerpo, /Margen actual: \$80/);
});

test("cinco costos que cambiaron el mismo día son UN aviso, no cinco", () => {
  const lineas = [1, 2, 3, 4, 5].map((id) => ({ id }));
  const detalleLineas = {};
  for (const l of lineas) {
    detalleLineas[l.id] = {
      nombre: `Producto ${l.id}`,
      resumen: { costoAnterior: 100, costoActual: 120, variacionPct: 20, precioOferta: 200, margenActual: 80 },
    };
  }
  const avisos = avisosDelBarrido({
    ofertas: [oferta({ finEn: new Date("2026-09-30T10:00:00-03:00"), lineas })],
    lineasRecienMarcadas: [1, 2, 3, 4, 5],
    detalleLineas,
    ahora: AHORA,
  });
  const deRevision = avisos.filter((a) => a.tipo === TIPO_NOTIFICACION.REVISAR);
  assert.equal(deRevision.length, 1);
  assert.match(deRevision[0].titulo, /cambiaron 5 costos/);
});

test("sin líneas recién marcadas NO se avisa nada de costos: la segunda corrida calla", () => {
  const avisos = avisosDelBarrido({
    ofertas: [oferta({ finEn: new Date("2026-09-30T10:00:00-03:00"), lineas: [{ id: 55 }] })],
    lineasRecienMarcadas: [],
    ahora: AHORA,
  });
  assert.equal(avisos.filter((a) => a.tipo === TIPO_NOTIFICACION.REVISAR).length, 0);
});

test("una línea marcada de OTRA oferta no aparece en ésta", () => {
  const avisos = avisosDelBarrido({
    ofertas: [oferta({ finEn: new Date("2026-09-30T10:00:00-03:00"), lineas: [{ id: 55 }] })],
    lineasRecienMarcadas: [999],
    ahora: AHORA,
  });
  assert.equal(avisos.length, 0);
});

// ── Los dos juntos ───────────────────────────────────────────────────────────
test("una oferta que vence Y cambió de costo produce los dos avisos, no uno mezclado", () => {
  const avisos = avisosDelBarrido({
    ofertas: [oferta({ lineas: [{ id: 55 }] })],
    lineasRecienMarcadas: [55],
    detalleLineas: {
      55: { nombre: "X", resumen: { costoAnterior: 1, costoActual: 2, variacionPct: 100, precioOferta: 10, margenActual: 8 } },
    },
    ahora: AHORA,
  });
  const tipos = avisos.map((a) => a.tipo).sort();
  assert.deepEqual(tipos, [TIPO_NOTIFICACION.POR_VENCER, TIPO_NOTIFICACION.REVISAR].sort());
});
