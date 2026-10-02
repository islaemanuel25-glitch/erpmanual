// CANDADO: LA PRESENTACIÓN DEL RESUMEN FINANCIERO MOBILE.
//
//   node --import ./scripts/alias-loader.mjs --test lib/finanzas/presentacionResumen.test.mjs
//
// Prueba el CÁLCULO DE PRESENTACIÓN —porcentajes derivados, composición de
// cobros, recorte de actividad— sin DOM. No prueba la fórmula financiera: ésa
// vive en `resumenFinanciero.js` y tiene su propio candado. Acá están los casos
// de borde donde la presentación se rompe: ventas en cero, sin cobros, un solo
// medio, más de dos medios, y el recorte de hechos.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  avisoDeRetirosManuales,
  composicionDeCobros,
  formatearPorcentaje,
  hayRetirosManuales,
  porcentajeSobreVentas,
  recortarActividad,
  resultadoEsNegativo,
  textoDeResultado,
} from "@/lib/finanzas/presentacionResumen";

// ── PORCENTAJE SOBRE VENTAS ───────────────────────────────────────────────

test("P1 · el porcentaje sobre ventas es parte/ventas*100", () => {
  // Resultado 264826.56 sobre ventas 1353300 → 19,56…%
  assert.ok(Math.abs(porcentajeSobreVentas(264826.56, 1353300) - 19.5686) < 0.001);
  // Margen 298741.56 sobre las mismas ventas → 22,07…%
  assert.ok(Math.abs(porcentajeSobreVentas(298741.56, 1353300) - 22.0751) < 0.001);
});

test("P2 · ventas en cero NO produce NaN ni Infinity: devuelve null", () => {
  assert.equal(porcentajeSobreVentas(0, 0), null);
  assert.equal(porcentajeSobreVentas(1000, 0), null);
  assert.equal(porcentajeSobreVentas(1000, -5), null);
  assert.equal(porcentajeSobreVentas(1000, undefined), null);
  // Y el formateo de un null es null: la vista no dibuja "NaN%" ni "0%".
  assert.equal(formatearPorcentaje(porcentajeSobreVentas(1000, 0)), null);
});

test("P3 · el porcentaje negativo conserva el signo", () => {
  assert.ok(porcentajeSobreVentas(-45200, 1353300) < 0);
});

test("P4 · el formato es es-AR, con los decimales pedidos", () => {
  assert.equal(formatearPorcentaje(19.5686), "19,6%");
  assert.equal(formatearPorcentaje(22.0751), "22,1%");
  // Entero para la composición de cobros.
  assert.equal(formatearPorcentaje(64.2, 0), "64%");
  assert.equal(formatearPorcentaje(35.8, 0), "36%");
  assert.equal(formatearPorcentaje(null), null);
  assert.equal(formatearPorcentaje(Infinity), null);
});

// ── EL TEXTO DEL RESULTADO ────────────────────────────────────────────────

test("P5 · el resultado positivo se formatea normal", () => {
  assert.equal(textoDeResultado(264826.56), "$264.826,56");
  assert.equal(textoDeResultado(0), "$0,00");
  assert.equal(resultadoEsNegativo(264826.56), false);
  assert.equal(resultadoEsNegativo(0), false);
});

test("P6 · el resultado negativo lleva el signo explícito adelante, no solo color", () => {
  // El "− " delante del símbolo comunica el negativo sin depender del color.
  assert.equal(textoDeResultado(-45200), "− $45.200,00");
  assert.equal(resultadoEsNegativo(-45200), true);
});

// ── COMPOSICIÓN DE COBROS ─────────────────────────────────────────────────

const medio = (medio, rotulo, monto, esCobro = true) => ({ medio, rotulo, monto, esCobro });

test("P7 · cada medio lleva su porcentaje sobre el total cobrado", () => {
  const { medios, total, hayCobros } = composicionDeCobros({
    medios: [medio("EFECTIVO", "Efectivo", 868800), medio("MERCADOPAGO", "Mercado Pago", 484500)],
  });
  assert.equal(total, 1353300);
  assert.equal(hayCobros, true);
  assert.equal(formatearPorcentaje(medios[0].pct, 0), "64%");
  assert.equal(formatearPorcentaje(medios[1].pct, 0), "36%");
});

