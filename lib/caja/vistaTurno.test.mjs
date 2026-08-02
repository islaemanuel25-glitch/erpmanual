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
  assert.match(con[1].desdeAnterior.texto, /^Desde el arqueo anterior entraron \$85\.700,00 en efectivo\.$/);

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
  assert.match(con[1].desdeAnterior.texto, /entraron \$30\.000,00 en efectivo, ingresaron \$5\.000,00, se retiraron \$20\.000,00/);
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
