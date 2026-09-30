// CANDADO: ¿POR QUÉ CAMBIÓ EL VALOR DEL STOCK?
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/explicacionDelValor.test.mjs
//
// El movimiento físico partido por el ORIGEN REAL de cada movimiento del Libro
// de Stock, y la identidad que tiene que cerrar al centavo:
//
//   Σ categorías = movimiento físico
//
// Los datos tienen la forma de las consultas: versiones de costo como las de
// `COLUMNAS_BASE`/`COLUMNAS_UBICACION`, cierres como `sqlCierresPorDia` y grupos
// como `sqlEfectosPorOrigen` (delta en milésimas, con signo). Contra PostgreSQL
// y con escrituras reales, en `scripts/pruebas-db/valorDelStock.mjs`, sección J.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";

import { ORIGEN_STOCK, ORIGEN_ACTIVACION, SIN_ORIGEN } from "./libroStock.js";
import {
  CATEGORIA,
  CATEGORIA_DEL_ORIGEN,
  DIRECCION,
  categoriaDelOrigen,
  explicacionDelMovimientoFisico,
  origenesDeLaCategoria,
  repartirMovimientoFisico,
} from "./explicacionDelValor.js";
import { cantidadesDeLaCadena, costoCongeladoPorDia, totalesDelValor, valorizarCadena } from "./valorDelStock.js";
import { explicacionApi } from "./stockDiarioApi.js";
import * as servidor from "./valorDelStockServer.js";

