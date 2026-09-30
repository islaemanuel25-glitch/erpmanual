// CANDADO: "¿POR QUÉ CAMBIÓ?" EN LA PANTALLA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/porQueCambioPantalla.test.mjs
//
// La respuesta sale del motor —`valorizarCadena`, `totalesDelValor`,
// `valorApi`— y no se escribe a mano (regla 2). Acá se afirma qué filas se ven,
// que la suma es la del movimiento físico, que nada dice "gastado" ni "cobrado"
// y cómo se lee cada movimiento del detalle.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DIRECCION } from "./explicacionDelValor.js";
import { SIN_ORIGEN } from "./libroStock.js";
import { cantidadesDeLaCadena, costoCongeladoPorDia, totalesDelValor, valorizarCadena } from "./valorDelStock.js";
import { ESTADO_VALOR, escalaDelMomento } from "./valorDelStock.js";
import { identidadApi, valorApi, movimientoDeCategoriaApi } from "./stockDiarioApi.js";
import { identidadMostrada } from "./stockDiario.js";
import { consultaDeCategoria, documentoDelMovimiento, parseContextoStockDiario, renglonDeMovimiento, textosDePorQueCambio } from "./stockDiarioPantalla.js";
import PorQueCambio from "@/components/stock_diario/PorQueCambio.jsx";

