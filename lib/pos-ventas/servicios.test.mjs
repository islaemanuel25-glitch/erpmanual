// Tests puros del subsistema de SERVICIOS DE IMPORTE VARIABLE.
// node --test lib/pos-ventas/servicios.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  validarImporteServicio,
  validarRecargoServicioPct,
  resolverRecargoServicioPct,
  calcularServicio,
  sumarTotalServicios,
  minimoEfectivoRequerido,
  validarCoberturaEfectivo,
  hayTenderFiado,
  esProductoServicio,
  esModalidadServicio,
  snapshotServicioTicket,
  IMPORTE_SERVICIO_MIN,
  IMPORTE_SERVICIO_MAX,
} from "./servicios.js";

// ----------------------------- CÁLCULO -----------------------------
test("colectivo $5.000, 0% → final 5000, costo 5000, ganancia 0", () => {
  const c = calcularServicio(5000, 0);
  assert.equal(c.precioFinal, 5000);
  assert.equal(c.precioCosto, 5000);
  assert.equal(c.ganancia, 0);
  assert.equal(c.recargoImporte, 0);
  assert.equal(c.cantidad, 1);
});

test("celular $5.000, 10% → recargo 500, final 5500, costo 5000, ganancia 500", () => {
  const c = calcularServicio(5000, 10);
  assert.equal(c.recargoImporte, 500);
  assert.equal(c.precioFinal, 5500);
  assert.equal(c.precioCosto, 5000);
  assert.equal(c.ganancia, 500);
  assert.equal(c.cantidad, 1);
});

test("override de ProductoLocal tiene prioridad sobre el default de base", () => {
  assert.equal(resolverRecargoServicioPct(15, 10), 15);
});

test("sin override usa el default de ProductoBase", () => {
  assert.equal(resolverRecargoServicioPct(null, 10), 10);
  assert.equal(resolverRecargoServicioPct(undefined, 8), 8);
  assert.equal(resolverRecargoServicioPct("", 8), 8);
});

test("sin override ni default → 0", () => {
  assert.equal(resolverRecargoServicioPct(null, null), 0);
  assert.equal(resolverRecargoServicioPct(undefined, undefined), 0);
});

test("override 0 explícito gana sobre default (0 es válido, no null)", () => {
  assert.equal(resolverRecargoServicioPct(0, 10), 0);
});

test("porcentaje fuera de rango en config cae a 0 (fail-safe)", () => {
  assert.equal(resolverRecargoServicioPct(150, null), 0);
  assert.equal(resolverRecargoServicioPct(-5, null), 0);
});

test("porcentaje decimal produce recargo redondeado a 2 decimales", () => {
  // 5000 * 7.5% = 375.00
  assert.equal(calcularServicio(5000, 7.5).recargoImporte, 375);
  // 3333 * 3.33% = 110.9889 → 110.99
  assert.equal(calcularServicio(3333, 3.33).recargoImporte, 110.99);
  assert.equal(calcularServicio(3333, 3.33).precioFinal, 3443.99);
});

// ----------------------------- IMPORTE -----------------------------
test("importe $100 válido (mínimo)", () => {
  assert.equal(validarImporteServicio(IMPORTE_SERVICIO_MIN).valido, true);
});
test("importe $500.000 válido (máximo)", () => {
  assert.equal(validarImporteServicio(IMPORTE_SERVICIO_MAX).valido, true);
});
test("importe $99 inválido (bajo el mínimo)", () => {
  assert.equal(validarImporteServicio(99).valido, false);
});
test("importe $500.001 inválido (sobre el máximo)", () => {
  assert.equal(validarImporteServicio(500001).valido, false);
});
test("importe 0 inválido", () => {
  assert.equal(validarImporteServicio(0).valido, false);
});
test("importe negativo inválido", () => {
  assert.equal(validarImporteServicio(-100).valido, false);
});
test("importe decimal inválido", () => {
  assert.equal(validarImporteServicio(100.5).valido, false);
  assert.equal(validarImporteServicio("100.5").valido, false);
});
test("importe texto inválido", () => {
  assert.equal(validarImporteServicio("abc").valido, false);
  assert.equal(validarImporteServicio("1e3").valido, false);
});
test("importe NaN e Infinity inválidos", () => {
  assert.equal(validarImporteServicio(NaN).valido, false);
  assert.equal(validarImporteServicio(Infinity).valido, false);
  assert.equal(validarImporteServicio(-Infinity).valido, false);
});
test("importe null/undefined/objeto/bool inválidos", () => {
  assert.equal(validarImporteServicio(null).valido, false);
  assert.equal(validarImporteServicio(undefined).valido, false);
  assert.equal(validarImporteServicio({}).valido, false);
  assert.equal(validarImporteServicio(true).valido, false);
  assert.equal(validarImporteServicio("").valido, false);
});
test("importe string entero válido se coacciona", () => {
  const r = validarImporteServicio("5000");
  assert.equal(r.valido, true);
  assert.equal(r.importe, 5000);
});