let version = 0;
const vBase = (dia, precioCosto, x = {}) => ({ version: String(++version), productoBaseId: 3, tipo: "CAMBIO", dia, precioCosto: String(precioCosto), unidadMedida: "unidad", factorPack: null, pesoReferenciaKg: null, pesoEsFijo: false, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", esCombo: false, ...x });
const vUbic = (dia, x = {}) => ({ version: String(++version), productoLocalId: 7, productoBaseId: 3, tipo: "PUNTO_CERO", dia, precioCosto: null, esDeposito: false, ...x });
const cierre = (dia, q, tipo = "CAMBIO") => ({ productoLocalId: 7, dia, tipo, cantidadPosterior: String(q) });
/** Un grupo de `sqlEfectosPorOrigen`: delta en unidades → milésimas, dirección por el signo. */
const g = (origen, delta, movimientos = 1) => ({ origen, direccion: delta > 0 ? DIRECCION.ENTRADA : DIRECCION.SALIDA, delta: Math.round(delta * 1000), movimientos });

/** Una cadena valorizada con sus movimientos por origen, por el camino real. */
function cadena({ dias, abre, cierres = [], efectos = {}, bases, ubicaciones = [vUbic("2026-09-01")] }) {
  const { cantidadAlAbrir, cierres: mapa } = cantidadesDeLaCadena({ alAbrir: abre === null ? null : { tipo: "CAMBIO", cantidadPosterior: String(abre) }, cierres });
  const costoDelDia = costoCongeladoPorDia({ ubicaciones, basesPorId: new Map([[3, bases]]) });
  return valorizarCadena({ dias, cantidadAlAbrir, cierres: mapa, costoDelDia, efectosPorDia: new Map(Object.entries(efectos)) });
}
const pesos = (c) => (c === null ? null : c / 100);
const explicar = (cadenas, dias) => totalesDelValor(cadenas.map((v, i) => ({ productoLocalId: i + 1, valor: v })), dias, { conExplicacion: true });
const categoria = (t, c) => t.explicacion.categorias.find((x) => x.categoria === c);
const D1 = "2026-10-05";
const D2 = "2026-10-06";

// ── LA TABLA ─────────────────────────────────────────────────────────────

test("cada origen del libro tiene categoría: uno nuevo sin clasificar acá pone este candado en rojo", () => {
  const todos = [...Object.values(ORIGEN_STOCK), ORIGEN_ACTIVACION, SIN_ORIGEN];
  assert.deepEqual(todos.filter((o) => !(o in CATEGORIA_DEL_ORIGEN)), []);
  assert.equal(categoriaDelOrigen(ORIGEN_STOCK.COMPRA_PROVEEDOR), CATEGORIA.COMPRAS);
  assert.equal(categoriaDelOrigen(SIN_ORIGEN), CATEGORIA.SIN_CLASIFICAR, "SIN_ORIGEN no se reclasifica");
  assert.equal(categoriaDelOrigen("UN_ORIGEN_NUEVO"), CATEGORIA.OTROS, "un origen sin etiqueta tiene origen: no es 'sin clasificar'");
  assert.deepEqual(origenesDeLaCategoria(CATEGORIA.TRANSFERENCIAS).sort(), ["TRANSFERENCIA_CANCELACION", "TRANSFERENCIA_ENVIO", "TRANSFERENCIA_RECEPCION"]);
});

// ── 1-7 · UN ORIGEN A LA VEZ ─────────────────────────────────────────────

test("1. compra: +24 u a $50 → Compras +$1.200", () => {
  const v = cadena({ dias: [D1], abre: 96, cierres: [cierre(D1, 120)], efectos: { [D1]: [g("COMPRA_PROVEEDOR", 24)] }, bases: [vBase("2026-09-01", "50.00")] });
  const t = explicar([v], [D1]);
  assert.equal(pesos(categoria(t, CATEGORIA.COMPRAS).neto), 1200);
  assert.equal(t.explicacion.cuadra, true);
});

test("2. venta: −3 u a $50 → Ventas −$150", () => {
  const t = explicar([cadena({ dias: [D1], abre: 18, cierres: [cierre(D1, 15)], efectos: { [D1]: [g("VENTA", -3)] }, bases: [vBase("2026-09-01", "50.00")] })], [D1]);
  assert.equal(pesos(categoria(t, CATEGORIA.VENTAS).neto), -150);
  assert.equal(pesos(categoria(t, CATEGORIA.VENTAS).salidas), -150);
});

test("3-4. transferencia enviada y recibida", () => {
  const env = cadena({ dias: [D1], abre: 60, cierres: [cierre(D1, 48)], efectos: { [D1]: [g("TRANSFERENCIA_ENVIO", -12)] }, bases: [vBase("2026-09-01", "100.00")] });
  const rec = cadena({ dias: [D1], abre: 0, cierres: [cierre(D1, 12)], efectos: { [D1]: [g("TRANSFERENCIA_RECEPCION", 12)] }, bases: [vBase("2026-09-01", "100.00")] });
  const t = explicar([env, rec], [D1]);
  const tr = categoria(t, CATEGORIA.TRANSFERENCIAS);
  assert.deepEqual([pesos(tr.entradas), pesos(tr.salidas), pesos(tr.neto)], [1200, -1200, 0]);
  assert.deepEqual([tr.movimientosDeEntrada, tr.movimientosDeSalida], [1, 1]);
});

test("5-6. ajuste positivo y negativo: la dirección sale del delta, no del origen", () => {
  const v = cadena({ dias: [D1], abre: 3, cierres: [cierre(D1, 4)], efectos: { [D1]: [g("AJUSTE_MANUAL", 2), g("AJUSTE_MANUAL", -1)] }, bases: [vBase("2026-09-01", "10000.00")] });
  const a = categoria(explicar([v], [D1]), CATEGORIA.AJUSTES);
  assert.deepEqual([pesos(a.entradas), pesos(a.salidas), pesos(a.neto)], [20000, -10000, 10000]);
});

test("7. SIN_ORIGEN: se muestra como 'Sin clasificar' con su cantidad y su efecto; no desaparece", () => {
  const t = explicar([cadena({ dias: [D1], abre: 120, cierres: [cierre(D1, 96)], efectos: { [D1]: [g(SIN_ORIGEN, -24)] }, bases: [vBase("2026-09-01", "100.00")] })], [D1]);
  assert.deepEqual([t.explicacion.sinClasificar.movimientos, pesos(t.explicacion.sinClasificar.efecto)], [1, -2400]);
  assert.equal(pesos(categoria(t, CATEGORIA.SIN_CLASIFICAR).neto), -2400);
});

// ── 8-11 · VARIOS ORÍGENES Y PERÍODOS ────────────────────────────────────

test("8. varias categorías el mismo día, con costos que no dividen justo, cierran al centavo", () => {
  // Pack x7 a $1.000: la unidad vale 142,857… Los redondeos no suman solos.
  const pack7 = { unidadMedida: "pack", factorPack: 7 };
  const v = cadena({
    dias: [D1],
    abre: 10,
    cierres: [cierre(D1, 18.001)],
    efectos: { [D1]: [g("COMPRA_PROVEEDOR", 13), g("VENTA", -4, 3), g("AJUSTE_MANUAL", -1), g(SIN_ORIGEN, 0.001)] },
    bases: [vBase("2026-09-01", "1000.00", pack7)],
    ubicaciones: [vUbic("2026-09-01", { esDeposito: true })],
  });
  const t = explicar([v], [D1]);
  const suma = t.explicacion.categorias.reduce((s, c) => s + c.neto, 0);
  assert.equal(suma, t.fisico, "las categorías no suman el movimiento físico");
  assert.equal(t.explicacion.cuadra, true);
  assert.ok(Math.abs(t.explicacion.desvioMaximoDeRedondeo) <= 2, `el redondeo repartido fue ${t.explicacion.desvioMaximoDeRedondeo}`);
});

test("9-11. semana, mes y rango: se suman los movimientos de cada día con el costo de ESE día, no los saldos", () => {
  const dias = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
  const cierres = [];
  const efectos = {};
  let q = 100;
  for (const [i, d] of dias.entries()) {
    const venta = -(i % 4) - 1;
    const compra = i % 7 === 0 ? 20 : 0;
    q += venta + compra;
    cierres.push(cierre(d, q));
    efectos[d] = [g("VENTA", venta, 2), ...(compra ? [g("COMPRA_PROVEEDOR", compra)] : [])];
  }
  const bases = [vBase("2026-09-01", "33.33"), vBase("2026-10-10", "41.17")];
  for (const n of [7, 30, 12]) {
    const t = explicar([cadena({ dias: dias.slice(0, n), abre: 100, cierres, efectos, bases })], dias.slice(0, n));
    assert.equal(t.explicacion.cuadra, true, `${n} días`);
    assert.equal(t.cuadra, true);
    assert.equal(categoria(t, CATEGORIA.VENTAS).movimientosDeSalida, n * 2);
  }
});

// ── 12-15 · LO QUE NO ES MOVIMIENTO FÍSICO ───────────────────────────────

test("12-13. CONTRAPRUEBA: un cambio de costo (intradía o entre días) es revalorización, nunca una compra o una venta", () => {
  // Ningún movimiento: el costo sube de $100 a $120 el 05 a la tarde.
  const v = cadena({ dias: [D1, D2], abre: 20, bases: [vBase("2026-09-01", "100.00"), vBase(D1, "120.00")] });
  const t = explicar([v], [D1, D2]);
  assert.equal(pesos(t.revalorizacion), 400);
  assert.equal(t.fisico, 0);
  assert.ok(t.explicacion.categorias.every((c) => c.neto === 0 && c.movimientos === 0), "la revalorización se coló como un origen");
});

test("14. la reexpresión por escala tampoco es un origen: queda en su componente", () => {
  const pack = (f) => ({ unidadMedida: "pack", factorPack: f });
  const v = cadena({ dias: [D1, D2], abre: 36, bases: [vBase("2026-09-01", "600.00", pack(6)), vBase(D1, "600.00", pack(12))], ubicaciones: [vUbic("2026-09-01", { esDeposito: true })] });
  const t = explicar([v], [D1, D2]);
  assert.equal(pesos(t.reexpresion), -1800);
  assert.equal(t.explicacion.total, 0);
});

test("15. el producto nacido en el día: su ALTA se explica con su origen y su costo de alta", () => {
  const alta = vUbic(D1, { tipo: "ALTA" });
  const bases = [vBase(D1, "500.00", { tipo: "ALTA" })];
  bases[0].version = String(Number(alta.version) - 1);
  const v = cadena({ dias: [D1], abre: null, cierres: [cierre(D1, 10, "ALTA")], efectos: { [D1]: [g("ALTA_PRODUCTO_DESDE_STOCK", 10)] }, bases, ubicaciones: [alta] });
  const t = explicar([v], [D1]);
  assert.equal(pesos(categoria(t, CATEGORIA.ALTAS_Y_BAJAS).neto), 5000);
  assert.equal(t.explicacion.cuadra, true);
});

// ── 16-17 · NEGATIVO Y TRÁNSITO ──────────────────────────────────────────

test("16. stock negativo: una venta que lo lleva abajo de cero se explica igual, con su signo", () => {
  const v = cadena({ dias: [D1], abre: 2, cierres: [cierre(D1, -3)], efectos: { [D1]: [g("VENTA", -5)] }, bases: [vBase("2026-09-01", "10.00")] });
  const t = explicar([v], [D1]);
  assert.equal(v.stockNegativo, true);
  assert.equal(pesos(categoria(t, CATEGORIA.VENTAS).neto), -50);
});

test("17. tránsito separado: la consulta descarta los movimientos con delta físico cero (los que solo cambian enTransito)", () => {
  const sql = servidor.sqlEfectosPorOrigen({ localId: 1, desde: D1, hasta: D2 }).sql;
  assert.match(sql, /coalesce\(m\."cantidadPosterior", 0\) - coalesce\(m\."cantidadAnterior", 0\)/);
  assert.match(sql, /WHERE x\."delta" <> 0/);
  assert.doesNotMatch(sql, /enTransito/, "el tránsito entró en el stock disponible");
});

// ── 18 · RECONCILIACIÓN Y SUS CONTRAPRUEBAS ──────────────────────────────

test("18. las dos identidades del período cierran al centavo", () => {
  const dias = [D1, D2];
  const a = cadena({ dias, abre: 7, cierres: [cierre(D1, 5), cierre(D2, 11)], efectos: { [D1]: [g("VENTA", -2)], [D2]: [g("COMPRA_PROVEEDOR", 6)] }, bases: [vBase("2026-09-01", "333.33"), vBase(D1, "341.07")] });
  const b = cadena({ dias, abre: 3.5, cierres: [cierre(D2, 1.25)], efectos: { [D2]: [g("TRANSFERENCIA_ENVIO", -2.25)] }, bases: [vBase("2026-09-01", "1234.56", { unidadMedida: "kg" })] });
  const t = explicar([a, b], dias);
  assert.equal(t.variacion, t.fisico + t.revalorizacion + t.reexpresion);
  assert.equal(t.explicacion.categorias.reduce((s, c) => s + c.neto, 0), t.fisico);
  assert.equal(explicacionApi(t.explicacion).total, t.fisico / 100);
});

test("CONTRAPRUEBA: si se saca una categoría de la suma, la reconciliación queda en rojo", () => {
  const v = cadena({ dias: [D1], abre: 10, cierres: [cierre(D1, 18)], efectos: { [D1]: [g("COMPRA_PROVEEDOR", 13), g("VENTA", -5)] }, bases: [vBase("2026-09-01", "100.00")] });
  const porOrigen = v.porOrigen;
  const sinVentas = new Map([...porOrigen].filter(([k]) => !k.startsWith("VENTA|")));
  const e = explicacionDelMovimientoFisico([sinVentas], v.fisico);
  assert.equal(e.cuadra, false, "la identidad no mira todas las categorías");
  assert.equal(explicacionDelMovimientoFisico([porOrigen], v.fisico).cuadra, true);
});

test("una cadena que no es continua (deltas que no suman cierre − apertura) se DELATA en el desvío, no se esconde", () => {
  const v = cadena({ dias: [D1], abre: 10, cierres: [cierre(D1, 18)], efectos: { [D1]: [g("COMPRA_PROVEEDOR", 9)] }, bases: [vBase("2026-09-01", "100.00")] });
  assert.equal(v.desvioMaximo, -10000, "le sobra una unidad de $100 a la explicación");
  assert.equal(explicar([v], [D1]).explicacion.cuadra, true, "la suma sigue cerrando: el desvío se informa aparte");
});

test("el reparto del redondeo: la suma de las partes es SIEMPRE el objetivo, y va al grupo más grande", () => {
  const r = repartirMovimientoFisico([g("VENTA", -1), g("VENTA", -1), g("COMPRA_PROVEEDOR", 3)], 1000 / 3, 33333);
  assert.equal(r.partes.reduce((s, p) => s + p.centavos, 0), 33333);
  const vacio = repartirMovimientoFisico([], 100, 500);
  assert.deepEqual([vacio.partes[0].origen, vacio.partes[0].centavos], [SIN_ORIGEN, 500], "un cambio sin movimiento no se inventa un origen");
});

// ── RENDIMIENTO ──────────────────────────────────────────────────────────

test("la explicación es UNA consulta agrupada más: el resumen sigue sin consultar por producto ni por día", () => {
  const fuente = readFileSync("lib/stock/libro/valorDelStockServer.js", "utf8");
  assert.equal((fuente.match(/sqlEfectosPorOrigen\(\{ localId: l,/g) || []).length, 1, "la consulta agrupada se llama una sola vez por pedido");
  assert.match(servidor.sqlEfectosPorOrigen({ localId: 1, desde: D1, hasta: D2 }).sql, /GROUP BY x\."productoLocalId", x\."dia", x\."origen", 4/);
  assert.ok(Prisma.sql);
});
