import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarMedio,
  normalizarYConsolidarPagos,
  aplicarComisiones,
  derivarCamposVenta,
  aCentavos,
  lineasPagoTicket,
  esPagoDividido,
  etiquetaMedio,
  calcularVueltoEfectivo,
} from "./pagos.js";

// ---------------------------------------------------------------------------
// normalizarMedio
// ---------------------------------------------------------------------------
test("normalizarMedio: legacy minúscula → enum", () => {
  assert.equal(normalizarMedio("efectivo"), "EFECTIVO");
  assert.equal(normalizarMedio("mercadopago"), "MERCADOPAGO");
  assert.equal(normalizarMedio("debito"), "DEBITO");
  assert.equal(normalizarMedio("credito"), "CREDITO");
  assert.equal(normalizarMedio("fiado"), "FIADO");
});
test("normalizarMedio: enum directo, espacios, acentos, guiones", () => {
  assert.equal(normalizarMedio("EFECTIVO"), "EFECTIVO");
  assert.equal(normalizarMedio("  Débito "), "DEBITO");
  assert.equal(normalizarMedio("Mercado Pago"), "MERCADOPAGO");
  assert.equal(normalizarMedio("crédito"), "CREDITO");
});
test("normalizarMedio: desconocido / vacío → null (fail-closed)", () => {
  assert.equal(normalizarMedio("bitcoin"), null);
  assert.equal(normalizarMedio(""), null);
  assert.equal(normalizarMedio(null), null);
  assert.equal(normalizarMedio(undefined), null);
});

// ---------------------------------------------------------------------------
// normalizarYConsolidarPagos — VALIDACIÓN
// ---------------------------------------------------------------------------
test("un solo pago por el total → válido", () => {
  const r = normalizarYConsolidarPagos([{ medio: "efectivo", monto: 17500 }], 17500);
  assert.deepEqual(r.pagos, [{ medio: "EFECTIVO", monto: 17500 }]);
  assert.equal(r.esFiado, false);
});
test("dos pagos cuya suma es el total → válido", () => {
  const r = normalizarYConsolidarPagos(
    [{ medio: "efectivo", monto: 5500 }, { medio: "debito", monto: 12000 }],
    17500
  );
  assert.equal(r.error, undefined);
  assert.equal(r.pagos.length, 2);
});
test("tres pagos cuya suma es el total → válido", () => {
  const r = normalizarYConsolidarPagos(
    [{ medio: "efectivo", monto: 5000 }, { medio: "debito", monto: 7500 }, { medio: "credito", monto: 5000 }],
    17500
  );
  assert.equal(r.error, undefined);
  assert.equal(r.pagos.length, 3);
});
test("suma MENOR al total → inválido", () => {
  const r = normalizarYConsolidarPagos([{ medio: "efectivo", monto: 17000 }], 17500);
  assert.match(r.error, /suma de los pagos/i);
});
test("suma MAYOR al total → inválido", () => {
  const r = normalizarYConsolidarPagos([{ medio: "efectivo", monto: 18000 }], 17500);
  assert.match(r.error, /suma de los pagos/i);
});
test("diferencia de UN CENTAVO → inválido", () => {
  const r = normalizarYConsolidarPagos([{ medio: "efectivo", monto: 17500.01 }], 17500);
  assert.ok(r.error);
  const r2 = normalizarYConsolidarPagos([{ medio: "efectivo", monto: 17499.99 }], 17500);
  assert.ok(r2.error);
});
test("pago CERO → inválido", () => {
  assert.ok(normalizarYConsolidarPagos([{ medio: "efectivo", monto: 0 }], 0).error);
  assert.ok(normalizarYConsolidarPagos([{ medio: "efectivo", monto: 0 }, { medio: "debito", monto: 100 }], 100).error);
});
test("pago NEGATIVO → inválido", () => {
  assert.ok(normalizarYConsolidarPagos([{ medio: "efectivo", monto: -100 }], -100).error);
});
test("medio DESCONOCIDO → inválido", () => {
  assert.match(normalizarYConsolidarPagos([{ medio: "bitcoin", monto: 100 }], 100).error, /desconocido/i);
});
test("NaN / Infinity → inválidos", () => {
  assert.ok(normalizarYConsolidarPagos([{ medio: "efectivo", monto: NaN }], 100).error);
  assert.ok(normalizarYConsolidarPagos([{ medio: "efectivo", monto: Infinity }], 100).error);
  assert.ok(normalizarYConsolidarPagos([{ medio: "efectivo", monto: "abc" }], 100).error);
});
test("vacío / no-array → inválido", () => {
  assert.ok(normalizarYConsolidarPagos([], 100).error);
  assert.ok(normalizarYConsolidarPagos(null, 100).error);
});

