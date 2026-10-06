// Candados de la capacidad `ventas_resumen`: el período, la zona horaria, la
// forma de la respuesta y que la consulta sea la del reporte del ERP.
//
// Las ventas de los fixtures tienen la forma de `SELECT_RESUMEN_VENTA` con los
// valores que escribe `/api/pos-ventas/crear`: `formaPago` en minúscula o
// "mixto", `esFiado` derivado del tender, un `VentaPago` por medio. Es la forma
// que devolvió la base en `scripts/pruebas-db/azulChatVentasResumen.mjs`, que
// además compara todo esto contra el handler real del reporte en PostgreSQL.
//
// Correr con: node --import ./scripts/alias-loader.mjs --test lib/integraciones/azul-chat/ventasResumen.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolverPeriodo, armarVentasResumen, ventasResumen, MAX_DIAS_RANGO } from "./ventasResumen.js";
import { whereVentasDelPeriodo, SELECT_RESUMEN_VENTA } from "../../reportes-ventas/resumenVentas.js";

// 2026-10-06 02:30 UTC = 2026-10-05 23:30 en Argentina: el día que se lee en
// UTC y el argentino son distintos, así que un error de zona se ve.
const NOCHE = Date.parse("2026-10-06T02:30:00.000Z");
const MEDIODIA = Date.parse("2026-10-06T15:00:00.000Z");

const venta = (total, pagos, extra = {}) => ({
  id: 1,
  total: String(total),
  subtotal: String(total),
  descuento: "0",
  comisionBancaria: "0",
  netoRecibido: String(total),
  comisionPendiente: false,
  costoTotal: "0",
  gananciaBruta: "0",
  gananciaNeta: "0",
  formaPago: pagos.length > 1 ? "mixto" : pagos[0].medio.toLowerCase(),
  esFiado: pagos.some((p) => p.medio === "FIADO"),
  pagos: pagos.map((p) => ({ medio: p.medio, monto: String(p.monto), comision: "0", neto: String(p.monto) })),
  ...extra,
});
const LOCAL = { id: 10, nombre: "Local A", activo: true };
const armar = (ventas, periodo = { tipo: "ayer", desde: "2026-10-05", hasta: "2026-10-05" }, hoy = "2026-10-06", local = LOCAL) =>
  armarVentasResumen({ local, grupoId: 1, periodo, hoy, ventas });

// ── Período y zona horaria ─────────────────────────────────────────────────

test("6. hoy y ayer son días ARGENTINOS, no del reloj UTC", () => {
  const hoy = resolverPeriodo({ tipo: "hoy" }, { ahora: NOCHE });
  assert.deepEqual(hoy.periodo, { tipo: "hoy", desde: "2026-10-05", hasta: "2026-10-05" });
  const ayer = resolverPeriodo({ tipo: "ayer" }, { ahora: NOCHE });
  assert.deepEqual(ayer.periodo, { tipo: "ayer", desde: "2026-10-04", hasta: "2026-10-04" });
});

test("6b. el where del período es el del reporte: de 00:00 a 23:59:59.999 en Argentina", () => {
  const w = whereVentasDelPeriodo({ fechaDesde: "2026-10-05", fechaHasta: "2026-10-05", localId: 10 });
  assert.equal(w.fecha.gte.toISOString(), "2026-10-05T03:00:00.000Z");
  assert.equal(w.fecha.lte.toISOString(), "2026-10-06T02:59:59.999Z");
});

test("6c. ayer cruza bien el cambio de mes", () => {
  const r = resolverPeriodo({ tipo: "ayer" }, { ahora: Date.parse("2026-11-01T12:00:00.000Z") });
  assert.deepEqual([r.periodo.desde, r.periodo.hasta], ["2026-10-31", "2026-10-31"]);
});

test("un rango explícito razonable se acepta tal cual", () => {
  const r = resolverPeriodo({ tipo: "rango", desde: "2026-09-06", hasta: "2026-10-06" }, { ahora: MEDIODIA });
  assert.equal(r.ok, true);
  assert.deepEqual(r.periodo, { tipo: "rango", desde: "2026-09-06", hasta: "2026-10-06" });
});

