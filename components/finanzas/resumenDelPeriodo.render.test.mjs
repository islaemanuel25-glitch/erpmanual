// CANDADO DE RENDER: EL RESUMEN FINANCIERO MOBILE DIBUJADO.
//
//   node --import ./scripts/alias-loader.mjs --test components/finanzas/resumenDelPeriodo.render.test.mjs
//
// Renderiza `ResumenDelPeriodo` con `renderToStaticMarkup` —el mismo harness que
// `pagoADeposito.test.mjs`— y afirma lo que la vista TIENE que decir: el
// Resultado protagonista, los porcentajes solo donde corresponden, el nombre
// completo del CMV, que "283 ventas" no se repite, que Pagos a proveedores ya no
// figura como métrica faltante, y los estados especiales (negativo, cero,
// comisión pendiente, sin cobros, retiros).
//
// No prueba la fórmula —eso es `resumenFinanciero.test.mjs`—: prueba la pantalla.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { resumenDelPeriodo } from "@/lib/finanzas/resumenFinanciero";
import ResumenDelPeriodo from "@/components/finanzas/ResumenDelPeriodo.jsx";

const html = (override) =>
  renderToStaticMarkup(
    React.createElement(ResumenDelPeriodo, {
      resumen: { ...resumenDelPeriodo({ ventas: [] }), ...override },
      descripcion: null,
    }),
  );

/** Los números del frame FINAL aprobado (Casiano Casas · Día). */
const LLENO = Object.freeze({
  ventas: 1353300,
  costoVendido: 1054558.44,
  margenBruto: 298741.56,
  gastos: 0,
  comisionesDeCobro: 33915,
  resultado: 264826.56,
  cantidadVentas: 283,
  comisionesPendientes: false,
  ventasSinCosto: 0,
  verGastos: "/modulos/finanzas/gastos?estado=TODAS&unidad=DIA&desp=0",
  cobros: {
    medios: [
      { medio: "EFECTIVO", rotulo: "Efectivo", monto: 868800, comision: 0, neto: 0, esEfectivo: true, esCobro: true },
      { medio: "MERCADOPAGO", rotulo: "Mercado Pago", monto: 484500, comision: 33915, neto: 450585, esEfectivo: false, esCobro: true },
    ],
    comisiones: 33915,
    netoDigital: 450585,
    efectivo: 868800,
    digital: 484500,
    fiado: 0,
  },
  caja: {
    ingresos: 0,
    retiros: 61500,
    retirosDeRecaudacion: 800000,
    cantidadIngresos: 0,
    cantidadRetiros: 2,
    cantidadRetirosDeRecaudacion: 1,
  },
  pagoADeposito: {
    aplica: true,
    total: 0,
    cantidadTransferencias: 0,
    verDetalle: "/modulos/transferencias/cuenta?desp=0&criterio=RECEPCION",
    pendientes: { total: 2658311.12, cantidadTransferencias: 4 },
  },
});

const cuenta = (s, sub) => s.split(sub).length - 1;

// ── 1 · RESULTADO PROTAGONISTA ────────────────────────────────────────────

