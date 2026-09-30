// CANDADO: EL VALOR DEL STOCK, LA CUENTA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/valorDelStock.test.mjs
//
// Qué se afirma: el valor inicial y el final, el corte del costo a las 00:00, la
// separación entre movimiento físico y revalorización con la identidad exacta,
// el costo faltante que no es cero, el negativo que no se esconde, el tránsito
// aparte con su costo congelado, los períodos, y que la API no consulta por
// producto ni por día.
//
// ── LOS DATOS DE PRUEBA TIENEN LA FORMA DE LOS REALES ─────────────────────
//
// Las versiones de costo se arman con las MISMAS columnas —y los mismos tipos:
// números como texto, días `YYYY-MM-DD`— que devuelven `COLUMNAS_BASE` y
// `COLUMNAS_UBICACION` de `valorDelStockServer.js`; los movimientos, con las de
// la consulta de cierres. Y el costo pasa por `costoPorUnidadFisica` de
// verdad: ninguno se escribe ya dividido. Los importes contra PostgreSQL, con
// escrituras reales, están en `scripts/pruebas-db/valorDelStock.mjs`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Prisma } from "@prisma/client";

import {
  ESTADO_VALOR,
  MOTIVO_COSTO_FALTANTE,
  MOTIVO_SIN_VALOR,
  MOTIVO_TRANSITO_SIN_VALOR,
  alcanceDeLaValorizacion,
  cantidadesDeLaCadena,
  costoCongeladoPorDia,
  primerDiaValorizable,
  totalesDelValor,
  valorizarCadena,
  valorizarTransito,
  valorEnCentavos,
} from "./valorDelStock.js";
import { PUNTO_CERO_PRODUCCION, estadoDelPeriodo, interpretarMovimiento, TEXTO_SIN_ORIGEN } from "./stockDiario.js";
import { valorApi } from "./stockDiarioApi.js";
import * as servidor from "./valorDelStockServer.js";

const PC = { dia: PUNTO_CERO_PRODUCCION.dia, instante: PUNTO_CERO_PRODUCCION.instanteUTC };
const ACT = { dia: "2026-09-29", instante: "2026-09-29T03:17:54.566Z" };

// ── Las filas, con la forma de las consultas ─────────────────────────────

let version = 0;
/** Una `CostoBaseVersion` como la devuelve `COLUMNAS_BASE`. */
const vBase = (dia, precioCosto, x = {}) => ({
  version: String(++version),
  productoBaseId: 3,
  tipo: "CAMBIO",
  dia,
  precioCosto: String(precioCosto),
  unidadMedida: "unidad",
  factorPack: null,
  pesoReferenciaKg: null,
  pesoEsFijo: false,
  modoCompraProveedor: "BULTO",
  modoVentaDeposito: "PESO",
  esCombo: false,
  ...x,
});
/** Una `CostoUbicacionVersion` como la devuelve `COLUMNAS_UBICACION`. */
const vUbic = (dia, x = {}) => ({ version: String(++version), productoLocalId: 7, productoBaseId: 3, tipo: "PUNTO_CERO", dia, precioCosto: null, esDeposito: false, ...x });
/** El último movimiento de un día, como lo devuelve `sqlCierresPorDia`. */
const cierre = (dia, cantidadPosterior, tipo = "CAMBIO") => ({ productoLocalId: 7, dia, tipo, cantidadPosterior: String(cantidadPosterior) });
const mov = (cantidadPosterior, tipo = "CAMBIO") => ({ tipo, cantidadPosterior: String(cantidadPosterior) });

/** Una cadena valorizada con el camino real: cantidades → costo congelado → cuenta. */
function cadena({ dias, alAbrir, cierres = [], ubicaciones = [vUbic("2026-09-29")], bases }) {
  const { cantidadAlAbrir, cierres: mapa } = cantidadesDeLaCadena({ alAbrir, cierres });
  const costoDelDia = costoCongeladoPorDia({ ubicaciones, basesPorId: new Map([[3, bases]]) });
  return valorizarCadena({ dias, cantidadAlAbrir, cierres: mapa, costoDelDia });
}
const pesos = (c) => (c === null ? null : c / 100);
const DIA1 = "2026-09-30";
const DIA2 = "2026-10-01";

