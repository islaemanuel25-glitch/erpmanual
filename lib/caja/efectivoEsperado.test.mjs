// Fórmula del efectivo esperado — la fuente de verdad de la caja.
//
// Estos casos son la razón de haberla centralizado: antes vivía tres veces
// (cierre, resumen y el modal), y basta con que una copia trate distinto un
// pago mixto para que el cierre y el arqueo informen faltantes distintos sobre
// la misma caja.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  calcularEfectivoEsperado,
  desglosarVentas,
  desglosarMovimientos,
  calcularDiferencia,
  clasificarDiferencia,
  aCentavos,
  desdeCentavos,
  CORRECTO,
  SOBRANTE,
  FALTANTE,
} from "./efectivoEsperado.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const sinComentarios = (rel) =>
  fs.readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

// Venta con tenders explícitos (VentaPago).
const venta = (tenders) => ({ pagos: tenders.map((t) => ({ comision: 0, neto: t.monto, ...t })) });
// Venta legacy sin filas en VentaPago.
const ventaLegacy = (formaPago, total, extra = {}) => ({ formaPago, total, ...extra });
const mov = (tipo, monto) => ({ tipo, monto });

// ── 6. Venta únicamente en efectivo ─────────────────────────────────────────

test("6. venta solo en efectivo suma al esperado", () => {
  const r = calcularEfectivoEsperado({
    montoInicial: 1000,
    ventas: [venta([{ medio: "EFECTIVO", monto: 500 }])],
  });
  assert.equal(r.ventasEfectivo, 500);
  assert.equal(r.ventasDigital, 0);
  assert.equal(r.efectivoEsperado, 1500);
});

// ── 7. Pago mixto ───────────────────────────────────────────────────────────

test("7. pago mixto suma SOLO la porción en efectivo", () => {
  const r = calcularEfectivoEsperado({
    montoInicial: 0,
    ventas: [
      venta([
        { medio: "EFECTIVO", monto: 300 },
        { medio: "MERCADOPAGO", monto: 700 },
      ]),
    ],
  });
  assert.equal(r.ventasEfectivo, 300, "el total de 1000 no puede ir entero al efectivo");
  assert.equal(r.ventasDigital, 700);
  assert.equal(r.efectivoEsperado, 300);
});

test("7b. mixto con tres medios reparte cada uno a su bucket", () => {
  const r = calcularEfectivoEsperado({
    ventas: [
      venta([
        { medio: "EFECTIVO", monto: 100 },
        { medio: "DEBITO", monto: 200 },
        { medio: "CREDITO", monto: 300 },
      ]),
    ],
  });
  assert.equal(r.ventasEfectivo, 100);
  assert.equal(r.ventasDigital, 500);
});

// ── 8. Mercado Pago ─────────────────────────────────────────────────────────

test("8. MercadoPago no es plata en el cajón", () => {
  const r = calcularEfectivoEsperado({
    montoInicial: 1000,
    ventas: [venta([{ medio: "MERCADOPAGO", monto: 5000 }])],
  });
  assert.equal(r.ventasEfectivo, 0);
  assert.equal(r.ventasDigital, 5000);
  assert.equal(r.efectivoEsperado, 1000, "el esperado sigue siendo solo el fondo inicial");
});

test("8b. débito y crédito tampoco", () => {
  const r = calcularEfectivoEsperado({
    montoInicial: 0,
    ventas: [venta([{ medio: "DEBITO", monto: 900 }]), venta([{ medio: "CREDITO", monto: 800 }])],
  });
  assert.equal(r.efectivoEsperado, 0);
  assert.equal(r.ventasDigital, 1700);
});

// ── 9. Venta fiada ──────────────────────────────────────────────────────────

test("9. fiado no aporta ni efectivo ni digital", () => {
  const r = calcularEfectivoEsperado({
    montoInicial: 500,
    ventas: [venta([{ medio: "FIADO", monto: 3000 }])],
  });
  assert.equal(r.ventasEfectivo, 0);
  assert.equal(r.ventasDigital, 0);
  assert.equal(r.ventasFiado, 3000);
  assert.equal(r.efectivoEsperado, 500);
});

test("9b. una venta parte efectivo parte fiado solo suma el efectivo", () => {
  const r = calcularEfectivoEsperado({
    ventas: [venta([{ medio: "EFECTIVO", monto: 200 }, { medio: "FIADO", monto: 800 }])],
  });
  assert.equal(r.efectivoEsperado, 200);
  assert.equal(r.ventasFiado, 800);
});