test("el rango no puede pasar de MAX_DIAS_RANGO días", () => {
  assert.equal(MAX_DIAS_RANGO, 31);
  const r = resolverPeriodo({ tipo: "rango", desde: "2026-09-05", hasta: "2026-10-06" }, { ahora: MEDIODIA });
  assert.equal(r.codigo, "PERIODO_DEMASIADO_LARGO");
});

test("el rango no termina en el futuro argentino, ni empieza después de terminar", () => {
  // A las 23:30 del 05 en Argentina, el 06 todavía es futuro aunque en UTC ya sea hoy.
  assert.equal(resolverPeriodo({ tipo: "rango", desde: "2026-10-05", hasta: "2026-10-06" }, { ahora: NOCHE }).ok, false);
  assert.equal(resolverPeriodo({ tipo: "rango", desde: "2026-10-03", hasta: "2026-10-02" }, { ahora: MEDIODIA }).ok, false);
});

test("fechas que no existen o con otro formato se rechazan", () => {
  for (const [desde, hasta] of [["2026-02-30", "2026-03-01"], ["2026-10-1", "2026-10-02"], ["2026-10-01T00:00", "2026-10-02"], [20261001, "2026-10-02"]]) {
    assert.equal(resolverPeriodo({ tipo: "rango", desde, hasta }, { ahora: MEDIODIA }).codigo, "PERIODO_INVALIDO", `${desde}..${hasta}`);
  }
});

test("un período desconocido, ausente o con claves de más se rechaza", () => {
  for (const p of [undefined, null, "hoy", [], { tipo: "semana" }, { tipo: "hoy", desde: "2026-01-01" }, { tipo: "rango", desde: "2026-10-01", hasta: "2026-10-02", localId: 3 }]) {
    assert.equal(resolverPeriodo(p, { ahora: MEDIODIA }).ok, false, JSON.stringify(p));
  }
});

// ── La respuesta ───────────────────────────────────────────────────────────

test("4. un pago mixto se reparte entre sus medios", () => {
  const d = armar([venta(2000, [{ medio: "EFECTIVO", monto: 500 }, { medio: "DEBITO", monto: 1500 }])]);
  assert.equal(d.cantidadVentas, 1);
  assert.equal(d.totalVendido, "2000.00");
  assert.deepEqual(d.mediosDePago, [
    { medio: "EFECTIVO", etiqueta: "Efectivo", total: "500.00", cantidadPagos: 1 },
    { medio: "DEBITO", etiqueta: "Débito", total: "1500.00", cantidadPagos: 1 },
  ]);
});

test("5. FIADO es venta pero no efectivo: va a su propio medio", () => {
  const d = armar([venta(1000, [{ medio: "FIADO", monto: 1000 }]), venta(300, [{ medio: "EFECTIVO", monto: 300 }])]);
  assert.equal(d.totalVendido, "1300.00");
  assert.deepEqual(d.mediosDePago.map((m) => [m.medio, m.total]), [["EFECTIVO", "300.00"], ["FIADO", "1000.00"]]);
});

test("los medios salen en el orden del ERP, no en el de llegada", () => {
  const d = armar([
    venta(10, [{ medio: "FIADO", monto: 10 }]),
    venta(20, [{ medio: "MERCADOPAGO", monto: 20 }]),
    venta(30, [{ medio: "CREDITO", monto: 30 }]),
    venta(40, [{ medio: "EFECTIVO", monto: 40 }]),
  ]);
  assert.deepEqual(d.mediosDePago.map((m) => m.medio), ["EFECTIVO", "CREDITO", "MERCADOPAGO", "FIADO"]);
});

test("sin ventas: cero, sin medios, y no se inventa nada", () => {
  const d = armar([]);
  assert.equal(d.cantidadVentas, 0);
  assert.equal(d.totalVendido, "0.00");
  assert.deepEqual(d.mediosDePago, []);
  assert.deepEqual(d.advertencias, []);
});