// ── E, F · VALOR INICIAL Y FINAL ─────────────────────────────────────────

test("E-F. PACK x12 a $1.200 el bulto: 120 unidades valen $12.000 al abrir y 96 valen $9.600 al cerrar", () => {
  const pack = { unidadMedida: "pack", factorPack: 12 };
  const v = cadena({
    dias: [DIA1],
    alAbrir: mov("120.000"),
    cierres: [cierre(DIA1, "96.000")],
    ubicaciones: [vUbic("2026-09-29", { esDeposito: true })],
    bases: [vBase("2026-09-29", "1200.00", pack)],
  });
  assert.equal(pesos(v.inicial), 12000);
  assert.equal(pesos(v.final), 9600);
  assert.equal(v.costoInicial, 100, "el costo es por unidad física: el bulto dividido por el factor");
});

// ── G, H, I, Z · FÍSICO Y REVALORIZACIÓN ─────────────────────────────────

test("G. sin movimiento y con aumento de costo: toda la diferencia es revalorización", () => {
  const v = cadena({ dias: [DIA1, DIA2], alAbrir: mov("20.000"), bases: [vBase("2026-09-29", "1000.00"), vBase(DIA1, "1200.00")] });
  assert.deepEqual([v.inicial, v.final, v.fisico, v.revalorizacion].map(pesos), [20000, 24000, 0, 4000]);
});

test("H. movimiento con el mismo costo: toda la diferencia es movimiento físico", () => {
  const v = cadena({ dias: [DIA1, DIA2], alAbrir: mov("20.000"), cierres: [cierre(DIA1, "18.000"), cierre(DIA2, "15.000")], bases: [vBase("2026-09-29", "1000.00")] });
  assert.deepEqual([v.inicial, v.final, v.fisico, v.revalorizacion].map(pesos), [20000, 15000, -5000, 0]);
});

test("I-Z. movimiento Y cambio de costo: la reconciliación es exacta, al centavo", () => {
  // Costos con división periódica —1000/3 la unidad— para que el redondeo se note.
  const v = cadena({
    dias: [DIA1, DIA2, "2026-10-02"],
    alAbrir: mov("7.000"),
    cierres: [cierre(DIA1, "5.000"), cierre(DIA2, "11.000"), cierre("2026-10-02", "-2.000")],
    bases: [vBase("2026-09-29", "1000.00", { unidadMedida: "pack", factorPack: 3 }), vBase(DIA1, "1100.00", { unidadMedida: "pack", factorPack: 3 }), vBase(DIA2, "999.99", { unidadMedida: "pack", factorPack: 3 })],
    ubicaciones: [vUbic("2026-09-29", { esDeposito: true })],
  });
  assert.equal(v.completa, true);
  assert.equal(v.final - v.inicial, v.fisico + v.revalorizacion, "la identidad no cuadra");
  assert.ok(v.fisico !== 0 && v.revalorizacion !== 0);
});

test("Z. la identidad del local: final − inicial = físico + revalorización, con varias cadenas", () => {
  const dias = [DIA1, DIA2];
  const a = cadena({ dias, alAbrir: mov("20.000"), bases: [vBase("2026-09-29", "1000.00"), vBase(DIA1, "1200.00")] });
  const b = cadena({ dias, alAbrir: mov("3.500"), cierres: [cierre(DIA2, "1.250")], bases: [vBase("2026-09-29", "333.33", { unidadMedida: "kg" })] });
  const t = totalesDelValor([{ productoLocalId: 1, valor: a }, { productoLocalId: 2, valor: b }], dias);
  assert.equal(t.cuadra, true);
  assert.equal(t.variacion, t.fisico + t.revalorizacion);
  assert.equal(t.inicial, a.inicial + b.inicial);
});

// ── J, K · EL CORTE DE LAS 00:00 ─────────────────────────────────────────

test("J. un cambio de costo durante el día no modifica el valor de ese mismo día", () => {
  const v = cadena({ dias: [DIA1], alAbrir: mov("20.000"), bases: [vBase("2026-09-29", "1000.00"), vBase(DIA1, "1200.00")] });
  assert.deepEqual([v.inicial, v.final, v.revalorizacion].map(pesos), [20000, 20000, 0]);
});

