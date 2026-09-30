// CANDADO: LA PANTALLA DEL VALOR DEL STOCK, LA PARTE PURA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/valorDelStockPantalla.test.mjs
//
// Qué dice arriba, cómo se escribe la evolución y qué dice cada producto. Las
// respuestas NO se escriben a mano: el valor sale de `valorizarCadena`,
// `totalesDelValor` y `valorApi`, el mismo camino que recorre la ruta (regla 2
// de CLAUDE.md), y las versiones de costo con la forma de la consulta.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PUNTO_CERO_PRODUCCION, estadoDelPeriodo, identidadMostrada, movidoDesdeAgregado, stockDeCadena } from "./stockDiario.js";
import { cadenaApi, periodoApi, valorApi } from "./stockDiarioApi.js";
import { alcanceDeLaValorizacion, cantidadesDeLaCadena, costoCongeladoPorDia, diasValorizados, totalesDelValor, valorizarCadena } from "./valorDelStock.js";
import {
  NOMBRE_VALOR_DEL_STOCK,
  filasDeEvolucion,
  monedaConSigno,
  parseContextoStockDiario,
  consultaDelResumen,
  renglonDeValor,
  textoSinValor,
  textosDelValor,
} from "./stockDiarioPantalla.js";
import ResumenValorDelStock from "@/components/stock_diario/ResumenValorDelStock.jsx";

const PC = { dia: PUNTO_CERO_PRODUCCION.dia, instante: PUNTO_CERO_PRODUCCION.instanteUTC };
const ACT = { dia: "2026-09-29", instante: "2026-09-29T03:17:54.566Z" };