// ---------------------------------------------------------------------------
// MEDIOS REPETIDOS: se consolidan de forma determinista (máx 1 por medio)
// ---------------------------------------------------------------------------
test("dos pagos del MISMO medio se consolidan en un tender", () => {
  const r = normalizarYConsolidarPagos(
    [{ medio: "efectivo", monto: 3000 }, { medio: "efectivo", monto: 2500 }],
    5500
  );
  assert.equal(r.error, undefined);
  assert.deepEqual(r.pagos, [{ medio: "EFECTIVO", monto: 5500 }]);
});

// ---------------------------------------------------------------------------
// FIADO
// ---------------------------------------------------------------------------
test("FIADO por el total → válido, esFiado=true", () => {
  const r = normalizarYConsolidarPagos([{ medio: "fiado", monto: 5500 }], 5500);
  assert.equal(r.esFiado, true);
  assert.deepEqual(r.pagos, [{ medio: "FIADO", monto: 5500 }]);
});
test("FIADO + efectivo → inválido (fiado debe ser único)", () => {
  const r = normalizarYConsolidarPagos([{ medio: "fiado", monto: 5000 }, { medio: "efectivo", monto: 500 }], 5500);
  assert.match(r.error, /FIADO.*único/i);
});
test("FIADO + débito → inválido", () => {
  const r = normalizarYConsolidarPagos([{ medio: "fiado", monto: 5000 }, { medio: "debito", monto: 500 }], 5500);
  assert.match(r.error, /FIADO.*único/i);
});

// ---------------------------------------------------------------------------
// COMISIÓN — por tender, congelada
// ---------------------------------------------------------------------------
const PCT = { MERCADOPAGO: 7, DEBITO: 7, CREDITO: 7 };

test("efectivo sin comisión", () => {
  const [t] = aplicarComisiones([{ medio: "EFECTIVO", monto: 5500 }], PCT);
  assert.equal(t.comision, 0);
  assert.equal(t.comisionPct, null);
  assert.equal(t.neto, 5500);
});
test("digital: comisión solo sobre SU tender", () => {
  const tenders = aplicarComisiones(
    [{ medio: "EFECTIVO", monto: 5500 }, { medio: "DEBITO", monto: 12000 }],
    PCT
  );
  const efectivo = tenders.find((t) => t.medio === "EFECTIVO");
  const debito = tenders.find((t) => t.medio === "DEBITO");
  assert.equal(efectivo.comision, 0);
  assert.equal(debito.comision, 840); // 12000 * 7%
  assert.equal(debito.comisionPct, 7);
  assert.equal(debito.neto, 11160);
});
test("venta mixta: comisiones y netos derivados; comisionBancaria = suma", () => {
  const tenders = aplicarComisiones(
    [{ medio: "EFECTIVO", monto: 5500 }, { medio: "DEBITO", monto: 12000 }],
    PCT
  );
  const d = derivarCamposVenta(tenders);
  assert.equal(d.comisionBancaria, 840);
  assert.equal(d.netoRecibido, 16660); // 5500 + 11160
  assert.equal(d.formaPago, "mixto");
  assert.equal(d.esFiado, false);
  assert.equal(d.comisionPct, null); // mixto → null (no inventar %)
});
test("cambiar config luego NO altera valores ya congelados (se recomputa con pct nuevo solo en ventas nuevas)", () => {
  const antes = aplicarComisiones([{ medio: "DEBITO", monto: 1000 }], { DEBITO: 7 });
  const despues = aplicarComisiones([{ medio: "DEBITO", monto: 1000 }], { DEBITO: 10 });
  assert.equal(antes[0].comision, 70);
  assert.equal(despues[0].comision, 100);
  // El tender congela el pct usado: una venta vieja mantiene 70 en su fila VentaPago.
});

// ---------------------------------------------------------------------------
// derivarCamposVenta — formaPago legacy
// ---------------------------------------------------------------------------
test("1 tender → formaPago = medio; comisionPct del tender", () => {
  const d = derivarCamposVenta(aplicarComisiones([{ medio: "CREDITO", monto: 1000 }], PCT));
  assert.equal(d.formaPago, "credito");
  assert.equal(d.comisionPct, 7);
});
test("1 tender fiado → esFiado true, formaPago 'fiado'", () => {
  const d = derivarCamposVenta(aplicarComisiones([{ medio: "FIADO", monto: 1000 }], PCT));
  assert.equal(d.formaPago, "fiado");
  assert.equal(d.esFiado, true);
  assert.equal(d.comisionBancaria, 0);
});