test("K. el cambio impacta en el siguiente 00:00", () => {
  const v = cadena({ dias: [DIA2], alAbrir: mov("20.000"), bases: [vBase("2026-09-29", "1000.00"), vBase(DIA1, "1200.00")] });
  assert.equal(pesos(v.inicial), 24000);
});

test("CONTRAPRUEBA: 'Ahora' no usa el costo cambiado hoy — un período en curso vale con el de las 00:00", () => {
  const hoy = "2026-10-05";
  const periodo = estadoDelPeriodo({ desde: hoy, hasta: hoy, puntoCero: PC, hoy });
  const alcance = alcanceDeLaValorizacion({ periodo, puntoCeroStock: PC, activacionCostos: ACT });
  assert.equal(alcance.estado, ESTADO_VALOR.EN_CURSO);
  const v = cadena({ dias: [hoy], alAbrir: mov("10.000"), bases: [vBase("2026-10-01", "100.00"), vBase(hoy, "999.00")] });
  assert.equal(pesos(v.final), 1000, "el costo de las 14:00 de hoy entró en el valor de ahora");
});

test("CONTRAPRUEBA: no se usa el costo actual para el pasado — cada día lee su versión", () => {
  const dias = [DIA1, DIA2, "2026-10-02"];
  const bases = [vBase("2026-09-29", "100.00"), vBase(DIA1, "200.00"), vBase(DIA2, "300.00")];
  const costoDelDia = costoCongeladoPorDia({ ubicaciones: [vUbic("2026-09-29")], basesPorId: new Map([[3, bases]]) });
  assert.deepEqual(dias.map((d) => costoDelDia(d).costo), [100, 200, 300]);
});

// ── EL PRODUCTO QUE NACE DURANTE EL DÍA ──────────────────────────────────

test("nace en el día: B no existía a las 00:00, nace a las 15:00 a $500 con 10 unidades → $5.000, y el total NO es incompleto", () => {
  const hoy = "2026-10-05";
  const dias = [hoy];
  // A ya existía a $100 y a las 15:00 cambia a $120: hoy sigue a $100.
  const a = cadena({ dias, alAbrir: mov("5.000"), bases: [vBase("2026-10-01", "100.00"), vBase(hoy, "120.00")] });
  // B: su base y su ubicación nacen hoy; su fila de stock nace hoy con 10.
  const altaB = vUbic(hoy, { tipo: "ALTA" });
  const baseB = [vBase(hoy, "500.00", { tipo: "ALTA" })];
  baseB[0].version = String(Number(altaB.version) - 1); // la base se escribe antes que la ubicación, como en la app
  const b = cadena({ dias, alAbrir: null, cierres: [cierre(hoy, "10.000", "ALTA")], ubicaciones: [altaB], bases: baseB });
  assert.equal(pesos(a.final), 500, "la regla intradía de A no cambió");
  assert.equal(b.completa, true, "el nacido en el día quedó como faltante");
  assert.equal(b.nacioEnElPeriodo, true);
  assert.deepEqual([b.inicial, b.final, b.fisico].map(pesos), [0, 5000, 5000]);
  const t = totalesDelValor([{ productoLocalId: 1, valor: a }, { productoLocalId: 2, valor: b }], dias);
  assert.equal(t.completo, true);
  assert.equal(pesos(t.final), 5500);
  assert.equal(t.cuadra, true);
});

test("nace en el día: su costo del alta queda congelado ese día aunque cambie a la tarde, y al día siguiente vale el de las 00:00", () => {
  const d1 = "2026-10-05";
  const d2 = "2026-10-06";
  const alta = vUbic(d1, { tipo: "ALTA" });
  const bases = [vBase(d1, "500.00", { tipo: "ALTA" })];
  bases[0].version = String(Number(alta.version) - 1);
  bases.push(vBase(d1, "650.00")); // 16:00, después del alta
  const v = cadena({ dias: [d1, d2], alAbrir: null, cierres: [cierre(d1, "10.000", "ALTA")], ubicaciones: [alta], bases });
  assert.equal(pesos(v.porDia[0]), 5000, "el primer día vale con el costo del alta");
  assert.equal(pesos(v.porDia[1]), 6500, "desde el día siguiente, el costo de las 00:00");
  assert.equal(pesos(v.revalorizacion), 1500);
  assert.equal(v.final - v.inicial, v.fisico + v.revalorizacion + v.reexpresion);
});