test("P8 · el fiado NO entra en el total ni lleva porcentaje", () => {
  const { medios, total } = composicionDeCobros({
    medios: [
      medio("EFECTIVO", "Efectivo", 1000),
      medio("FIADO", "Fiado", 500, false),
    ],
  });
  // El total cobrado son los 1000 de efectivo; el fiado no es plata que entró.
  assert.equal(total, 1000);
  assert.equal(medios[0].pct, 100);
  assert.equal(medios[1].pct, null);
});

test("P9 · sin cobros, ningún porcentaje: null, no cero ni NaN", () => {
  const { medios, total, hayCobros } = composicionDeCobros({ medios: [] });
  assert.equal(total, 0);
  assert.equal(hayCobros, false);
  assert.deepEqual(medios, []);
  // Un solo medio en cero tampoco divide por cero.
  const solo = composicionDeCobros({ medios: [medio("EFECTIVO", "Efectivo", 0)] });
  assert.equal(solo.hayCobros, false);
  assert.equal(solo.medios[0].pct, null);
});

test("P10 · NO asume dos medios: respeta los que trae el contrato", () => {
  const { medios } = composicionDeCobros({
    medios: [
      medio("EFECTIVO", "Efectivo", 500),
      medio("DEBITO", "Débito", 300),
      medio("MERCADOPAGO", "Mercado Pago", 200),
    ],
  });
  assert.equal(medios.length, 3);
  assert.equal(formatearPorcentaje(medios[0].pct, 0), "50%");
  assert.equal(formatearPorcentaje(medios[1].pct, 0), "30%");
  assert.equal(formatearPorcentaje(medios[2].pct, 0), "20%");
});

// ── RETIROS MANUALES ──────────────────────────────────────────────────────

test("P11 · el aviso de retiros se muestra solo si salió plata", () => {
  assert.equal(hayRetirosManuales({ retiros: 61500 }), true);
  assert.equal(hayRetirosManuales({ retiros: 0 }), false);
  assert.equal(hayRetirosManuales({}), false);
  assert.equal(hayRetirosManuales(null), false);
});

test("P12 · el aviso dice que salió plata sin clasificar, y NO la llama gasto", () => {
  const txt = avisoDeRetirosManuales({ retiros: 61500 });
  assert.ok(txt.includes("$61.500,00"));
  assert.ok(txt.includes("todavía no están clasificados como gastos"));
  assert.doesNotMatch(txt, /son gastos|es un gasto/i);
});

// ── RECORTE DE ACTIVIDAD ──────────────────────────────────────────────────

const dia = (clave, ...hechos) => ({ clave, hechos: hechos.map((c) => ({ clave: c })) });

test("P13 · con 3 hechos o menos, se muestran todos y no hay 'ver más'", () => {
  const act = [dia("d1", "a", "b"), dia("d2", "c")];
  const { dias, hayMas, totalHechos } = recortarActividad(act, 3);
  assert.equal(totalHechos, 3);
  assert.equal(hayMas, false);
  assert.equal(dias.length, 2);
});

test("P14 · con más de 3, se recorta a 3 hechos a través de los días, en orden", () => {
  const act = [dia("d1", "a", "b"), dia("d2", "c", "d", "e"), dia("d3", "f")];
  const { dias, hayMas } = recortarActividad(act, 3);
  assert.equal(hayMas, true);
  // d1 aporta sus 2, d2 aporta 1 (el primero), d3 no aparece.
  assert.equal(dias.length, 2);
  assert.deepEqual(dias[0].hechos.map((h) => h.clave), ["a", "b"]);
  assert.deepEqual(dias[1].hechos.map((h) => h.clave), ["c"]);
});

test("P15 · con limite null se muestra todo (es el 'ver toda la actividad')", () => {
  const act = [dia("d1", "a", "b"), dia("d2", "c", "d", "e")];
  const { dias, hayMas } = recortarActividad(act, null);
  assert.equal(hayMas, false);
  assert.equal(dias.length, 2);
  assert.equal(dias[1].hechos.length, 3);
});

test("P16 · actividad vacía no rompe", () => {
  const { dias, hayMas, totalHechos } = recortarActividad([], 3);
  assert.deepEqual(dias, []);
  assert.equal(hayMas, false);
  assert.equal(totalHechos, 0);
  assert.deepEqual(recortarActividad(undefined, 3).dias, []);
});