test("el contrato tiene exactamente estas claves: sin productos, comisiones, neto ni ganancia", () => {
  const d = armar([venta(100, [{ medio: "EFECTIVO", monto: 100 }])]);
  assert.deepEqual(Object.keys(d).sort(), [
    "advertencias", "cantidadVentas", "capacidad", "grupoId", "local", "mediosDePago", "periodo", "totalVendido", "version",
  ]);
  assert.deepEqual(Object.keys(d.local).sort(), ["id", "nombre"]);
  assert.deepEqual(d.periodo, { tipo: "ayer", desde: "2026-10-05", hasta: "2026-10-05", zonaHoraria: "America/Argentina/Cordoba" });
  assert.deepEqual(Object.keys(d.mediosDePago[0]).sort(), ["cantidadPagos", "etiqueta", "medio", "total"]);
});

test("advertencia DIA_EN_CURSO solo si el período toca hoy", () => {
  const conHoy = armar([], { tipo: "hoy", desde: "2026-10-06", hasta: "2026-10-06" }, "2026-10-06");
  assert.deepEqual(conHoy.advertencias.map((a) => a.codigo), ["DIA_EN_CURSO"]);
  assert.deepEqual(armar([]).advertencias, []);
});

test("advertencia LOCAL_INACTIVO cuando el ERP marca el local inactivo", () => {
  const d = armar([], undefined, undefined, { ...LOCAL, activo: false });
  assert.deepEqual(d.advertencias.map((a) => a.codigo), ["LOCAL_INACTIVO"]);
});

test("advertencia DESGLOSE_NO_CUADRA: se dice, no se corrige", () => {
  // FIXTURE INCONSISTENTE A PROPÓSITO: `crear` exige Σ pagos == total en
  // centavos, así que una venta nueva no llega así. Esta advertencia es un
  // cable trampa para un invariante roto —una fila tocada a mano, una migración
  // vieja— y por eso se ejerce con una fila que no cumple.
  const rota = venta(1000, [{ medio: "EFECTIVO", monto: 900 }]);
  const d = armar([rota]);
  assert.equal(d.totalVendido, "1000.00");
  assert.deepEqual(d.mediosDePago.map((m) => m.total), ["900.00"]);
  assert.deepEqual(d.advertencias.map((a) => a.codigo), ["DESGLOSE_NO_CUADRA"]);
});

// ── La consulta ────────────────────────────────────────────────────────────

test("1. la consulta es la del reporte: mismo where comercial, mismo select, sin detalles", async () => {
  const llamadas = [];
  const db = {
    local: { findUnique: async (args) => (llamadas.push(["local", args]), LOCAL) },
    venta: { findMany: async (args) => (llamadas.push(["venta", args]), [venta(100, [{ medio: "EFECTIVO", monto: 100 }])]) },
  };
  const r = await ventasResumen({ localId: 10, grupoId: 1 }, { periodo: { tipo: "hoy" } }, { db, ahora: NOCHE });
  assert.equal(r.ok, true);
  const [, args] = llamadas.find(([q]) => q === "venta");
  assert.deepEqual(args.where, whereVentasDelPeriodo({ fechaDesde: "2026-10-05", fechaHasta: "2026-10-05", localId: 10 }));
  assert.deepEqual(args.where.transferencia, { is: null }, "2. las internas no entran");
  assert.equal(args.where.anuladaEn, null, "3. las anuladas no entran");
  assert.equal(args.select, SELECT_RESUMEN_VENTA);
  assert.equal("detalles" in args.select, false);
});

test("el local de la consulta sale de la autorización, y un período malo no consulta nada", async () => {
  let consultas = 0;
  const db = { local: { findUnique: async () => (consultas++, LOCAL) }, venta: { findMany: async () => (consultas++, []) } };
  const r = await ventasResumen({ localId: 10, grupoId: 1 }, { periodo: { tipo: "semana" } }, { db, ahora: MEDIODIA });
  assert.equal(r.codigo, "PERIODO_INVALIDO");
  assert.equal(consultas, 0);
});