let version = 0;
const vBase = (dia, precioCosto, x = {}) => ({ version: String(++version), productoBaseId: 3, tipo: "CAMBIO", dia, precioCosto: String(precioCosto), unidadMedida: "unidad", factorPack: null, pesoReferenciaKg: null, pesoEsFijo: false, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", esCombo: false, ...x });
const vUbic = (dia, x = {}) => ({ version: String(++version), productoLocalId: 7, productoBaseId: 3, tipo: "PUNTO_CERO", dia, precioCosto: null, esDeposito: false, ...x });

/**
 * La respuesta del resumen y una fila de productos para un período, armadas por
 * el motor. `cadenas`: [{ alAbrir, cierres, bases, ubicaciones, identidad }].
 */
function armar({ desde, hasta, hoy, cadenas, esDeposito = false }) {
  const periodo = estadoDelPeriodo({ desde, hasta, puntoCero: PC, hoy });
  const alcance = alcanceDeLaValorizacion({ periodo, puntoCeroStock: PC, activacionCostos: ACT });
  const dias = diasValorizados(alcance);
  const valoradas = cadenas.map((c, i) => {
    const { cantidadAlAbrir, cierres } = cantidadesDeLaCadena({ alAbrir: c.alAbrir, cierres: c.cierres ?? [] });
    const costoDelDia = costoCongeladoPorDia({ ubicaciones: c.ubicaciones ?? [vUbic("2026-09-29", { esDeposito })], basesPorId: new Map([[3, c.bases]]) });
    return { productoLocalId: i + 1, identidad: c.identidad ?? null, valor: dias.length ? valorizarCadena({ dias, cantidadAlAbrir, cierres, costoDelDia }) : null };
  });
  const v = { alcance, cadenas: valoradas, totales: dias.length ? totalesDelValor(valoradas, dias) : null, transito: null };
  const r = { ok: true, local: { id: 1, nombre: "X", esDeposito }, ...periodoApi({ periodo, puntoCero: PC, hoy }, { unidad: "RANGO" }), valor: valorApi(v) };
  const items = valoradas.map((x, i) =>
    cadenaApi({
      ...stockDeCadena({
        localId: 1,
        productoLocalId: x.productoLocalId,
        periodo,
        ultimoAntes: { tipo: "CAMBIO", ...cadenas[i].alAbrir, enTransitoPosterior: "0" },
        ultimoHasta: { tipo: "CAMBIO", cantidadPosterior: (cadenas[i].cierres ?? []).at(-1)?.cantidadPosterior ?? cadenas[i].alAbrir.cantidadPosterior, enTransitoPosterior: "0" },
        movido: movidoDesdeAgregado({}),
        identidad: x.identidad,
      }),
      valor: x.valor,
    })
  );
  return { r, items };
}

const ident = (nombre, x = {}) => identidadMostrada({ productoBaseId: 3, actual: { nombre, unidadMedida: "unidad", ...x }, congelada: null, productoLocalExiste: true });

test("el nombre visible es Valor del Stock", () => {
  assert.equal(NOMBRE_VALOR_DEL_STOCK, "Valor del Stock");
});

test("arriba: la variación grande, y valor inicial, final, movimiento físico y revalorización", () => {
  const { r } = armar({
    desde: "2026-09-30",
    hasta: "2026-10-01",
    hoy: "2026-10-05",
    cadenas: [{ alAbrir: { cantidadPosterior: "20.000" }, bases: [vBase("2026-09-29", "1000.00"), vBase("2026-09-30", "1200.00")], identidad: ident("Revaloriza") }],
  });
  const t = textosDelValor(r);
  assert.equal(t.rotulo, "El valor del stock aumentó");
  assert.equal(t.importe, "+$4.000,00");
  assert.deepEqual(t.columnas.map((c) => [c.rotulo, c.valor]), [
    ["Valor inicial", "$20.000,00"],
    ["Valor final", "$24.000,00"],
    ["Movimiento físico", "$0,00"],
    ["Revalorización", "+$4.000,00"],
  ]);
  assert.equal(t.aviso, null);
  const html = renderToStaticMarkup(React.createElement(ResumenValorDelStock, { respuesta: r }));
  for (const s of [">El valor del stock aumentó<", ">+$4.000,00<", ">Valor inicial<", ">Revalorización<"]) assert.ok(html.includes(s), s);
  assert.ok(!html.includes("sunmi-border-warning"), "sin aviso no se enciende el borde");
});

test("una caída no se llama pérdida: el valor del stock disminuyó, y en ningún texto dice ganancia", () => {
  const { r, items } = armar({
    desde: "2026-09-30",
    hasta: "2026-09-30",
    hoy: "2026-10-05",
    cadenas: [{ alAbrir: { cantidadPosterior: "10.000" }, cierres: [{ dia: "2026-09-30", tipo: "CAMBIO", cantidadPosterior: "4.000" }], bases: [vBase("2026-09-29", "100.00")], identidad: ident("Vendido") }],
  });
  const t = textosDelValor(r);
  assert.equal(t.rotulo, "El valor del stock disminuyó");
  assert.equal(t.importe, "−$600,00");
  const todo = JSON.stringify([t, renglonDeValor(items[0], r)]);
  assert.doesNotMatch(todo, /p[ée]rdida|ganancia/i);
});

test("Reexpresión por escala: aparece solo cuando es distinta de cero, en el resumen y en el detalle", () => {
  const pack = (f) => ({ unidadMedida: "pack", factorPack: f });
  const conEscala = armar({
    desde: "2026-10-05",
    hasta: "2026-10-06",
    hoy: "2026-10-15",
    esDeposito: true,
    cadenas: [{ alAbrir: { cantidadPosterior: "36.000" }, bases: [vBase("2026-10-01", "600.00", pack(6)), vBase("2026-10-05", "600.00", pack(12))], identidad: ident("Pack", { unidadMedida: "pack", factorPack: 12 }) }],
  });
  const t = textosDelValor(conEscala.r);
  const col = Object.fromEntries(t.columnas.map((c) => [c.rotulo, c.valor]));
  assert.equal(col["Reexpresión por escala"], "−$1.800,00");
  assert.equal(col.Revalorización, "$0,00");
  assert.equal(col["Movimiento físico"], "$0,00");
  const det = Object.fromEntries(renglonDeValor(conEscala.items[0], conEscala.r).detalle.map((d) => [d.rotulo, d.valor]));
  assert.equal(det["Reexpresión por escala"], "−$1.800,00");
  const sin = armar({ desde: "2026-10-05", hasta: "2026-10-06", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-10-01", "10.00")] }] });
  assert.ok(!textosDelValor(sin.r).columnas.some((c) => c.rotulo === "Reexpresión por escala"));
});

test("en curso: 'Ahora' y la nota del costo de las 00:00", () => {
  const { r } = armar({ desde: "2026-10-05", hasta: "2026-10-05", hoy: "2026-10-05", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }] });
  const t = textosDelValor(r);
  assert.equal(t.columnas[1].rotulo, "Ahora");
  assert.match(t.nota, /00:00/);
});

test("faltante y negativo: el aviso lo dice, el borde se enciende, y ningún importe es $0 inventado", () => {
  const { r, items } = armar({
    desde: "2026-09-30",
    hasta: "2026-09-30",
    hoy: "2026-10-05",
    cadenas: [
      { alAbrir: { cantidadPosterior: "5.000" }, bases: [vBase("2026-09-29", "0.00")], identidad: ident("SinCosto") },
      { alAbrir: { cantidadPosterior: "-3.000" }, bases: [vBase("2026-09-29", "10.00")], identidad: ident("Negativo") },
    ],
  });
  const t = textosDelValor(r);
  assert.match(t.aviso, /Incompleto: 1 producto sin costo no está en el total/);
  assert.match(t.aviso, /1 producto con stock negativo/);
  // Solo el negativo entra en el total: −3 × $10. Con el menos tipográfico, no "$-30,00".
  assert.equal(t.columnas[0].valor, "−$30,00");
  const sin = renglonDeValor(items[0], r);
  assert.equal(sin.importe, "Sin costo");
  assert.ok(sin.avisos[0].startsWith("Sin valor: costo en cero o vacío"), sin.avisos.join(" | "));
  assert.ok(sin.detalle.find((d) => d.rotulo === "Valor inicial").valor === "—", "un importe que falta es una raya, no $0,00");
  const neg = renglonDeValor(items[1], r);
  assert.ok(neg.avisos.includes("Stock negativo"));
  const html = renderToStaticMarkup(React.createElement(ResumenValorDelStock, { respuesta: r }));
  assert.ok(html.includes("sunmi-border-warning"));
});

test("período parcial: el inicial es el del 30/09 y se dice por qué", () => {
  const { r } = armar({ desde: "2026-09-28", hasta: "2026-10-04", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }] });
  const t = textosDelValor(r);
  assert.equal(t.columnas[0].rotulo, "Valor al abrir el 30/09");
  assert.match(t.aviso, /Hay costos históricos desde el 30\/09/);
  assert.equal(t.subtitulo, "30/09 al 04/10");
});

