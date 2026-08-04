// lib/caja/vistaTurno.test.mjs
//
// El caso de diseño es el turno 175 REAL de Casiano casas (02/08/2026):
// inicial $10.000, efectivo $312.500, digital $150.400, esperado $322.500,
// contado $385.000, sobrante +$62.500, 5 arqueos, 99 ventas, 0 movimientos.
//
//   node --test lib/caja/vistaTurno.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resultadoCierre,
  pistaFondoOmitido,
  desglosarEntreArqueos,
  resumenArqueosVista,
  CAJA_CORRECTA,
  CAJA_SOBRANTE,
  CAJA_FALTANTE,
} from "./vistaTurno.js";

test("turno 175 real: el sobrante se dice en palabras y con una pista, no un veredicto", () => {
  const r = resultadoCierre({ esperado: 322500, contado: 385000 });
  assert.equal(r.estado, CAJA_SOBRANTE);
  assert.equal(r.titulo, "Sobran $62.500,00");
  assert.equal(r.monto, 62500);
  assert.match(r.explicacion, /turnos anteriores|retiros no registrados/);
  // No afirma una causa: enumera posibilidades.
  assert.match(r.explicacion, /puede ser/);
});

test("caja correcta", () => {
  const r = resultadoCierre({ esperado: 67101.7, contado: 67101.7 });
  assert.equal(r.estado, CAJA_CORRECTA);
  assert.equal(r.titulo, "Caja correcta");
  assert.equal(r.monto, 0);
});

test("faltante: el título dice cuánto falta", () => {
  const r = resultadoCierre({ esperado: 19400, contado: 9400 });
  assert.equal(r.estado, CAJA_FALTANTE);
  assert.equal(r.titulo, "Faltan $10.000,00");
  assert.match(r.explicacion, /error de conteo|sin registrarse/);
});

test("turno abierto: no inventa un resultado", () => {
  const r = resultadoCierre({ esperado: 322500, contado: null });
  assert.equal(r.cerrado, false);
  assert.equal(r.estado, null);
  assert.equal(r.titulo, "Turno abierto");
});

test("turno 170 real: además avisa que parece el fondo no contado", () => {
  const p = pistaFondoOmitido({ esperado: 19400, contado: 9400, montoInicial: 10000 });
  assert.match(p, /no se contó el fondo inicial de \$10\.000,00/);
});

test("la pista del fondo NO aparece si el faltante es otro", () => {
  assert.equal(pistaFondoOmitido({ esperado: 19400, contado: 9000, montoInicial: 10000 }), null);
  assert.equal(pistaFondoOmitido({ esperado: 50000, contado: 50000, montoInicial: 10000 }), null);
  assert.equal(pistaFondoOmitido({ esperado: 5000, contado: 4000, montoInicial: 0 }), null);
});

