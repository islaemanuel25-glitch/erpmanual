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
  componerCobroSimple,
  evaluarDivisionPago,
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

// ------------------- COMPOSICIÓN DE COBRO SIMPLE -------------------
test("solo servicios: efectivo por el total", () => {
  const r = componerCobroSimple({ medio: "efectivo", total: 25000, minEfectivoServicios: 25000 });
  assert.deepEqual(r, { formaPago: "efectivo", total: 25000 });
  assert.equal(r.pagos, undefined); // parent abre modal por el total
});

test("venta normal efectivo: un tender efectivo por el total", () => {
  const r = componerCobroSimple({ medio: "efectivo", total: 10000, minEfectivoServicios: 0 });
  assert.deepEqual(r, { formaPago: "efectivo", total: 10000 });
});

test("venta normal débito: un tender débito por el total (directo)", () => {
  const r = componerCobroSimple({ medio: "debito", total: 10000, minEfectivoServicios: 0 });
  assert.deepEqual(r, { formaPago: "debito", total: 10000 });
});

test("venta normal fiado: un tender fiado por el total", () => {
  const r = componerCobroSimple({ medio: "fiado", total: 10000, minEfectivoServicios: 0 });
  assert.deepEqual(r, { formaPago: "fiado", total: 10000 });
});

test("mixto servicio+mercadería con débito: efectivo 5500 + débito 12000", () => {
  const r = componerCobroSimple({ medio: "debito", total: 17500, minEfectivoServicios: 5500 });
  assert.equal(r.formaPago, "mixto");
  assert.equal(r.total, 17500);
  assert.deepEqual(r.pagos, [
    { medio: "efectivo", monto: 5500 },
    { medio: "debito", monto: 12000 },
  ]);
});

test("mixto con crédito: efectivo 5500 + crédito 12000", () => {
  const r = componerCobroSimple({ medio: "credito", total: 17500, minEfectivoServicios: 5500 });
  assert.deepEqual(r.pagos, [
    { medio: "efectivo", monto: 5500 },
    { medio: "credito", monto: 12000 },
  ]);
});

test("mixto con mercadopago: efectivo 5500 + mp 12000", () => {
  const r = componerCobroSimple({ medio: "mercadopago", total: 17500, minEfectivoServicios: 5500 });
  assert.deepEqual(r.pagos, [
    { medio: "efectivo", monto: 5500 },
    { medio: "mercadopago", monto: 12000 },
  ]);
});

test("servicio+mercadería con efectivo: un tender efectivo por el total (sin split)", () => {
  const r = componerCobroSimple({ medio: "efectivo", total: 17500, minEfectivoServicios: 5500 });
  assert.deepEqual(r, { formaPago: "efectivo", total: 17500 });
});

test("digital con resto 0 (todo servicio) cae a efectivo", () => {
  const r = componerCobroSimple({ medio: "debito", total: 25000, minEfectivoServicios: 25000 });
  assert.deepEqual(r, { formaPago: "efectivo", total: 25000 });
});

test("composición usa centavos exactos (sin floats)", () => {
  const r = componerCobroSimple({ medio: "debito", total: 17500.55, minEfectivoServicios: 5500.55 });
  assert.equal(r.pagos[0].monto + r.pagos[1].monto, 17500.55);
});

// ------------------- DIVIDIR PAGO (editor de filas) -------------------
const F = (medio, monto) => ({ medio, monto });

test("dividir: efectivo 20000 + débito 14500 = 34500 → válido, exacto", () => {
  const d = evaluarDivisionPago({ filas: [F("efectivo", 20000), F("debito", 14500)], total: 34500 });
  assert.equal(d.puedeCobrar, true);
  assert.equal(d.estado, "exacto");
  assert.equal(d.restante, 0);
});

test("dividir: efectivo 10000 + débito 20000 → restante 4500, no cobra", () => {
  const d = evaluarDivisionPago({ filas: [F("efectivo", 10000), F("debito", 20000)], total: 34500 });
  assert.equal(d.estado, "falta");
  assert.equal(d.restante, 4500);
  assert.equal(d.puedeCobrar, false);
});

test("dividir: efectivo 20000 + débito 20000 → excedente 5500, no cobra", () => {
  const d = evaluarDivisionPago({ filas: [F("efectivo", 20000), F("debito", 20000)], total: 34500 });
  assert.equal(d.estado, "excedente");
  assert.equal(d.excedente, 5500);
  assert.equal(d.puedeCobrar, false);
});

test("dividir: tercer medio (efectivo+débito+crédito) suma exacta → válido", () => {
  const d = evaluarDivisionPago({ filas: [F("efectivo", 10000), F("debito", 14500), F("credito", 10000)], total: 34500 });
  assert.equal(d.puedeCobrar, true);
  assert.equal(d.pagos.length, 3);
});

test("dividir: medio duplicado bloquea el cobro", () => {
  const d = evaluarDivisionPago({ filas: [F("debito", 10000), F("debito", 24500)], total: 34500 });
  assert.equal(d.hayDuplicados, true);
  assert.equal(d.puedeCobrar, false);
});

test("dividir: monto 0 / vacío / negativo / NaN invalida", () => {
  assert.equal(evaluarDivisionPago({ filas: [F("efectivo", 0), F("debito", 34500)], total: 34500 }).puedeCobrar, false);
  assert.equal(evaluarDivisionPago({ filas: [F("efectivo", ""), F("debito", 34500)], total: 34500 }).montosValidos, false);
  assert.equal(evaluarDivisionPago({ filas: [F("efectivo", -100), F("debito", 34600)], total: 34500 }).puedeCobrar, false);
  assert.equal(evaluarDivisionPago({ filas: [F("efectivo", "abc"), F("debito", 34500)], total: 34500 }).montosValidos, false);
});

test("dividir: pagos usa el importe de la fila efectivo (no el paga con)", () => {
  const d = evaluarDivisionPago({ filas: [F("efectivo", 10000), F("debito", 24500)], total: 34500 });
  assert.deepEqual(d.pagos, [{ medio: "efectivo", monto: 10000 }, { medio: "debito", monto: 24500 }]);
  assert.equal(d.efectivo, 10000);
});

test("dividir con servicios: efectivo < mínimo bloquea", () => {
  const d = evaluarDivisionPago({ filas: [F("efectivo", 3000), F("debito", 14500)], total: 17500, minEfectivoServicios: 5500 });
  assert.equal(d.cumpleEfectivo, false);
  assert.equal(d.faltaEfectivo, 2500);
  assert.equal(d.puedeCobrar, false);
});

test("dividir con servicios: efectivo suficiente permite", () => {
  const d = evaluarDivisionPago({ filas: [F("efectivo", 5500), F("debito", 12000)], total: 17500, minEfectivoServicios: 5500 });
  assert.equal(d.cumpleEfectivo, true);
  assert.equal(d.puedeCobrar, true);
});

test("dividir: suma exacta en centavos (sin floats)", () => {
  const d = evaluarDivisionPago({ filas: [F("efectivo", 10.1), F("debito", 20.2)], total: 30.3 });
  assert.equal(d.estado, "exacto");
  assert.equal(d.puedeCobrar, true);
});
