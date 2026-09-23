// CANDADO: EL PAGO AL PROVEEDOR AL CERRAR LA COMPRA, la regla pura.
//
//   node --import ./scripts/alias-loader.mjs --test lib/compras-proveedor/pagoDelCierre.test.mjs
//
// La deuda, el pago inicial y lo que la hoja deja confirmar. Lo que necesita
// base —la transacción, el stock, la caja, los permisos contra la ruta— está en
// `scripts/pruebas-db/finanzas.mjs`, contra PostgreSQL.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ERROR_FALTA_ORIGEN,
  ERROR_FALTA_TOTAL,
  ERROR_FALTA_TURNO,
  ERROR_PAGADA_NO_CUBRE,
  ERROR_PARCIAL_FUERA_DE_RANGO,
  ERROR_TOTAL_DISTINTO_DE_LA_FACTURA,
  ERROR_TOTAL_NO_CONFIRMADO,
  ERROR_ESTADO_PAGO,
  estadoSacaPlata,
  pagoDelCierreEnPantalla,
  planDelPagoInicial,
  resolverTotalDelCierre,
  totalDeLasFacturasDelCierre,
} from "@/lib/compras-proveedor/pagoDelCierre";

// ── EL TOTAL ES EL DE LA FACTURA ────────────────────────────────────────

test("una factura de $485.300: la deuda es $485.300", () => {
  assert.deepEqual(resolverTotalDelCierre({ totales: ["485300.00"] }), {
    centavos: 48530000,
    desdeLaFactura: true,
  });
});

test("la percepción está en la deuda: productos $480.000, factura $511.968,28", () => {
  // Lo que valen los productos no entra en esta cuenta: la función ni lo recibe.
  const r = resolverTotalDelCierre({ totales: [511968.28] });
  assert.equal(r.centavos, 51196828);
});

test("varias facturas: la deuda es la suma de sus totales impresos", () => {
  const r = resolverTotalDelCierre({ totales: ["300000.10", "185300.20", 26668] });
  assert.equal(r.centavos, 51196830);
});

test("si UNA factura no trae total, no se suma lo que hay: se pide el total", () => {
  const facturas = totalDeLasFacturasDelCierre([300000, null]);
  assert.equal(facturas.completo, false);
  assert.equal(facturas.total, null);
  assert.equal(facturas.sumaConocida, 300000, "lo conocido se ofrece como ayuda");
  assert.deepEqual(resolverTotalDelCierre({ totales: [300000, null] }), {
    error: ERROR_FALTA_TOTAL,
    pideTotal: true,
  });
});

test("sin ningún comprobante también se pide el total", () => {
  assert.equal(resolverTotalDelCierre({ totales: [] }).pideTotal, true);
});

test("el total escrito vale solo CONFIRMADO", () => {
  assert.deepEqual(resolverTotalDelCierre({ totales: [null], totalConfirmado: "511.968,28" }), {
    error: ERROR_TOTAL_NO_CONFIRMADO,
    pideTotal: true,
  });
  assert.deepEqual(
    resolverTotalDelCierre({ totales: [null], totalConfirmado: "511.968,28", confirmado: true }),
    { centavos: 51196828, desdeLaFactura: false }
  );
});

test("con total impreso, uno escrito distinto frena en vez de pisarlo", () => {
  assert.deepEqual(
    resolverTotalDelCierre({ totales: [485300], totalConfirmado: 480000, confirmado: true }),
    { error: ERROR_TOTAL_DISTINTO_DE_LA_FACTURA, pideTotal: false }
  );
});

// ── EL PAGO INICIAL ─────────────────────────────────────────────────────

const TOTAL = 48530000;

test("PENDIENTE: no hay pago inicial", () => {
  assert.deepEqual(planDelPagoInicial({ estado: "PENDIENTE", totalCentavos: TOTAL }), {
    pagoInicial: null,
  });
});