test("turno 175 real: qué pasó entre cada arqueo, sin restar tarjetas a ojo", () => {
  // Los 4 parciales reales del turno 175, con sus esperados verificados en la base.
  const arqueos = [
    { id: 10, fechaHora: "2026-08-02T15:04:44Z", efectivoEsperado: 63000, efectivoContado: 187000, diferencia: 124000, tipo: "PARCIAL" },
    { id: 11, fechaHora: "2026-08-02T16:12:47Z", efectivoEsperado: 148700, efectivoContado: 272500, diferencia: 123800, tipo: "PARCIAL" },
    { id: 12, fechaHora: "2026-08-02T17:07:35Z", efectivoEsperado: 233400, efectivoContado: 376500, diferencia: 143100, tipo: "PARCIAL" },
    { id: 13, fechaHora: "2026-08-02T18:06:43Z", efectivoEsperado: 287700, efectivoContado: 347000, diferencia: 59300, tipo: "PARCIAL" },
    { id: 14, fechaHora: "2026-08-02T19:10:43Z", efectivoEsperado: 322500, efectivoContado: 385000, diferencia: 62500, tipo: "FINAL" },
  ];
  const con = desglosarEntreArqueos(arqueos, [], 10000);

  // Primer corte: desde la apertura entraron 53.000 (63.000 − 10.000 de fondo).
  assert.equal(con[0].desdeAnterior.ventasEfectivo, 53000);
  assert.match(con[0].desdeAnterior.texto, /^Desde la apertura entraron \$53\.000,00 en efectivo\.$/);

  // Segundo: 148.700 − 63.000 = 85.700.
  assert.equal(con[1].desdeAnterior.ventasEfectivo, 85700);
  assert.match(con[1].desdeAnterior.texto, /^Desde el control anterior entraron \$85\.700,00 en efectivo\.$/);

  assert.equal(con[2].desdeAnterior.ventasEfectivo, 84700);
  assert.equal(con[3].desdeAnterior.ventasEfectivo, 54300);
  assert.equal(con[4].desdeAnterior.ventasEfectivo, 34800);

  // La suma de los tramos reconstruye el efectivo vendido del turno.
  const total = con.reduce((s, a) => s + a.desdeAnterior.ventasEfectivo, 0);
  assert.equal(Math.round(total * 100) / 100, 312500);
});

test("con ingresos y retiros, el tramo los separa y los nombra", () => {
  const arqueos = [
    { id: 1, fechaHora: "2026-08-02T12:00:00Z", efectivoEsperado: 30000, diferencia: 0, tipo: "PARCIAL" },
    { id: 2, fechaHora: "2026-08-02T14:00:00Z", efectivoEsperado: 45000, diferencia: 0, tipo: "FINAL" },
  ];
  const movs = [
    { id: 9, tipo: "RETIRO", monto: 20000, createdAt: "2026-08-02T13:00:00Z" },
    { id: 8, tipo: "INGRESO", monto: 5000, createdAt: "2026-08-02T13:30:00Z" },
    { id: 7, tipo: "RETIRO", monto: 1000, createdAt: "2026-08-02T11:00:00Z" }, // tramo anterior
  ];
  const con = desglosarEntreArqueos(arqueos, movs, 10000);

  // Tramo 1: delta 20.000, con un retiro de 1.000 → vendió 21.000.
  assert.equal(con[0].desdeAnterior.retiros, 1000);
  assert.equal(con[0].desdeAnterior.ventasEfectivo, 21000);

  // Tramo 2: delta 15.000 = ventas + 5.000 − 20.000 → ventas 30.000.
  assert.equal(con[1].desdeAnterior.ingresos, 5000);
  assert.equal(con[1].desdeAnterior.retiros, 20000);
  assert.equal(con[1].desdeAnterior.ventasEfectivo, 30000);
  // Ninguno de estos arqueos tiene `cajaMovimientoRetiroId`: son conteos puros,
  // así que los retiros de la ventana son movimientos MANUALES y se nombran como
  // tales. Un arqueo con retiro propio se prueba abajo.
  assert.match(
    con[1].desdeAnterior.texto,
    /entraron \$30\.000,00 en efectivo, ingresaron \$5\.000,00, salieron \$20\.000,00 en movimientos manuales/
  );
  assert.equal(con[1].desdeAnterior.retiroDelControl, 0);
  assert.equal(con[1].desdeAnterior.retirosManuales, 20000);
});

test("resumen de arqueos: informa la mayor y la final, nunca la suma", () => {
  const arqueos = [
    { diferencia: 124000, tipo: "PARCIAL" },
    { diferencia: 123800, tipo: "PARCIAL" },
    { diferencia: 143100, tipo: "PARCIAL" },
    { diferencia: 59300, tipo: "PARCIAL" },
    { diferencia: 62500, tipo: "FINAL" },
  ];
  const r = resumenArqueosVista(arqueos);
  assert.equal(r.cantidad, 5);
  assert.equal(r.conDiferencia, 5);
  assert.equal(r.mayorDiferencia, 143100);
  assert.equal(r.diferenciaFinal, 62500);
  // La suma daría 512.700 y sería falsa: es el mismo sobrante contado cinco veces.
  assert.notEqual(r.mayorDiferencia, 512700);
});