let version = 0;
const vBase = (dia, precioCosto) => ({ version: String(++version), productoBaseId: 3, tipo: "CAMBIO", dia, precioCosto: String(precioCosto), unidadMedida: "unidad", factorPack: null, pesoReferenciaKg: null, pesoEsFijo: false, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", esCombo: false });
const vUbic = (dia) => ({ version: String(++version), productoLocalId: 7, productoBaseId: 3, tipo: "PUNTO_CERO", dia, precioCosto: null, esDeposito: true });
const g = (origen, delta, movimientos = 1) => ({ origen, direccion: delta > 0 ? DIRECCION.ENTRADA : DIRECCION.SALIDA, delta: delta * 1000, movimientos });
const D = "2026-10-05";

function respuesta(efectos, { abre, cierra, costo = "100.00" }) {
  const { cantidadAlAbrir, cierres } = cantidadesDeLaCadena({ alAbrir: { tipo: "CAMBIO", cantidadPosterior: String(abre) }, cierres: [{ dia: D, tipo: "CAMBIO", cantidadPosterior: String(cierra) }] });
  const valor = valorizarCadena({ dias: [D], cantidadAlAbrir, cierres, costoDelDia: costoCongeladoPorDia({ ubicaciones: [vUbic("2026-10-01")], basesPorId: new Map([[3, [vBase("2026-10-01", costo)]]]) }), efectosPorDia: new Map([[D, efectos]]) });
  const cadenas = [{ productoLocalId: 7, identidad: null, valor }];
  const totales = totalesDelValor(cadenas, [D], { conExplicacion: true });
  const alcance = { estado: ESTADO_VALOR.COMPLETO, desdeValorizado: D, hastaValorizado: D, primerDia: "2026-09-30", recortado: false, enCurso: false, motivo: null };
  return { ok: true, local: { id: 1, esDeposito: true }, valor: valorApi({ alcance, cadenas, totales, transito: null }) };
}

test("las filas: solo las categorías con movimientos, con su neto, y el total es el movimiento físico", () => {
  const r = respuesta([g("COMPRA_PROVEEDOR", 24), g("VENTA", -3, 2), g("TRANSFERENCIA_ENVIO", -12)], { abre: 100, cierra: 109 });
  const t = textosDePorQueCambio(r);
  assert.equal(t.total, "+$900,00");
  assert.equal(r.valor.explicacion.total, r.valor.fisico);
  assert.deepEqual(t.filas.map((f) => [f.rotulo, f.importe]), [
    ["Compras a proveedor", "+$2.400,00"],
    ["Ventas", "−$300,00"],
    ["Transferencias", "−$1.200,00"],
  ]);
  assert.equal(t.filas[1].detalle, "2 movimientos");
  assert.equal(t.aviso, null);
});

test("entradas y salidas de una misma categoría se dicen por separado", () => {
  const r = respuesta([g("AJUSTE_MANUAL", 2), g("AJUSTE_MANUAL", -1)], { abre: 10, cierra: 11 });
  const [f] = textosDePorQueCambio(r).filas;
  assert.equal(f.detalle, "2 movimientos · positivos +$200,00 · negativos −$100,00");
  assert.equal(f.importe, "+$100,00");
});

test("Sin clasificar se ve siempre que haya movimientos, y el aviso dice cuánto es", () => {
  const r = respuesta([g(SIN_ORIGEN, -24), g("VENTA", -1)], { abre: 120, cierra: 95 });
  const t = textosDePorQueCambio(r);
  assert.ok(t.filas.some((f) => f.rotulo === "Sin clasificar" && f.importe === "−$2.400,00"));
  assert.match(t.aviso, /1 movimiento sin origen registrado: −\$2\.400,00/);
});

test("no habla de plata que entró o salió: habla del capital en mercadería", () => {
  const r = respuesta([g("COMPRA_PROVEEDOR", 24), g("VENTA", -3)], { abre: 100, cierra: 121 });
  const html = renderToStaticMarkup(React.createElement(PorQueCambio, { respuesta: r, ctx: parseContextoStockDiario({}) }));
  assert.ok(html.includes("¿Por qué cambió?") && html.includes("movimiento físico"));
  assert.ok(html.includes(">+$2.100,00<"), html);
  assert.doesNotMatch(html, /gastad|cobrad|pagad|plata que|dinero/i);
  assert.doesNotMatch(html, /COMPRA_PROVEEDOR|TRANSFERENCIA_ENVIO|SIN_ORIGEN/, "no se muestran nombres internos");
  assert.ok(!html.includes("data-detalle-categoria"), "el detalle arranca cerrado");
});

test("el detalle se pide con el mismo período y la categoría", () => {
  const ctx = parseContextoStockDiario({ unidad: "SEMANA", fecha: "2026-10-05", localId: "4" });
  const qs = new URLSearchParams(consultaDeCategoria(ctx, "COMPRAS", { page: 2 }));
  assert.deepEqual([qs.get("unidad"), qs.get("fecha"), qs.get("localId"), qs.get("categoria"), qs.get("page")], ["SEMANA", "2026-10-05", "4", "COMPRAS", "2"]);
});

test("un movimiento del detalle: producto, cuándo, el documento, la cantidad con la presentación de Stock Locales y su efecto", () => {
  const identidad = identidadMostrada({ productoBaseId: 3, actual: { nombre: "FERNET BRANCA 450ML", unidadMedida: "pack", factorPack: 6 }, congelada: null, productoLocalExiste: true });
  const m = movimientoDeCategoriaApi({ id: 1, instante: "2026-10-05T13:00:00.000Z", dia: D, tipo: "CAMBIO", origen: "COMPRA_PROVEEDOR", origenRef: "77", categoria: "COMPRAS", productoLocalId: 7, identidad, delta: 36000, costo: 100, efecto: 360000 });
  const r = renglonDeMovimiento(m, { local: { esDeposito: true } });
  assert.deepEqual(r, { nombre: "FERNET BRANCA 450ML", linea: "05/10 10:00 · Pedido a proveedor #77", cantidad: "+6 bultos", importe: "+$3.600,00" });
  const sinCosto = renglonDeMovimiento({ ...m, efecto: null }, { local: { esDeposito: true } });
  assert.equal(sinCosto.importe, "Sin costo", "sin costo no se escribe $0");
  assert.equal(documentoDelMovimiento({ origen: "SIN_ORIGEN", origenRef: null }), "Sin origen registrado");
  assert.equal(documentoDelMovimiento({ origen: "ALGO_NUEVO", origenRef: "3" }), "ALGO_NUEVO #3");
  assert.ok(identidadApi(identidad, 7).escala);
});

// ── LA ESCALA DE SU MOMENTO ──────────────────────────────────────────────

/** Versiones del Libro de Costos con su instante, como las trae el servidor. */
const vb = (instante, x) => ({ version: String(++version), productoBaseId: 3, tipo: "CAMBIO", dia: instante.slice(0, 10), instante, precioCosto: "600.00", unidadMedida: "pack", factorPack: 6, pesoReferenciaKg: null, pesoEsFijo: false, modoCompraProveedor: "BULTO", modoVentaDeposito: null, esCombo: false, ...x });
const vu = (instante, esDeposito = true) => ({ version: String(++version), productoLocalId: 7, productoBaseId: 3, tipo: "PUNTO_CERO", dia: instante.slice(0, 10), instante, precioCosto: null, esDeposito });

/** Un movimiento del detalle leído como lo lee la pantalla, con las versiones que valorizaron. */
function renglonHistorico({ bases, ubicaciones = [vu("2026-09-28T03:00:00.000Z")], hoy, instante, delta, esDepositoHoy = true }) {
  const identidad = identidadMostrada({ productoBaseId: 3, actual: { nombre: "PRODUCTO", ...hoy }, congelada: null, productoLocalExiste: true });
  const escala = escalaDelMomento({ ubicaciones, basesPorId: new Map([[3, bases]]), instante });
  const m = movimientoDeCategoriaApi({ id: 1, instante, dia: instante.slice(0, 10), tipo: "CAMBIO", origen: "COMPRA_PROVEEDOR", origenRef: "1", categoria: "COMPRAS", productoLocalId: 7, identidad, escalaDelMomento: escala, delta: Math.round(delta * 1000), costo: 100, efecto: 100 });
  return renglonDeMovimiento(m, { local: { esDeposito: esDepositoHoy } }).cantidad;
}

test("A-B. PACK x6 el 30/09, x12 desde el 02/10: el movimiento del 01/10 se sigue leyendo x6; el del 03/10, x12", () => {
  const bases = [vb("2026-09-28T03:00:00.000Z", { factorPack: 6 }), vb("2026-10-02T15:00:00.000Z", { factorPack: 12 })];
  const hoy = { unidadMedida: "pack", factorPack: 12 };
  assert.equal(renglonHistorico({ bases, hoy, instante: "2026-10-01T13:00:00.000Z", delta: 36 }), "+6 bultos", "se releyó con la escala de hoy");
  assert.equal(renglonHistorico({ bases, hoy, instante: "2026-10-03T13:00:00.000Z", delta: 36 }), "+3 bultos");
  // A igual instante que el cambio de ficha, la ficha nueva ya vale: se escribe antes.
  assert.equal(renglonHistorico({ bases, hoy, instante: "2026-10-02T15:00:00.000Z", delta: 36 }), "+3 bultos");
  // Con sueltas, como en Stock Locales.
  assert.equal(renglonHistorico({ bases, hoy, instante: "2026-10-01T13:00:00.000Z", delta: -8 }), "−1 bulto + 2 uds");
});

test("C. unidad → pack: lo que entró como unidades se lee en unidades", () => {
  const bases = [vb("2026-09-28T03:00:00.000Z", { unidadMedida: "unidad", factorPack: null }), vb("2026-10-02T15:00:00.000Z", { factorPack: 12 })];
  assert.equal(renglonHistorico({ bases, hoy: { unidadMedida: "pack", factorPack: 12 }, instante: "2026-10-01T13:00:00.000Z", delta: 36 }), "+36 uds");
});

test("C. kg y pieza: un fiambre que se guardaba por pieza se lee en piezas aunque hoy se guarde por kilo", () => {
  const fiambre = { unidadMedida: "kg", factorPack: null, modoCompraProveedor: "UNIDAD", pesoReferenciaKg: "4.500" };
  const bases = [vb("2026-09-28T03:00:00.000Z", { ...fiambre, modoVentaDeposito: "PIEZA" }), vb("2026-10-02T15:00:00.000Z", { ...fiambre, modoVentaDeposito: "PESO" })];
  const hoy = { unidadMedida: "kg", modoCompraProveedor: "UNIDAD", pesoReferenciaKg: 4.5, modoVentaDeposito: "PESO" };
  assert.equal(renglonHistorico({ bases, hoy, instante: "2026-10-01T13:00:00.000Z", delta: 3 }), "+3 pzs");
  assert.equal(renglonHistorico({ bases, hoy, instante: "2026-10-03T13:00:00.000Z", delta: 2.25 }), "+2.250 kg");
  // En un local la pieza no existe: la ubicación de su momento manda.
  assert.equal(renglonHistorico({ bases, hoy, ubicaciones: [vu("2026-09-28T03:00:00.000Z", false)], instante: "2026-10-01T13:00:00.000Z", delta: 1.5, esDepositoHoy: false }), "+1.500 kg");
});

test("D. sin versión del libro en ese instante: cae a la escala de hoy, y lo dice", () => {
  const bases = [vb("2026-10-02T15:00:00.000Z", { factorPack: 12 })];
  const ubicaciones = [vu("2026-10-02T15:00:00.000Z")];
  assert.equal(escalaDelMomento({ ubicaciones, basesPorId: new Map([[3, bases]]), instante: "2026-10-01T13:00:00.000Z" }), null);
  assert.equal(renglonHistorico({ bases, ubicaciones, hoy: { unidadMedida: "pack", factorPack: 12 }, instante: "2026-10-01T13:00:00.000Z", delta: 36 }), "+3 bultos");
  const m = movimientoDeCategoriaApi({ id: 1, productoLocalId: 7, identidad: null, escalaDelMomento: null, delta: 1000, efecto: 1 });
  assert.equal(m.esDepositoDelMomento, null);
});