test("nace en el día SIN costo válido: sí es faltante, y no se inventa un costo anterior", () => {
  const hoy = "2026-10-05";
  const alta = vUbic(hoy, { tipo: "ALTA" });
  const bases = [vBase(hoy, "0.00", { tipo: "ALTA" })];
  bases[0].version = String(Number(alta.version) - 1);
  const v = cadena({ dias: [hoy], alAbrir: null, cierres: [cierre(hoy, "10.000", "ALTA")], ubicaciones: [alta], bases });
  assert.equal(v.completa, false);
  assert.equal(v.faltante.motivo, MOTIVO_COSTO_FALTANTE.SIN_COSTO);
  assert.equal(v.final, null);
});

test("CONTRAPRUEBA: la excepción del alta no alcanza a un producto que ya existía a las 00:00", () => {
  const hoy = "2026-10-05";
  // La ubicación existía; solo cambia el costo hoy. No hay ALTA de hoy.
  const v = cadena({ dias: [hoy], alAbrir: mov("10.000"), ubicaciones: [vUbic("2026-10-01")], bases: [vBase("2026-10-01", "100.00"), vBase(hoy, "999.00")] });
  assert.equal(v.nacioEnElPeriodo, false);
  assert.equal(pesos(v.final), 1000);
});

// ── REEXPRESIÓN POR ESCALA ───────────────────────────────────────────────

test("reexpresión: misma cantidad, mismo costo comercial, cambia el factor → todo es reexpresión", () => {
  const d1 = "2026-10-05";
  const d2 = "2026-10-06";
  const v = cadena({
    dias: [d1, d2],
    alAbrir: mov("36.000"),
    ubicaciones: [vUbic("2026-10-01", { esDeposito: true })],
    bases: [vBase("2026-10-01", "600.00", { unidadMedida: "pack", factorPack: 6 }), vBase(d1, "600.00", { unidadMedida: "pack", factorPack: 12 })],
  });
  // 36 unidades a $100 (pack x6 a $600) = $3.600; con x12, $50 → $1.800.
  assert.deepEqual([v.inicial, v.final, v.fisico, v.revalorizacion, v.reexpresion].map(pesos), [3600, 1800, 0, 0, -1800]);
  assert.equal(v.final - v.inicial, v.fisico + v.revalorizacion + v.reexpresion);
});

test("reexpresión CONTRAPRUEBA: si solo cambia el costo comercial, la reexpresión es cero", () => {
  const v = cadena({ dias: [DIA1, DIA2], alAbrir: mov("20.000"), bases: [vBase("2026-09-29", "1000.00"), vBase(DIA1, "1200.00")] });
  assert.equal(v.reexpresion, 0);
  assert.equal(pesos(v.revalorizacion), 4000);
});

test("reexpresión: movimiento físico + cambio de costo + cambio de escala, reconciliados al centavo", () => {
  const dias = ["2026-10-05", "2026-10-06", "2026-10-07"];
  const pack = (f) => ({ unidadMedida: "pack", factorPack: f });
  const v = cadena({
    dias,
    alAbrir: mov("36.000"),
    cierres: [cierre(dias[0], "30.000"), cierre(dias[1], "41.000"), cierre(dias[2], "7.000")],
    ubicaciones: [vUbic("2026-10-01", { esDeposito: true })],
    bases: [
      vBase("2026-10-01", "600.00", pack(6)),
      // el 05: cambian costo Y factor a la vez → las dos partes
      vBase(dias[0], "700.00", pack(7)),
      // el 06: solo el costo
      vBase(dias[1], "770.00", pack(7)),
    ],
  });
  // 06: 30 u × (700/7 = 100) − 30 × 100… desglosado:
  //   revalorización = 30 × 700/6 − 30 × 600/6 = 3.500 − 3.000 = 500
  //   reexpresión    = 30 × 700/7 − 30 × 700/6 = 3.000 − 3.500 = −500
  // 07: revalorización = 41 × 110 − 41 × 100 = 410; reexpresión 0.
  assert.deepEqual([v.revalorizacion, v.reexpresion].map(pesos), [910, -500]);
  assert.equal(v.final - v.inicial, v.fisico + v.revalorizacion + v.reexpresion, "no cierra al centavo");
  const t = totalesDelValor([{ productoLocalId: 1, valor: v }], dias);
  assert.equal(t.cuadra, true);
  assert.equal(t.variacion, t.fisico + t.revalorizacion + t.reexpresion);
});