test("validarRecargoServicioPct: rango y decimales", () => {
  assert.equal(validarRecargoServicioPct(10).valido, true);
  assert.equal(validarRecargoServicioPct(0).valido, true);
  assert.equal(validarRecargoServicioPct(100).valido, true);
  assert.equal(validarRecargoServicioPct(100.01).valido, false);
  assert.equal(validarRecargoServicioPct(-1).valido, false);
  assert.equal(validarRecargoServicioPct(7.555).valido, false); // >2 decimales
  assert.equal(validarRecargoServicioPct(null).valido, true); // ausente = sin override
});

// ----------------------------- MODALIDAD -----------------------------
test("detección de modalidad servicio", () => {
  assert.equal(esModalidadServicio("IMPORTE_VARIABLE"), true);
  assert.equal(esModalidadServicio("NORMAL"), false);
  assert.equal(esProductoServicio({ modalidad: "IMPORTE_VARIABLE" }), true);
  assert.equal(esProductoServicio({ modalidad: "NORMAL" }), false);
  assert.equal(esProductoServicio({}), false);
});

// ----------------------- COBERTURA EN EFECTIVO -----------------------
const S = (precio) => ({ esServicio: true, precio });
const M = (precio) => ({ esServicio: false, precio }); // mercadería

test("suma total de servicios ignora mercadería", () => {
  assert.equal(sumarTotalServicios([S(5500), M(12000)]), 5500);
  assert.equal(minimoEfectivoRequerido([S(5500), M(12000)]), 5500);
});

test("varios servicios: mínimo efectivo = suma de todos", () => {
  assert.equal(sumarTotalServicios([S(5000), S(3000), M(2000)]), 8000);
});

// Venta: servicio 5500 + mercadería 12000 = 17500
test("5500 efectivo + 12000 débito → cubre servicios (válido)", () => {
  const r = validarCoberturaEfectivo(5500, [
    { medio: "EFECTIVO", monto: 5500 },
    { medio: "DEBITO", monto: 12000 },
  ]);
  assert.equal(r.valido, true);
  assert.equal(r.minEfectivo, 5500);
});

test("10000 efectivo + 7500 débito → cubre servicios (válido)", () => {
  const r = validarCoberturaEfectivo(5500, [
    { medio: "EFECTIVO", monto: 10000 },
    { medio: "DEBITO", monto: 7500 },
  ]);
  assert.equal(r.valido, true);
});

test("17500 todo efectivo → válido", () => {
  const r = validarCoberturaEfectivo(5500, [{ medio: "EFECTIVO", monto: 17500 }]);
  assert.equal(r.valido, true);
});

test("5499 efectivo + 12001 débito → NO cubre servicios (inválido)", () => {
  const r = validarCoberturaEfectivo(5500, [
    { medio: "EFECTIVO", monto: 5499 },
    { medio: "DEBITO", monto: 12001 },
  ]);
  assert.equal(r.valido, false);
  assert.equal(r.faltante, 1);
});

test("todo en débito (0 efectivo) → inválido", () => {
  const r = validarCoberturaEfectivo(5500, [{ medio: "DEBITO", monto: 17500 }]);
  assert.equal(r.valido, false);
});

test("solo servicio $5.500, todo efectivo → válido", () => {
  const r = validarCoberturaEfectivo(5500, [{ medio: "EFECTIVO", monto: 5500 }]);
  assert.equal(r.valido, true);
});

test("solo servicio, efectivo parcial + digital → inválido", () => {
  const r = validarCoberturaEfectivo(5500, [
    { medio: "EFECTIVO", monto: 3000 },
    { medio: "DEBITO", monto: 2500 },
  ]);
  assert.equal(r.valido, false);
});

test("comparación en centavos: sin falsos negativos por floats", () => {
  const r = validarCoberturaEfectivo(0.3, [{ medio: "EFECTIVO", monto: 0.1 + 0.2 }]);
  assert.equal(r.valido, true);
});

test("hayTenderFiado detecta FIADO", () => {
  assert.equal(hayTenderFiado([{ medio: "FIADO", monto: 100 }]), true);
  assert.equal(hayTenderFiado([{ medio: "EFECTIVO", monto: 100 }]), false);
});

// --------------------------- TICKET SNAPSHOT ---------------------------
test("snapshot ticket carga virtual muestra recargo", () => {
  const s = snapshotServicioTicket({
    nombre: "Carga virtual",
    importeBaseServicio: 5000,
    recargoServicioPct: 10,
    recargoServicioImporte: 500,
    precio: 5500,
  });
  assert.equal(s.importeBase, 5000);
  assert.equal(s.recargoImporte, 500);
  assert.equal(s.total, 5500);
  assert.equal(s.mostrarRecargo, true);
});

test("snapshot ticket colectivo 0% no muestra recargo", () => {
  const s = snapshotServicioTicket({
    nombre: "Carga colectivo",
    importeBaseServicio: 5000,
    recargoServicioPct: 0,
    recargoServicioImporte: 0,
    precio: 5000,
  });
  assert.equal(s.total, 5000);
  assert.equal(s.mostrarRecargo, false);
});