test("aCentavos: redondeo estable", () => {
  assert.equal(aCentavos(17500), 1750000);
  assert.equal(aCentavos(5500.5), 550050);
  assert.ok(Number.isNaN(aCentavos("x")));
});

// ---------------------------------------------------------------------------
// TICKET / HISTORIAL: lineasPagoTicket + etiquetaMedio + esPagoDividido
// ---------------------------------------------------------------------------
test("etiquetaMedio: nombres legibles", () => {
  assert.equal(etiquetaMedio("EFECTIVO"), "Efectivo");
  assert.equal(etiquetaMedio("mercadopago"), "Mercado Pago");
  assert.equal(etiquetaMedio("DEBITO"), "Débito");
  assert.equal(etiquetaMedio("credito"), "Crédito");
  assert.equal(etiquetaMedio("FIADO"), "Fiado");
});

test("venta con UN medio: una línea con medio y monto", () => {
  const v = { pagos: [{ medio: "EFECTIVO", monto: 5000 }], total: 5000 };
  assert.equal(esPagoDividido(v), false);
  const l = lineasPagoTicket(v);
  assert.deepEqual(l, [{ medio: "EFECTIVO", label: "Efectivo", monto: 5000 }]);
});

test("venta MIXTA $5.500 efectivo + $12.000 débito: ambas líneas, suma=17.500, no duplica total", () => {
  const v = { pagos: [{ medio: "DEBITO", monto: 12000 }, { medio: "EFECTIVO", monto: 5500 }], total: 17500 };
  assert.equal(esPagoDividido(v), true);
  const l = lineasPagoTicket(v);
  assert.equal(l.length, 2);
  // Orden consistente: EFECTIVO antes que DEBITO.
  assert.equal(l[0].medio, "EFECTIVO");
  assert.equal(l[1].medio, "DEBITO");
  assert.deepEqual(l.map((x) => x.label), ["Efectivo", "Débito"]);
  const suma = l.reduce((a, x) => a + x.monto, 0);
  assert.equal(suma, 17500); // suma de líneas == total
  assert.ok(!l.some((x) => x.monto === 17500)); // ninguna línea muestra el total completo
});

test("ticket con medios en minúscula (payload UI) se etiquetan igual", () => {
  const v = { pagos: [{ medio: "efectivo", monto: 5500 }, { medio: "debito", monto: 12000 }], total: 17500 };
  assert.deepEqual(lineasPagoTicket(v).map((x) => x.label), ["Efectivo", "Débito"]);
});

test("venta legacy/backfill sin pagos: 1 línea desde formaPago + total", () => {
  const v = { formaPago: "credito", esFiado: false, total: 8000, pagos: [] };
  assert.equal(esPagoDividido(v), false);
  assert.deepEqual(lineasPagoTicket(v), [{ medio: "CREDITO", label: "Crédito", monto: 8000 }]);
});
test("venta legacy fiada sin pagos: 1 línea FIADO", () => {
  const v = { formaPago: "fiado", esFiado: true, total: 3000, pagos: [] };
  assert.deepEqual(lineasPagoTicket(v)[0].label, "Fiado");
});

// ---------------------------------------------------------------------------
// VUELTO en pago dividido (tender efectivo): pagaCon cubre el efectivo aplicado
// ---------------------------------------------------------------------------
test("vuelto: efectivo aplicado $5.500, paga con $10.000 → vuelto $4.500 (válido)", () => {
  const r = calcularVueltoEfectivo(10000, 5500);
  assert.equal(r.valido, true);
  assert.equal(r.vuelto, 4500);
});
test("vuelto: paga con menor al efectivo aplicado → inválido", () => {
  assert.equal(calcularVueltoEfectivo(5499, 5500).valido, false);
  assert.equal(calcularVueltoEfectivo(0, 5500).valido, false);
});
test("vuelto: paga con exacto → vuelto 0, válido", () => {
  assert.deepEqual(calcularVueltoEfectivo(5500, 5500), { valido: true, vuelto: 0 });
});
test("vuelto: entradas inválidas → no válido, vuelto 0", () => {
  assert.equal(calcularVueltoEfectivo("x", 5500).valido, false);
  assert.equal(calcularVueltoEfectivo(10000, -1).valido, false);
});