test("reexpresión: pasar del local al depósito también es escala (la pieza), no revalorización", () => {
  const kgPieza = { unidadMedida: "kg", modoCompraProveedor: "UNIDAD", modoVentaDeposito: "PIEZA", pesoReferenciaKg: "2.500" };
  const v = cadena({
    dias: [DIA1, DIA2],
    alAbrir: mov("3.000"),
    ubicaciones: [vUbic("2026-09-29", { esDeposito: false }), vUbic(DIA1, { tipo: "CAMBIO", esDeposito: true })],
    bases: [vBase("2026-09-29", "4000.00", kgPieza)],
  });
  assert.equal(v.revalorizacion, 0);
  assert.equal(pesos(v.reexpresion), 3 * 10000 - 3 * 4000);
});

// ── L · COSTO FALTANTE ───────────────────────────────────────────────────

test("L. sin costo histórico: no devuelve cero, la cadena queda afuera y el total es incompleto", () => {
  const dias = [DIA1];
  const sinVersion = cadena({ dias, alAbrir: mov("5.000"), bases: [] });
  const costoCero = cadena({ dias, alAbrir: mov("5.000"), bases: [vBase("2026-09-29", "0.00")] });
  const buena = cadena({ dias, alAbrir: mov("2.000"), bases: [vBase("2026-09-29", "10.00")] });
  for (const v of [sinVersion, costoCero]) {
    assert.equal(v.completa, false);
    assert.equal(v.inicial, null, "un costo que falta se volvió un importe");
    assert.equal(v.final, null);
  }
  assert.equal(sinVersion.faltante.motivo, MOTIVO_COSTO_FALTANTE.SIN_VERSION);
  assert.equal(costoCero.faltante.motivo, MOTIVO_COSTO_FALTANTE.SIN_COSTO);
  const t = totalesDelValor([{ productoLocalId: 1, valor: sinVersion }, { productoLocalId: 2, valor: costoCero }, { productoLocalId: 3, valor: buena }], dias);
  assert.equal(t.completo, false);
  assert.equal(pesos(t.inicial), 20, "solo la que tiene costo");
  assert.deepEqual(t.faltantes.map((f) => f.productoLocalId), [1, 2]);
  const api = valorApi({ alcance: { estado: ESTADO_VALOR.COMPLETO }, cadenas: [], totales: t, transito: null });
  assert.equal(api.completo, false);
});

test("L. sin cantidad el costo no hace falta: un producto en cero sin costo no es un faltante", () => {
  const v = cadena({ dias: [DIA1], alAbrir: mov("0.000"), bases: [] });
  assert.equal(v.completa, true);
  assert.equal(v.inicial, 0);
});

// ── M · NEGATIVO ─────────────────────────────────────────────────────────

test("M. el stock negativo se valoriza negativo y se marca: no se pasa a cero", () => {
  const v = cadena({ dias: [DIA1], alAbrir: mov("-36.000"), bases: [vBase("2026-09-29", "600.00", { unidadMedida: "pack", factorPack: 6 })], ubicaciones: [vUbic("2026-09-29", { esDeposito: true })] });
  assert.equal(pesos(v.inicial), -3600);
  assert.equal(v.stockNegativo, true);
  assert.equal(totalesDelValor([{ productoLocalId: 1, valor: v }], [DIA1]).cadenasConStockNegativo, 1);
});

// ── N, O · EN TRÁNSITO ───────────────────────────────────────────────────