test("resumen con cero arqueos y con arqueos sin diferencia", () => {
  const vacio = resumenArqueosVista([]);
  assert.equal(vacio.cantidad, 0);
  assert.equal(vacio.hayFinal, false);
  assert.equal(vacio.diferenciaFinal, null);

  const limpio = resumenArqueosVista([{ diferencia: 0, tipo: "FINAL" }]);
  assert.equal(limpio.conDiferencia, 0);
  assert.equal(limpio.mayorDiferencia, 0);
  assert.equal(limpio.diferenciaFinal, 0);
});

test("un faltante mayor que un sobrante posterior queda como la mayor diferencia", () => {
  const r = resumenArqueosVista([{ diferencia: -9000, tipo: "PARCIAL" }, { diferencia: 500, tipo: "FINAL" }]);
  assert.equal(r.mayorDiferencia, -9000, "se conserva el signo");
  assert.equal(r.diferenciaFinal, 500);
});

// ── Atribución del retiro: por VÍNCULO, no por reloj ────────────────────────
//
// `ArqueoCaja.fechaHora` se sella milisegundos ANTES de crear el CajaMovimiento
// del propio retiro. Con ventanas por fecha, el movimiento caía fuera de su
// ventana y aparecía en la fila siguiente: la fila del retiro de $38.400 decía
// "se retiraron $103.400". Medido en el turno 188 de producción, con desfases de
// 9 a 190 ms.

/** Turno 188 real, con los desfases de milisegundos tal como están en la base. */
const T188_ARQUEOS = [
  { id: 40, tipo: "PARCIAL", fechaHora: "2026-08-04T05:18:22.092Z", efectivoEsperado: 127700, efectivoContado: 128400, efectivoRetirado: 103400, diferencia: 700, cajaMovimientoRetiroId: 22 },
  { id: 41, tipo: "PARCIAL", fechaHora: "2026-08-04T07:07:48.595Z", efectivoEsperado: 63400, efectivoContado: 63400, efectivoRetirado: 38400, diferencia: 0, cajaMovimientoRetiroId: 24 },
  { id: 42, tipo: "PARCIAL", fechaHora: "2026-08-04T09:09:31.281Z", efectivoEsperado: 61300, efectivoContado: 61300, efectivoRetirado: 36300, diferencia: 0, cajaMovimientoRetiroId: 25 },
  { id: 44, tipo: "PARCIAL", fechaHora: "2026-08-04T11:11:02.887Z", efectivoEsperado: 56000, efectivoContado: 56000, efectivoRetirado: 31000, diferencia: 0, cajaMovimientoRetiroId: 27 },
  { id: 47, tipo: "FINAL", fechaHora: "2026-08-04T11:21:28.641Z", efectivoEsperado: 25000, efectivoContado: 25000, efectivoRetirado: null, diferencia: 0, cajaMovimientoRetiroId: null },
];
const T188_MOVS = [
  { id: 22, tipo: "RETIRO", monto: 103400, createdAt: "2026-08-04T05:18:22.190Z" },
  { id: 23, tipo: "INGRESO", monto: 700, createdAt: "2026-08-04T05:42:45.094Z" },
  { id: 24, tipo: "RETIRO", monto: 38400, createdAt: "2026-08-04T07:07:48.784Z" },
  { id: 25, tipo: "RETIRO", monto: 36300, createdAt: "2026-08-04T09:09:31.293Z" },
  // Caja chica: SIN vínculo con ningún arqueo, se reparte por fecha.
  { id: 26, tipo: "RETIRO", monto: 40000, createdAt: "2026-08-04T11:09:37.391Z" },
  { id: 27, tipo: "RETIRO", monto: 31000, createdAt: "2026-08-04T11:11:02.896Z" },
];
const t188 = () => desglosarEntreArqueos(T188_ARQUEOS, T188_MOVS, 25000);