test("V1 · el Resultado del período es el protagonista, arriba y grande", () => {
  const salida = html(LLENO);
  assert.ok(salida.includes("Resultado del período"));
  assert.ok(salida.includes("$264.826,56"));
  // El número grande usa el tamaño héroe (xl3), no el de un renglón más.
  assert.match(salida, /text-xl3[^"]*font-semibold[^"]*sunmi-text-strong">\$264\.826,56/);
});

test("V2 · indicadores: 19,6% sobre ventas y 283 ventas, junto al Resultado", () => {
  const salida = html(LLENO);
  assert.ok(salida.includes("283 ventas"));
  assert.ok(salida.includes("19,6% sobre ventas"));
});

// ── 2 · 283 VENTAS NO SE REPITE EN "CÓMO SE FORMA" ────────────────────────

test("V3 · '283 ventas' aparece UNA sola vez: en el héroe, no en la fila Ventas", () => {
  const salida = html(LLENO);
  assert.equal(cuenta(salida, "283 ventas"), 1, "la cantidad de ventas se dibujó dos veces");
  // La fila Ventas del recorrido muestra el importe, no la cantidad.
  assert.ok(salida.includes("$1.353.300,00"));
});

// ── 3 · NOMBRE COMPLETO DEL CMV ───────────────────────────────────────────

test("V4 · el CMV usa el nombre completo, no la forma corta", () => {
  const salida = html(LLENO);
  assert.ok(salida.includes("Costo de mercadería vendida"));
  assert.doesNotMatch(salida, />Mercadería vendida</, "quedó la forma corta que se confunde con el precio de venta");
  assert.ok(salida.includes("− $1.054.558,44"));
});

// ── 4 · PORCENTAJES SOLO EN MARGEN Y RESULTADO ────────────────────────────

test("V5 · Margen y Resultado llevan '% sobre ventas'", () => {
  const salida = html(LLENO);
  assert.ok(salida.includes("22,1% sobre ventas"));
  assert.ok(salida.includes("19,6% sobre ventas"));
});

// ── 5 · COBROS: COMPOSICIÓN SIN ASUMIR DOS MEDIOS ─────────────────────────

test("V6 · Cobros muestra la composición (porcentaje por medio) y el neto", () => {
  const salida = html(LLENO);
  assert.ok(salida.includes("Efectivo"));
  assert.ok(salida.includes("Mercado Pago"));
  assert.ok(salida.includes("64%"));
  assert.ok(salida.includes("36%"));
  assert.ok(salida.includes("Neto recibido"));
  assert.ok(salida.includes("$450.585"));
});

test("V7 · sin cobros, estado vacío y sin porcentajes NaN", () => {
  const salida = html({ cobros: { medios: [], comisiones: 0, netoDigital: 0, efectivo: 0, digital: 0, fiado: 0 } });
  assert.ok(salida.includes("No hubo cobros en el período."));
  assert.ok(!salida.includes("NaN"));
  assert.ok(!salida.includes("Infinity"));
});

// ── 6 · VER GASTOS CONSERVA EL CONTEXTO DE #124 ───────────────────────────

test("V8 · 'Ver gastos' sigue abriendo Gastos con la pestaña Todos y el contexto", () => {
  const salida = html(LLENO);
  assert.ok(salida.includes("Ver gastos"));
  assert.match(salida, /href="\/modulos\/finanzas\/gastos\?estado=TODAS[^"]*"/);
});

// ── 7 · PAGO A DEPÓSITO: NO RESTA DEL RESULTADO ───────────────────────────

test("V9 · Pago a depósito muestra el pendiente y dice que no resta del resultado", () => {
  const salida = html(LLENO);
  assert.ok(salida.includes("Pago a depósito"));
  assert.ok(salida.includes("$2.658.311,12"));
  assert.ok(salida.includes("4 transferencias"));
  assert.ok(salida.includes("No resta del resultado"));
});

// ── 8 · MOVIMIENTOS DE CAJA: AVISO SOLO SI HAY RETIROS ────────────────────

test("V10 · con retiros manuales > 0 se muestra el aviso, sin llamarlos gasto", () => {
  const salida = html(LLENO);
  assert.ok(salida.includes("Retiros manuales"));
  assert.ok(salida.includes("$61.500,00 salieron de caja y todavía no están clasificados como gastos."));
  // Recaudación retirada queda clara como que NO es gasto.
  assert.ok(salida.includes("Recaudación retirada"));
  assert.ok(salida.includes("No es un gasto"));
});

test("V11 · con retiros manuales = 0 NO se muestra el aviso", () => {
  const salida = html({ caja: { ingresos: 0, retiros: 0, retirosDeRecaudacion: 0, cantidadIngresos: 0, cantidadRetiros: 0, cantidadRetirosDeRecaudacion: 0 } });
  assert.ok(!salida.includes("salieron de caja"));
});

// ── 9 · PAGOS A PROVEEDORES YA NO ES "MÉTRICA FALTANTE" ───────────────────

test("V12 · el Resumen económico ya no muestra 'Todavía no disponible / Pagos a proveedores'", () => {
  const salida = html(LLENO);
  assert.ok(!salida.includes("Todavía no disponible"));
  assert.ok(!salida.includes("Pagos a proveedores"));
});

// ── 10 · ESTADOS ESPECIALES ───────────────────────────────────────────────

test("V13 · resultado NEGATIVO: signo explícito y tono danger (no solo color)", () => {
  const salida = html({ ...LLENO, resultado: -45200 });
  assert.ok(salida.includes("− $45.200,00"));
  // El tono danger acompaña, pero el signo "−" ya lo comunica sin color.
  assert.match(salida, /sunmi-text-danger">− \$45\.200,00/);
});

test("V14 · resultado CERO: neutral, sin NaN y sin porcentaje", () => {
  const salida = html({ ventas: 0, resultado: 0, margenBruto: 0, costoVendido: 0, cantidadVentas: 0 });
  assert.ok(salida.includes("$0,00"));
  assert.ok(!salida.includes("NaN"));
  assert.ok(!salida.includes("Infinity"));
  assert.ok(!salida.includes("sobre ventas"), "con ventas en cero no debe dibujarse un porcentaje");
});

test("V15 · comisión pendiente: resultado visible + aviso, sin estimar", () => {
  const salida = html({ ...LLENO, comisionesPendientes: true });
  assert.ok(salida.includes("$264.826,56"), "el resultado se sigue mostrando");
  assert.ok(salida.includes("Hay comisiones pendientes de determinar"));
  assert.ok(salida.includes("puede estar"));
});