test("9c. venta legacy marcada esFiado no suma efectivo", () => {
  const r = calcularEfectivoEsperado({
    ventas: [ventaLegacy("efectivo", 1000, { esFiado: true })],
  });
  assert.equal(r.efectivoEsperado, 0, "esFiado manda sobre formaPago");
  assert.equal(r.ventasFiado, 1000);
});

// ── 10-12. Movimientos de caja ──────────────────────────────────────────────

test("10. un ingreso suma al esperado", () => {
  const r = calcularEfectivoEsperado({ montoInicial: 1000, movimientos: [mov("INGRESO", 500)] });
  assert.equal(r.ingresos, 500);
  assert.equal(r.efectivoEsperado, 1500);
});

test("11. un retiro resta del esperado", () => {
  const r = calcularEfectivoEsperado({ montoInicial: 1000, movimientos: [mov("RETIRO", 300)] });
  assert.equal(r.retiros, 300);
  assert.equal(r.efectivoEsperado, 700);
});

test("12. un gasto es un RETIRO con motivo: resta igual", () => {
  // Hoy no existe el tipo GASTO. Un gasto se carga como RETIRO y el esperado lo
  // trata como cualquier salida de dinero.
  const r = calcularEfectivoEsperado({
    montoInicial: 2000,
    movimientos: [{ tipo: "RETIRO", monto: 450, motivo: "Gasto: flete" }],
  });
  assert.equal(r.efectivoEsperado, 1550);
});

test("12b. un tipo desconocido se ignora, no se asume ingreso", () => {
  const r = calcularEfectivoEsperado({
    montoInicial: 1000,
    movimientos: [{ tipo: "LO_QUE_SEA", monto: 9999 }],
  });
  assert.equal(r.efectivoEsperado, 1000, "no se inventa plata en el cajón");
});

// ── 13. Devolución en efectivo ──────────────────────────────────────────────

test("13. una devolución en efectivo se registra hoy como RETIRO y resta", () => {
  // LIMITACIÓN CONOCIDA: el sistema no tiene flujo propio de devolución. Se
  // carga como RETIRO con motivo, y así lo refleja el arqueo. Este test fija el
  // comportamiento REAL de hoy, no uno futuro.
  const r = calcularEfectivoEsperado({
    montoInicial: 1000,
    ventas: [venta([{ medio: "EFECTIVO", monto: 500 }])],
    movimientos: [{ tipo: "RETIRO", monto: 200, motivo: "Devolución venta #12" }],
  });
  assert.equal(r.efectivoEsperado, 1300);
});

// ── Fórmula completa ────────────────────────────────────────────────────────

test("F1. la fórmula completa: inicial + efectivo + ingresos − retiros", () => {
  const r = calcularEfectivoEsperado({
    montoInicial: 5000,
    ventas: [
      venta([{ medio: "EFECTIVO", monto: 1200 }]),
      venta([{ medio: "EFECTIVO", monto: 300 }, { medio: "DEBITO", monto: 700 }]),
      venta([{ medio: "MERCADOPAGO", monto: 2500 }]),
      venta([{ medio: "FIADO", monto: 900 }]),
    ],
    movimientos: [mov("INGRESO", 400), mov("RETIRO", 1000), mov("RETIRO", 250)],
  });
  // 5000 + (1200 + 300) + 400 − 1250
  assert.equal(r.efectivoEsperado, 5650);
  assert.equal(r.ventasDigital, 3200);
  assert.equal(r.ventasFiado, 900);
  assert.equal(r.cantidadVentas, 4);
});

test("F2. sin nada, el esperado es el fondo inicial", () => {
  assert.equal(calcularEfectivoEsperado({ montoInicial: 3000 }).efectivoEsperado, 3000);
  assert.equal(calcularEfectivoEsperado({}).efectivoEsperado, 0);
});

test("F3. las diferencias de arqueos anteriores NO entran en la fórmula", () => {
  // La firma no acepta arqueos: no hay forma de que un faltante previo se sume.
  const r = calcularEfectivoEsperado({
    montoInicial: 1000,
    ventas: [venta([{ medio: "EFECTIVO", monto: 500 }])],
    movimientos: [],
    // Un llamador despistado que pase esto no puede alterar el resultado.
    arqueosPrevios: [{ diferencia: -1000 }],
  });
  assert.equal(r.efectivoEsperado, 1500);
});

// ── Decimales ───────────────────────────────────────────────────────────────

test("D1. cien ventas de 0.1 suman exactamente 10", () => {
  const ventas = Array.from({ length: 100 }, () => venta([{ medio: "EFECTIVO", monto: 0.1 }]));
  assert.equal(calcularEfectivoEsperado({ ventas }).ventasEfectivo, 10);
});