test("A1. cada fila muestra SU retiro, no el del control anterior", () => {
  const con = t188();
  assert.equal(con[0].desdeAnterior.retiroDelControl, 103400);
  assert.equal(con[1].desdeAnterior.retiroDelControl, 38400);
  assert.equal(con[2].desdeAnterior.retiroDelControl, 36300);
  assert.equal(con[3].desdeAnterior.retiroDelControl, 31000);
});

test("A2. el movimiento vinculado NO aparece en el período siguiente", () => {
  const con = t188();
  // El retiro de $103.400 es del control #40 y solo de él.
  assert.doesNotMatch(con[1].desdeAnterior.texto, /103\.400/);
  assert.doesNotMatch(con[2].desdeAnterior.texto, /38\.400,00 en movimientos/);
  assert.match(con[1].desdeAnterior.texto, /se retiraron \$38\.400,00/);
});

test("A3. el movimiento manual sin vínculo se sigue asignando por fecha", () => {
  const con = t188();
  // La caja chica de las 11:09 cae entre el control de las 09:09 y el de las 11:11.
  assert.equal(con[2].desdeAnterior.retirosManuales, 0, "no es del período de las 09:09");
  assert.equal(con[3].desdeAnterior.retirosManuales, 40000);
  assert.match(con[3].desdeAnterior.texto, /salieron \$40\.000,00 en movimientos manuales/);
  // Se nombra APARTE del retiro del control: sumarlos daría $71.000, que no es
  // ninguno de los dos.
  assert.match(con[3].desdeAnterior.texto, /se retiraron \$31\.000,00/);
});

test("A4. ningún movimiento se cuenta dos veces", () => {
  const con = t188();
  const propios = con.reduce((s, a) => s + a.desdeAnterior.retiroDelControl, 0);
  const manuales = con.reduce((s, a) => s + a.desdeAnterior.retirosManuales, 0);
  assert.equal(propios, 209100, "los cuatro retiros de recaudación");
  assert.equal(manuales, 40000, "la caja chica, una sola vez");
  assert.equal(propios + manuales, 249100, "el total de movimientos RETIRO del turno");
  const ingresos = con.reduce((s, a) => s + a.desdeAnterior.ingresos, 0);
  assert.equal(ingresos, 700);
});

test("A5. varios movimientos manuales en un mismo período se suman", () => {
  const arqueos = [
    { id: 1, tipo: "PARCIAL", fechaHora: "2026-08-02T10:00:00Z", efectivoEsperado: 50000, diferencia: 0, efectivoRetirado: 20000, cajaMovimientoRetiroId: 100 },
    { id: 2, tipo: "PARCIAL", fechaHora: "2026-08-02T14:00:00Z", efectivoEsperado: 40000, diferencia: 0, efectivoRetirado: 5000, cajaMovimientoRetiroId: 200 },
  ];
  const movs = [
    { id: 100, tipo: "RETIRO", monto: 20000, createdAt: "2026-08-02T10:00:00.150Z" },
    { id: 300, tipo: "RETIRO", monto: 1000, createdAt: "2026-08-02T11:00:00Z" },
    { id: 301, tipo: "RETIRO", monto: 2500, createdAt: "2026-08-02T12:00:00Z" },
    { id: 200, tipo: "RETIRO", monto: 5000, createdAt: "2026-08-02T14:00:00.120Z" },
  ];
  const con = desglosarEntreArqueos(arqueos, movs, 10000);
  assert.equal(con[1].desdeAnterior.retirosManuales, 3500);
  assert.equal(con[1].desdeAnterior.retiroDelControl, 5000);
  // Delta = 40.000 − 50.000 = −10.000. Aritmética: retiro previo 20.000 + manuales
  // 3.500 → ventas = −10.000 − 0 + 23.500 = 13.500.
  assert.equal(con[1].desdeAnterior.ventasEfectivo, 13500);
});