test("sin costos históricos no hay bloque de valor: se explica y no se muestra cero", () => {
  const { r } = armar({ desde: "2026-09-29", hasta: "2026-09-29", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [] }] });
  assert.equal(textosDelValor(r), null);
  const s = textoSinValor(r);
  assert.equal(s.titulo, "Sin valor para este período");
  assert.match(s.detalle, /miércoles 30 de septiembre/);
  assert.match(s.detalle, /no es cero/);
  assert.equal(r.valor.inicial, null);
});

test("la evolución: un renglón por día con su cierre; en el año, uno por mes", () => {
  const cad = [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }];
  const semana = armar({ desde: "2026-10-05", hasta: "2026-10-11", hoy: "2026-10-20", cadenas: cad }).r;
  const filas = filasDeEvolucion(semana);
  assert.equal(filas.length, 7);
  assert.deepEqual([filas[0].rotulo, filas[0].importe], ["Lunes 05/10", "$10,00"]);
  const anio = armar({ desde: "2026-01-01", hasta: "2026-12-31", hoy: "2026-12-31", cadenas: cad }).r;
  const meses = filasDeEvolucion(anio);
  assert.deepEqual(meses.map((m) => m.rotulo), ["Septiembre · al 30/09", "Octubre · al 31/10", "Noviembre · al 30/11", "Diciembre · al 31/12"]);
});

test("el producto: la variación a la derecha, y el detalle con cantidades en la presentación de Stock Locales", () => {
  const pack = { unidadMedida: "pack", factorPack: 12 };
  const { r, items } = armar({
    desde: "2026-09-30",
    hasta: "2026-10-01",
    hoy: "2026-10-05",
    esDeposito: true,
    cadenas: [{ alAbrir: { cantidadPosterior: "120.000" }, cierres: [{ dia: "2026-10-01", tipo: "CAMBIO", cantidadPosterior: "96.000" }], bases: [vBase("2026-09-29", "1200.00", pack)], identidad: ident("Pack12", { unidadMedida: "pack", factorPack: 12 }) }],
  });
  const f = renglonDeValor(items[0], r);
  assert.equal(f.importe, "−$2.400,00");
  assert.equal(f.linea, "Apertura 10 bultos → Cierre 8 bultos");
  const d = Object.fromEntries(f.detalle.map((x) => [x.rotulo, x.valor]));
  assert.deepEqual(d, {
    "Cantidad inicial": "10 bultos",
    "Cantidad final": "8 bultos",
    "Costo inicial": "$100,00 por unidad",
    "Costo final": "$100,00 por unidad",
    "Valor inicial": "$12.000,00",
    "Valor final": "$9.600,00",
    "Movimiento físico": "−$2.400,00",
    Revalorización: "$0,00",
  });
});

test("Año se pide con unidad ANIO, que la API ya acepta", () => {
  const ctx = parseContextoStockDiario({ unidad: "anio", fecha: "2026-10-01" });
  assert.equal(ctx.unidad, "ANIO");
  assert.equal(consultaDelResumen(ctx), "unidad=ANIO&fecha=2026-10-01");
});

test("monedaConSigno: el menos tipográfico, y la raya sin valor", () => {
  assert.deepEqual([monedaConSigno(1200), monedaConSigno(-36), monedaConSigno(0), monedaConSigno(null)], ["+$1.200,00", "−$36,00", "$0,00", "—"]);
});