test("D2. 0.1 + 0.2 en efectivo da 0.3, no 0.30000000000000004", () => {
  const r = calcularEfectivoEsperado({
    ventas: [venta([{ medio: "EFECTIVO", monto: 0.1 }]), venta([{ medio: "EFECTIVO", monto: 0.2 }])],
  });
  assert.equal(r.ventasEfectivo, 0.3);
});

test("D3. centavos: ida y vuelta sin pérdida", () => {
  assert.equal(desdeCentavos(aCentavos(12345.67)), 12345.67);
  assert.equal(aCentavos(undefined), 0);
  assert.equal(aCentavos("no es número"), 0);
  assert.equal(aCentavos(null), 0);
});

test("D4. importes grandes no pierden centavos", () => {
  const r = calcularEfectivoEsperado({
    montoInicial: 999999.99,
    ventas: [venta([{ medio: "EFECTIVO", monto: 0.01 }])],
  });
  assert.equal(r.efectivoEsperado, 1000000);
});

// ── 14-16. Diferencia y clasificación ───────────────────────────────────────

test("14. arqueo exacto → diferencia 0 y CORRECTO", () => {
  const d = calcularDiferencia(1500, 1500);
  assert.equal(d, 0);
  assert.equal(clasificarDiferencia(d), CORRECTO);
});

test("15. sobrante → diferencia positiva", () => {
  const d = calcularDiferencia(1600, 1500);
  assert.equal(d, 100);
  assert.equal(clasificarDiferencia(d), SOBRANTE);
});

test("16. faltante → diferencia negativa", () => {
  const d = calcularDiferencia(1400, 1500);
  assert.equal(d, -100);
  assert.equal(clasificarDiferencia(d), FALTANTE);
});

test("16b. un centavo de diferencia no se redondea a CORRECTO", () => {
  assert.equal(clasificarDiferencia(calcularDiferencia(1500.01, 1500)), SOBRANTE);
  assert.equal(clasificarDiferencia(calcularDiferencia(1499.99, 1500)), FALTANTE);
});

test("16c. la diferencia se calcula en centavos, sin residuo binario", () => {
  assert.equal(calcularDiferencia(0.3, 0.1 + 0.2), 0);
});

// ── Desgloses sueltos ───────────────────────────────────────────────────────

test("G1. desglosarVentas separa comisión y neto del digital", () => {
  const r = desglosarVentas([
    { pagos: [{ medio: "MERCADOPAGO", monto: 1000, comision: 35, neto: 965 }] },
  ]);
  assert.equal(r.digitalCentavos, 100000);
  assert.equal(r.comisionCentavos, 3500);
  assert.equal(r.netoDigitalCentavos, 96500);
});

test("G2. desglosarMovimientos tolera lista vacía y valores basura", () => {
  assert.deepEqual(desglosarMovimientos([]), { ingresosCentavos: 0, retirosCentavos: 0 });
  assert.deepEqual(desglosarMovimientos([{ tipo: "INGRESO", monto: "x" }]), {
    ingresosCentavos: 0,
    retirosCentavos: 0,
  });
});

// ── Invariantes estructurales ───────────────────────────────────────────────

test("E1. los tres consumidores usan el helper, no su propia fórmula", () => {
  for (const rel of [
    "app/api/pos-ventas/turnos/cerrar/route.js",
    "app/api/pos-ventas/turnos/resumen/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(
      /from "@\/lib\/caja\/efectivoEsperado"/.test(src),
      `${rel} no importa el helper centralizado`
    );
    assert.ok(/calcularEfectivoEsperado\(/.test(src), `${rel} no lo usa`);
  }
});

test("E2. ningún consumidor reimplementa la suma a mano", () => {
  for (const rel of [
    "app/api/pos-ventas/turnos/cerrar/route.js",
    "app/api/pos-ventas/turnos/resumen/route.js",
  ]) {
    const src = sinComentarios(rel);
    assert.ok(
      !/montoInicial\)\s*\+\s*total(Efectivo|Ventas)/.test(src),
      `${rel} volvió a armar la fórmula a mano`
    );
    assert.ok(
      !/tipo === "INGRESO"\) total/.test(src),
      `${rel} volvió a sumar movimientos a mano`
    );
  }
});

test("E3. el arqueo NO tiene fórmula propia: usa la misma función", () => {
  const src = sinComentarios("lib/caja/arqueoServer.js");
  assert.ok(/from "\.\/efectivoEsperado"/.test(src));
  assert.ok(/calcularEfectivoEsperado\(/.test(src));
  assert.ok(
    !/montoInicial\s*\+\s*\w*[Ee]fectivo/.test(src),
    "el servidor de arqueos reimplementa la fórmula"
  );
});