test("A6. el vínculo manda aunque el movimiento se cree después de fechaHora", () => {
  // El caso exacto que rompía: el movimiento nace 150 ms DESPUÉS del arqueo.
  const arqueos = [
    { id: 1, tipo: "PARCIAL", fechaHora: "2026-08-02T10:00:00.000Z", efectivoEsperado: 30000, diferencia: 0, efectivoRetirado: 10000, cajaMovimientoRetiroId: 5 },
    { id: 2, tipo: "PARCIAL", fechaHora: "2026-08-02T12:00:00.000Z", efectivoEsperado: 25000, diferencia: 0, efectivoRetirado: 8000, cajaMovimientoRetiroId: 6 },
  ];
  const movs = [
    { id: 5, tipo: "RETIRO", monto: 10000, createdAt: "2026-08-02T10:00:00.150Z" },
    { id: 6, tipo: "RETIRO", monto: 8000, createdAt: "2026-08-02T12:00:00.150Z" },
  ];
  const con = desglosarEntreArqueos(arqueos, movs, 20000);
  assert.equal(con[0].desdeAnterior.retiroDelControl, 10000, "su propio retiro, aunque el movimiento sea posterior");
  assert.equal(con[1].desdeAnterior.retiroDelControl, 8000);
  assert.equal(con[1].desdeAnterior.retirosManuales, 0, "el retiro del control anterior no es manual");
});

test("A7. el cierre no hereda el retiro del control anterior", () => {
  const con = t188();
  const final = con[4];
  assert.equal(final.tipo, "FINAL");
  assert.equal(final.desdeAnterior.retiroDelControl, 0, "el cierre del 188 no retiró nada");
  assert.equal(final.desdeAnterior.retirosManuales, 0);
  assert.doesNotMatch(final.desdeAnterior.texto, /31\.000/, "reapareció el retiro anterior");
  assert.equal(final.desdeAnterior.texto, "Desde el control anterior entraron $0,00 en efectivo.");
});

test("A8. los totales del turno 188 no cambian", () => {
  const con = t188();
  // La suma de las ventas por período sigue reconstruyendo el efectivo vendido.
  const ventas = con.reduce((s, a) => s + a.desdeAnterior.ventasEfectivo, 0);
  assert.equal(Math.round(ventas * 100) / 100, 248400);
  // Y el esperado de cada corte no se tocó: esta función solo describe.
  assert.deepEqual(
    con.map((a) => a.efectivoEsperado),
    [127700, 63400, 61300, 56000, 25000]
  );
});

test("A9. la continuidad entre retiros sigue intacta", () => {
  // Cuatro períodos de $10.000 con retiro total: cada corte espera $10.000 y
  // deja $0. El desglose tiene que describir eso, no acumular.
  const arqueos = [1, 2, 3].map((i) => ({
    id: i,
    tipo: "PARCIAL",
    fechaHora: `2026-08-02T1${i}:00:00.000Z`,
    efectivoEsperado: 10000,
    diferencia: 0,
    efectivoRetirado: 10000,
    cajaMovimientoRetiroId: 100 + i,
  }));
  const movs = [1, 2, 3].map((i) => ({
    id: 100 + i,
    tipo: "RETIRO",
    monto: 10000,
    createdAt: `2026-08-02T1${i}:00:00.100Z`,
  }));
  const con = desglosarEntreArqueos(arqueos, movs, 0);
  for (const a of con) {
    assert.equal(a.desdeAnterior.ventasEfectivo, 10000, "cada período vendió 10.000");
    assert.equal(a.desdeAnterior.retiroDelControl, 10000, "y retiró los suyos");
    assert.equal(a.desdeAnterior.retirosManuales, 0);
  }
});