test("PARCIAL $300.000 por transferencia", () => {
  assert.deepEqual(
    planDelPagoInicial({
      estado: "PARCIAL",
      totalCentavos: TOTAL,
      pago: { monto: "300.000", medio: "TRANSFERENCIA" },
    }),
    { pagoInicial: { monto: 300000, medio: "TRANSFERENCIA", turnoId: null } }
  );
});

test("PARCIAL exige más de cero y menos del total", () => {
  for (const monto of [0, -1, "", null, 485300, 485300.01]) {
    assert.deepEqual(
      planDelPagoInicial({ estado: "PARCIAL", totalCentavos: TOTAL, pago: { monto, medio: "OTRO" } }),
      { error: ERROR_PARCIAL_FUERA_DE_RANGO },
      `monto ${String(monto)}`
    );
  }
});

test("PAGADA cubre el total completo, y un monto distinto se rechaza", () => {
  assert.equal(
    planDelPagoInicial({ estado: "PAGADA", totalCentavos: TOTAL, pago: { medio: "EFECTIVO", turnoId: 7 } })
      .pagoInicial.monto,
    485300
  );
  assert.deepEqual(
    planDelPagoInicial({ estado: "PAGADA", totalCentavos: TOTAL, pago: { monto: 1, medio: "OTRO" } }),
    { error: ERROR_PAGADA_NO_CUBRE }
  );
});

test("sin estado elegido no se cierra", () => {
  assert.deepEqual(planDelPagoInicial({ estado: null, totalCentavos: TOTAL }), {
    error: ERROR_ESTADO_PAGO,
  });
});

test("solo pagada y parcial sacan plata", () => {
  assert.equal(estadoSacaPlata("PAGADA"), true);
  assert.equal(estadoSacaPlata("PARCIAL"), true);
  assert.equal(estadoSacaPlata("PENDIENTE"), false);
  assert.equal(estadoSacaPlata(undefined), false);
});

// ── LO QUE LA HOJA DEJA CONFIRMAR ───────────────────────────────────────

test("la hoja muestra saldo completo en PENDIENTE y deja confirmar", () => {
  const r = pagoDelCierreEnPantalla({ totales: [485300], estado: "PENDIENTE" });
  assert.equal(r.listo, true);
  assert.equal(r.saldo, 485300);
});

test("la hoja calcula el saldo restante de un parcial", () => {
  const r = pagoDelCierreEnPantalla({
    totales: [485300],
    estado: "PARCIAL",
    pago: { monto: "300000", medio: "TRANSFERENCIA", localOrigenId: "3" },
  });
  assert.equal(r.listo, true);
  assert.equal(r.saldo, 185300);
});

test("la hoja no deja pagar sin origen, ni efectivo sin turno", () => {
  assert.equal(
    pagoDelCierreEnPantalla({ totales: [485300], estado: "PAGADA", pago: { medio: "TRANSFERENCIA" } }).error,
    ERROR_FALTA_ORIGEN
  );
  assert.equal(
    pagoDelCierreEnPantalla({
      totales: [485300],
      estado: "PAGADA",
      pago: { medio: "EFECTIVO", localOrigenId: "3" },
    }).error,
    ERROR_FALTA_TURNO
  );
});

test("sin total impreso, la hoja no deja confirmar hasta confirmar el total", () => {
  const sinConfirmar = pagoDelCierreEnPantalla({
    totales: [null],
    totalEscrito: "511.968,28",
    estado: "PENDIENTE",
  });
  assert.equal(sinConfirmar.listo, false);
  assert.equal(sinConfirmar.pideTotal, true);
  assert.equal(sinConfirmar.total, 511968.28, "lo escrito se muestra aunque no esté confirmado");
  const confirmado = pagoDelCierreEnPantalla({
    totales: [null],
    totalEscrito: "511.968,28",
    totalConfirmado: true,
    estado: "PENDIENTE",
  });
  assert.equal(confirmado.listo, true);
  assert.equal(confirmado.saldo, 511968.28);
});