/** Una línea en viaje, con la forma que arma `lineaDeTransito` desde la consulta. */
const lineaEnViaje = (x = {}) => ({
  id: 1,
  transferenciaId: 10,
  productoLocalOrigenId: 7,
  nombre: "Pack6",
  cantidad: 12,
  precioCosto: 600,
  unidadEnviada: "UNIDAD",
  presentacionEnvio: null,
  cantidadPresentada: null,
  sueltasEnviadas: null,
  factorPresentacion: null,
  pesoPiezaKg: null,
  base: { unidad_medida: "pack", factor_pack: 6, modoCompraProveedor: "BULTO", pesoReferenciaKg: null, modoVentaDeposito: "PESO", pesoEsFijo: false },
  ...x,
});

test("N-O. el tránsito se valoriza con el costo CONGELADO de la línea, y concilia con el libro", () => {
  const t = valorizarTransito({ lineas: [lineaEnViaje()], origenEsDeposito: true, transitoDelLibro: new Map([[7, 12000]]) });
  assert.equal(pesos(t.valor), 1200, "12 unidades de un pack x6 congelado a $600: $100 cada una");
  assert.deepEqual(t.noConciliado, []);
});

test("N. CONTRAPRUEBA: el tránsito no entra en el stock disponible", () => {
  // La cadena del origen tiene 48 en `cantidad` y 12 en `enTransito`: el valor
  // disponible es el de las 48. `cantidadesDeLaCadena` no lee el tránsito.
  const { cantidadAlAbrir } = cantidadesDeLaCadena({ alAbrir: { tipo: "CAMBIO", cantidadPosterior: "48.000", enTransitoPosterior: "12.000" }, cierres: [] });
  assert.equal(cantidadAlAbrir, 48000);
  const fuente = readFileSync("lib/stock/libro/valorDelStock.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const cuerpo = fuente.slice(fuente.indexOf("export function cantidadesDeLaCadena"));
  assert.ok(!/enTransito/.test(cuerpo.slice(0, cuerpo.indexOf("\n}\n"))), "las cantidades a valorizar leen el tránsito");
});

test("O. sin costo congelado el tránsito no vale cero ni toma el de hoy: se nombra", () => {
  const t = valorizarTransito({ lineas: [lineaEnViaje({ precioCosto: null }), lineaEnViaje({ id: 2, precioCosto: 0 })], origenEsDeposito: true, transitoDelLibro: new Map([[7, 24000]]) });
  assert.equal(t.valor, 0);
  assert.equal(t.completo, false);
  assert.deepEqual(t.sinValor.map((s) => s.motivo), [MOTIVO_TRANSITO_SIN_VALOR.SIN_COSTO_CONGELADO, MOTIVO_TRANSITO_SIN_VALOR.SIN_COSTO_CONGELADO]);
  assert.deepEqual(t.noConciliado, [], "las unidades se leen igual, aunque no haya precio");
});

test("el tránsito del libro que ningún documento abierto explica se dice", () => {
  const t = valorizarTransito({ lineas: [lineaEnViaje()], origenEsDeposito: true, transitoDelLibro: new Map([[7, 1162000]]) });
  assert.deepEqual(t.noConciliado, [{ productoLocalId: 7, libro: 1162000, documentos: 12000 }]);
});

// ── P, Q, R, S, T · PERÍODOS ─────────────────────────────────────────────

const alcance = (desde, hasta, hoy = "2026-10-15") =>
  alcanceDeLaValorizacion({ periodo: estadoDelPeriodo({ desde, hasta, puntoCero: PC, hoy }), puntoCeroStock: PC, activacionCostos: ACT });

test("el primer día valorizable es el 30/09: el siguiente a la activación del Libro de Costos", () => {
  assert.equal(primerDiaValorizable({ puntoCeroStock: PC, activacionCostos: ACT }), "2026-09-30");
  assert.equal(primerDiaValorizable({ puntoCeroStock: PC, activacionCostos: null }), null);
});

test("P. día: COMPLETO, de ese día a ese día", () => {
  assert.deepEqual([alcance("2026-10-01", "2026-10-01").estado, alcance("2026-10-01", "2026-10-01").desdeValorizado], [ESTADO_VALOR.COMPLETO, "2026-10-01"]);
});

test("Q. semana que empieza antes del 30/09: PARCIAL, valorizada desde el 30/09", () => {
  const a = alcance("2026-09-28", "2026-10-04");
  assert.deepEqual([a.estado, a.desdeValorizado, a.hastaValorizado, a.recortado], [ESTADO_VALOR.PARCIAL, "2026-09-30", "2026-10-04", true]);
});

test("R. mes en curso: EN_CURSO hasta hoy", () => {
  const a = alcance("2026-10-01", "2026-10-31");
  assert.deepEqual([a.estado, a.hastaValorizado], [ESTADO_VALOR.EN_CURSO, "2026-10-15"]);
});

test("S. rango personalizado: sus puntas", () => {
  const a = alcance("2026-10-02", "2026-10-09");
  assert.deepEqual([a.estado, a.desdeValorizado, a.hastaValorizado], [ESTADO_VALOR.COMPLETO, "2026-10-02", "2026-10-09"]);
});

test("T. antes del historial confiable no hay valor: NO_DISPONIBLE, sin días ni números", () => {
  for (const [d, h] of [["2026-09-29", "2026-09-29"], ["2026-09-01", "2026-09-29"], ["2026-09-20", "2026-09-20"]]) {
    const a = alcance(d, h);
    assert.equal(a.estado, ESTADO_VALOR.NO_DISPONIBLE, `${d}..${h}`);
    assert.equal(a.desdeValorizado, null);
  }
  const sinLibro = alcanceDeLaValorizacion({ periodo: estadoDelPeriodo({ desde: "2026-10-01", hasta: "2026-10-01", puntoCero: PC, hoy: "2026-10-15" }), puntoCeroStock: PC, activacionCostos: null });
  assert.equal(sinLibro.motivo, MOTIVO_SIN_VALOR.LIBRO_DE_COSTOS_INACTIVO);
  const api = valorApi({ alcance: sinLibro, cadenas: [], totales: null, transito: null });
  assert.deepEqual([api.inicial, api.final, api.variacion], [null, null, null], "fuera del historial no hay ceros");
});

// ── U · SIN_ORIGEN ───────────────────────────────────────────────────────

test("U. SIN_ORIGEN no se reclasifica y la valorización no depende del origen", () => {
  const fila = { id: 1, tipo: "CAMBIO", localId: 1, productoLocalId: 7, productoBaseId: 3, stockLocalId: 1, cantidadAnterior: "5", cantidadPosterior: "4", enTransitoAnterior: "0", enTransitoPosterior: "0", instante: "x", dia: DIA1, origen: "SIN_ORIGEN" };
  assert.equal(interpretarMovimiento(fila).origenLegible, TEXTO_SIN_ORIGEN);
  // Las mismas cantidades con y sin origen valen lo mismo: la consulta de
  // cierres ni siquiera lo trae.
  const con = cantidadesDeLaCadena({ alAbrir: { ...mov("5"), origen: "VENTA" }, cierres: [{ ...cierre(DIA1, "4"), origen: "VENTA" }] });
  const sin = cantidadesDeLaCadena({ alAbrir: { ...mov("5"), origen: "SIN_ORIGEN" }, cierres: [{ ...cierre(DIA1, "4"), origen: "SIN_ORIGEN" }] });
  assert.deepEqual([...con.cierres], [...sin.cierres]);
  assert.doesNotMatch(servidor.sqlCierresPorDia({ localId: 1, desde: DIA1, hasta: DIA2 }).sql, /origen/);
});

// ── CONTRAPRUEBA · LOS SALDOS DIARIOS NO SE SUMAN ────────────────────────

test("CONTRAPRUEBA: la evolución son fotografías; el final es la última, no la suma", () => {
  const dias = [DIA1, DIA2];
  const v = cadena({ dias, alAbrir: mov("10.000"), bases: [vBase("2026-09-29", "100.00")] });
  const t = totalesDelValor([{ productoLocalId: 1, valor: v }], dias);
  assert.deepEqual(t.evolucion.map((e) => pesos(e.valor)), [1000, 1000]);
  assert.equal(pesos(t.final), 1000, "sumar los saldos diarios diría $2.000");
  assert.equal(t.final, t.evolucion.at(-1).valor);
});

test("el valor en centavos redondea una sola vez y simétrico", () => {
  assert.equal(valorEnCentavos(12000, 1000 / 12), 100000);
  assert.equal(valorEnCentavos(-12000, 1000 / 12), -100000);
});

// ── RENDIMIENTO · SIN N+1 ────────────────────────────────────────────────
//
// Un cliente falso que cuenta las consultas: con 1 producto y 1 día, y con 60
// productos y 31 días, tienen que ser LAS MISMAS. Si alguien pone una consulta
// adentro del recorrido de cadenas o de días, este candado se pone rojo.

function clienteQueCuenta({ cadenas }) {
  const consultas = [];
  const ultimo = { id: 1, tipo: "CAMBIO", productoBaseId: 3, cantidadPosterior: "5.000", enTransitoPosterior: "0.000" };
  const responder = (sql) => {
    if (sql.includes('"libro_stock_dia"("libro_stock_instante"())')) return [{ hoy: "2026-11-15" }];
    if (/FROM "MovimientoStock" m ORDER BY m\."id" LIMIT 1/.test(sql)) return [{ instante: PC.instante, dia: PC.dia, tipo: "ESTADO_INICIAL" }];
    if (sql.includes('FROM "LibroCostoActivacion"')) return [ACT];
    if (sql.includes("WITH RECURSIVE cadenas")) return Array.from({ length: cadenas }, (_, i) => ({ productoLocalId: i + 1, ultimoAntes: ultimo, ultimoHasta: ultimo }));
    return [];
  };
  return {
    consultas,
    $queryRaw(partes, ...valores) {
      consultas.push(Prisma.sql(partes, ...valores).sql);
      return Promise.resolve(responder(consultas.at(-1)));
    },
    $executeRaw() {
      return Promise.resolve(0);
    },
  };
}

test("20. el Valor del Stock no consulta por producto ni por día: las mismas consultas para 1×1 y 60×31", async () => {
  const chico = clienteQueCuenta({ cadenas: 1 });
  await servidor.valorDelPeriodo(chico, { localId: 1, desde: "2026-10-01", hasta: "2026-10-01", esDeposito: false });
  const grande = clienteQueCuenta({ cadenas: 60 });
  await servidor.valorDelPeriodo(grande, { localId: 1, desde: "2026-10-01", hasta: "2026-10-31", esDeposito: true });
  assert.equal(grande.consultas.length, chico.consultas.length, `${chico.consultas.length} contra ${grande.consultas.length}`);
  // 12 hasta "¿Por qué cambió?", que agregó UNA consulta agrupada (los efectos
  // por origen). Un número exacto: una consulta más por accidente se ve.
  assert.equal(chico.consultas.length, 13, `son ${chico.consultas.length}`);
});

test("las versiones de costo se leen con el corte ESTRICTO: `dia` anterior, no el mismo día", () => {
  const fuente = readFileSync("lib/stock/libro/valorDelStockServer.js", "utf8");
  const aperturas = [...fuente.matchAll(/DISTINCT ON \([ub]\."product\w+"\)[\s\S]*?ORDER BY/g)].map((m) => m[0]);
  assert.equal(aperturas.length, 2);
  for (const a of aperturas) {
    assert.match(a, /"dia" < \$\{desde\}::date/, "la versión vigente a las 00:00 es la de un día ANTERIOR");
    assert.doesNotMatch(a, /"dia" <= /);
  }
});

// ── Y · SOLO LECTURA ─────────────────────────────────────────────────────

test("Y. la herramienta no escribe: sus rutas son GET y ni la pantalla ni el servidor escriben", () => {
  const archivos = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "app/api/stock_locales/diario", "components/stock_diario", "app/modulos/finanzas/stock-diario", "lib/stock/libro"],
    { encoding: "utf8" }
  )
    .split("\n")
    .filter((f) => /\.(js|jsx)$/.test(f));
  assert.ok(archivos.length > 8);
  for (const f of archivos) {
    const t = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    if (f.startsWith("app/api/")) assert.doesNotMatch(t, /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/, f);
    if (/valorDelStock|stockDiario|components\/stock_diario|finanzas\/stock-diario/.test(f)) {
      assert.doesNotMatch(t, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/, f);
      assert.doesNotMatch(t, /\$executeRaw(Unsafe)?`?\s*`?\s*(INSERT|UPDATE|DELETE)/i, f);
      assert.doesNotMatch(t, /\.(create|update|upsert|delete)(Many)?\(/, f);
    }
  }
});
