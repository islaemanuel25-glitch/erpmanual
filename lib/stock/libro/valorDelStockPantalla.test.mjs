// CANDADO: LA PANTALLA DEL VALOR DEL STOCK, EL TABLERO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/valorDelStockPantalla.test.mjs
//
// La tarjeta del capital, las causas del cambio con sus barras, la atención y
// el gráfico de evolución (Figma EVJ2KvVCrY0oVSowfboymQ, 329-624 y 329-802).
// Las respuestas NO se escriben a mano: el valor sale de `valorizarCadena`,
// `totalesDelValor` y `valorApi`, el mismo camino que recorre la ruta (regla 2
// de CLAUDE.md), y las versiones de costo con la forma de la consulta.

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PUNTO_CERO_PRODUCCION, estadoDelPeriodo } from "./stockDiario.js";
import { periodoApi, valorApi } from "./stockDiarioApi.js";
import { DIRECCION } from "./explicacionDelValor.js";
import { alcanceDeLaValorizacion, cantidadesDeLaCadena, costoCongeladoPorDia, diasValorizados, totalesDelValor, valorizarCadena } from "./valorDelStock.js";
import {
  ALTO_DEL_GRAFICO_PX,
  ESCALA_MINIMA,
  NOMBRE_VALOR_DEL_STOCK,
  avisosDeAtencion,
  barraDeCausa,
  causasDelCambio,
  consultaDelResumen,
  escalaDelGrafico,
  monedaConSigno,
  parseContextoStockDiario,
  porcentajeSobreApertura,
  puntasDelGrafico,
  puntosDeEvolucion,
  textoSinValor,
  textosDelCapital,
  trazoDelGrafico,
} from "./stockDiarioPantalla.js";
import CapitalEnMercaderia from "@/components/stock_diario/CapitalEnMercaderia.jsx";
import AtencionDelValor from "@/components/stock_diario/AtencionDelValor.jsx";
import GraficoDeEvolucion from "@/components/stock_diario/GraficoDeEvolucion.jsx";

const PC = { dia: PUNTO_CERO_PRODUCCION.dia, instante: PUNTO_CERO_PRODUCCION.instanteUTC };
const ACT = { dia: "2026-09-29", instante: "2026-09-29T03:17:54.566Z" };

let version = 0;
const vBase = (dia, precioCosto, x = {}) => ({ version: String(++version), productoBaseId: 3, tipo: "CAMBIO", dia, precioCosto: String(precioCosto), unidadMedida: "unidad", factorPack: null, pesoReferenciaKg: null, pesoEsFijo: false, modoCompraProveedor: "BULTO", modoVentaDeposito: "PESO", esCombo: false, ...x });
const vUbic = (dia, x = {}) => ({ version: String(++version), productoLocalId: 7, productoBaseId: 3, tipo: "PUNTO_CERO", dia, precioCosto: null, esDeposito: false, ...x });
/** Un grupo de `sqlEfectosPorOrigen`: delta en unidades, dirección por el signo. */
const g = (origen, delta, movimientos = 1) => ({ origen, direccion: delta > 0 ? DIRECCION.ENTRADA : DIRECCION.SALIDA, delta: Math.round(delta * 1000), movimientos });

/**
 * La respuesta del resumen para un período, armada por el motor.
 * `cadenas`: [{ alAbrir, cierres, bases, ubicaciones, efectos: { dia: [grupos] } }].
 */
function armar({ desde, hasta, hoy, cadenas, esDeposito = false }) {
  const periodo = estadoDelPeriodo({ desde, hasta, puntoCero: PC, hoy });
  const alcance = alcanceDeLaValorizacion({ periodo, puntoCeroStock: PC, activacionCostos: ACT });
  const dias = diasValorizados(alcance);
  const valoradas = cadenas.map((c, i) => {
    const { cantidadAlAbrir, cierres } = cantidadesDeLaCadena({ alAbrir: c.alAbrir, cierres: c.cierres ?? [] });
    const costoDelDia = costoCongeladoPorDia({ ubicaciones: c.ubicaciones ?? [vUbic("2026-09-29", { esDeposito })], basesPorId: new Map([[3, c.bases]]) });
    const efectosPorDia = new Map(Object.entries(c.efectos ?? {}));
    return { productoLocalId: i + 1, identidad: null, valor: dias.length ? valorizarCadena({ dias, cantidadAlAbrir, cierres, costoDelDia, efectosPorDia }) : null };
  });
  const v = { alcance, cadenas: valoradas, totales: dias.length ? totalesDelValor(valoradas, dias, { conExplicacion: true }) : null, transito: null };
  return { ok: true, local: { id: 1, nombre: "X", esDeposito }, ...periodoApi({ periodo, puntoCero: PC, hoy }, { unidad: "RANGO" }), valor: valorApi(v) };
}

const ADMIN = { permisos: ["*"] };
const SOLO_STOCK = { permisos: ["stock.ver"] };
const centavos = (x) => Math.round(x * 100);

test("el nombre visible es Valor del Stock", () => {
  assert.equal(NOMBRE_VALOR_DEL_STOCK, "Valor del Stock");
});

// ── LA TARJETA DEL CAPITAL ───────────────────────────────────────────────

test("la tarjeta: el valor final, el cambio con su % sobre la apertura, y la apertura; todo A COSTO", () => {
  const r = armar({
    desde: "2026-09-30",
    hasta: "2026-10-01",
    hoy: "2026-10-05",
    cadenas: [{ alAbrir: { cantidadPosterior: "20.000" }, bases: [vBase("2026-09-29", "1000.00"), vBase("2026-09-30", "1200.00")] }],
  });
  assert.deepEqual(textosDelCapital(r), {
    rotuloFinal: "Valor final",
    final: "$24.000,00",
    cambio: "+$4.000,00",
    porcentaje: "+20,0 %",
    apertura: "Apertura $20.000,00",
    transito: null,
  });
  const html = renderToStaticMarkup(React.createElement(CapitalEnMercaderia, { respuesta: r }));
  for (const s of [">Capital en mercadería<", ">A COSTO<", ">Valor final<", ">$24.000,00<", ">+$4.000,00<", ">+20,0 %<", ">Apertura $20.000,00<"]) assert.ok(html.includes(s), s);
  assert.ok(html.includes("data-grafico-evolucion"), "el gráfico va adentro de la tarjeta");
});

test("en curso dice 'Ahora'; un período recortado dice desde cuándo abre", () => {
  const hoy = armar({ desde: "2026-10-05", hasta: "2026-10-05", hoy: "2026-10-05", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }] });
  assert.equal(textosDelCapital(hoy).rotuloFinal, "Ahora");
  const recortado = armar({ desde: "2026-09-28", hasta: "2026-10-04", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }] });
  assert.equal(textosDelCapital(recortado).apertura, "Valor al abrir el 30/09 $10,00");
});

test("el % sobre la apertura, SOLO con una apertura positiva", () => {
  assert.equal(porcentajeSobreApertura(100, 116.84), "+16,8 %");
  assert.equal(porcentajeSobreApertura(200, 199.2), "−0,4 %");
  assert.equal(porcentajeSobreApertura(100, 100), "0,0 %");
  assert.equal(porcentajeSobreApertura(0, 50), null, "sobre cero no hay porcentaje");
  assert.equal(porcentajeSobreApertura(-30, -10), null, "sobre un capital negativo diría lo contrario");
  assert.equal(porcentajeSobreApertura(null, 10), null);
  // Y en la tarjeta: sin apertura positiva, sin píldora.
  const negativo = armar({ desde: "2026-09-30", hasta: "2026-09-30", hoy: "2026-10-05", cadenas: [{ alAbrir: { cantidadPosterior: "-3.000" }, bases: [vBase("2026-09-29", "10.00")] }] });
  assert.equal(textosDelCapital(negativo).porcentaje, null);
  assert.ok(!renderToStaticMarkup(React.createElement(CapitalEnMercaderia, { respuesta: negativo })).includes(" %<"));
});

test("una caída no se llama pérdida: en ningún texto dice ganancia ni pérdida", () => {
  const r = armar({
    desde: "2026-09-30",
    hasta: "2026-09-30",
    hoy: "2026-10-05",
    cadenas: [{ alAbrir: { cantidadPosterior: "10.000" }, cierres: [{ dia: "2026-09-30", tipo: "CAMBIO", cantidadPosterior: "4.000" }], bases: [vBase("2026-09-29", "100.00")], efectos: { "2026-09-30": [g("VENTA", -6, 4)] } }],
  });
  assert.equal(textosDelCapital(r).cambio, "−$600,00");
  assert.doesNotMatch(JSON.stringify([textosDelCapital(r), causasDelCambio(r), avisosDeAtencion(r, ADMIN)]), /p[ée]rdida|ganancia/i);
});

// ── LAS CAUSAS ───────────────────────────────────────────────────────────

/** Compra, venta, revalorización y reexpresión en el mismo período: todas las causas. */
const DE_TODO = () =>
  armar({
    desde: "2026-10-05",
    hasta: "2026-10-06",
    hoy: "2026-10-15",
    esDeposito: true,
    cadenas: [
      // Pack x6 a $600 → x12 el 05: reexpresión, y una venta de 12 u el 06.
      {
        alAbrir: { cantidadPosterior: "36.000" },
        cierres: [{ dia: "2026-10-06", tipo: "CAMBIO", cantidadPosterior: "24.000" }],
        bases: [vBase("2026-10-01", "600.00", { unidadMedida: "pack", factorPack: 6 }), vBase("2026-10-05", "600.00", { unidadMedida: "pack", factorPack: 12 })],
        ubicaciones: [vUbic("2026-10-01", { esDeposito: true })],
        efectos: { "2026-10-06": [g("VENTA", -12, 3)] },
      },
      // $33,33 → $41,17 el 05 (revalorización) y una compra de 20 u el 06.
      {
        alAbrir: { cantidadPosterior: "10.000" },
        cierres: [{ dia: "2026-10-06", tipo: "CAMBIO", cantidadPosterior: "30.000" }],
        bases: [vBase("2026-10-01", "33.33"), vBase("2026-10-05", "41.17")],
        ubicaciones: [vUbic("2026-10-01", { esDeposito: true })],
        efectos: { "2026-10-06": [g("COMPRA_PROVEEDOR", 20)] },
      },
    ],
  });

test("las causas suman EXACTAMENTE el cambio total: final − inicial, al centavo", () => {
  const r = DE_TODO();
  const c = causasDelCambio(r);
  const claves = c.filas.map((f) => f.clave).sort();
  assert.deepEqual(claves, ["COMPRAS", "REEXPRESION", "REVALORIZACION", "VENTAS"], "faltan causas");
  assert.equal(r.valor.cuadra, true);
  assert.equal(centavos(c.suma), centavos(r.valor.final) - centavos(r.valor.inicial));
  assert.equal(c.cambio, c.suma);
  assert.equal(c.filas.reduce((s, f) => s + centavos(f.importe), 0), centavos(c.cambio));
  assert.ok(!c.filas.some((f) => /físico/i.test(f.rotulo)), "el movimiento físico no va aparte");
});

test("CONTRAPRUEBA: sin la revalorización las causas NO suman el cambio", () => {
  const r = DE_TODO();
  const sinReval = causasDelCambio({ ...r, valor: { ...r.valor, revalorizacion: undefined } });
  assert.notEqual(centavos(sinReval.suma), centavos(sinReval.cambio));
});

test("las causas van de mayor a menor |importe|, sea que sumen o resten", () => {
  const c = causasDelCambio(DE_TODO());
  const abs = c.filas.map((f) => Math.abs(f.importe));
  assert.deepEqual(abs, [...abs].sort((a, b) => b - a), c.filas.map((f) => `${f.clave} ${f.importe}`).join(" | "));
  assert.ok(c.filas.some((f) => f.importe < 0) && c.filas.some((f) => f.importe > 0), "el caso tiene que mezclar signos");
  assert.equal(c.mayor, abs[0]);
});

test("reexpresión solo si hubo; la revalorización siempre, aunque sea cero", () => {
  const sin = causasDelCambio(armar({ desde: "2026-10-05", hasta: "2026-10-06", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-10-01", "10.00")] }] }));
  assert.ok(!sin.filas.some((f) => f.clave === "REEXPRESION"));
  assert.deepEqual(sin.filas.find((f) => f.clave === "REVALORIZACION").texto, "$0,00");
});

test("la barra: |importe| / el mayor |importe| de la media pista, hacia el lado de su signo", () => {
  assert.deepEqual(barraDeCausa(500, 1000), { lado: "derecha", fraccion: 0.5 });
  assert.deepEqual(barraDeCausa(-1000, 1000), { lado: "izquierda", fraccion: 1 });
  assert.deepEqual(barraDeCausa(-0.01, 1000000), { lado: "izquierda", fraccion: 1e-8 }, "chiquita pero con lado: se dibuja con el mínimo de 2 px");
  assert.deepEqual(barraDeCausa(0, 1000), { lado: null, fraccion: 0 }, "cero: sin barra");
  assert.deepEqual(barraDeCausa(10, 0), { lado: null, fraccion: 0 });
  const c = causasDelCambio(DE_TODO());
  assert.equal(c.filas[0].barra.fraccion, 1, "la mayor ocupa la media pista");
  for (const f of c.filas) assert.equal(f.barra.lado, f.importe > 0 ? "derecha" : f.importe < 0 ? "izquierda" : null);
});

// ── ATENCIÓN ─────────────────────────────────────────────────────────────

test("atención: negativo con enlace a Stock, sin costo sin enlace; y sin nada, no hay caja", () => {
  const r = armar({
    desde: "2026-09-30",
    hasta: "2026-09-30",
    hoy: "2026-10-05",
    cadenas: [
      { alAbrir: { cantidadPosterior: "5.000" }, bases: [vBase("2026-09-29", "0.00")] },
      { alAbrir: { cantidadPosterior: "-3.000" }, bases: [vBase("2026-09-29", "10.00")] },
    ],
  });
  assert.deepEqual(avisosDeAtencion(r, SOLO_STOCK), [
    { clave: "negativo", titulo: "1 producto con stock negativo", explicacion: "Se valorizan como están y restan del total", enlace: { texto: "Stock", href: "/modulos/stock_locales" } },
    { clave: "sinCosto", titulo: "1 producto sin costo", explicacion: "No están sumados en el total", enlace: null },
  ]);
  assert.equal(avisosDeAtencion(r, { permisos: [] })[0].enlace, null, "sin stock.ver, sin enlace");
  // Solo el negativo entra en el total: −3 × $10, con el menos tipográfico.
  assert.equal(textosDelCapital(r).final, "−$30,00");

  const recortado = armar({ desde: "2026-09-28", hasta: "2026-10-04", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }] });
  assert.deepEqual(avisosDeAtencion(recortado, ADMIN).map((a) => [a.titulo, a.enlace]), [["Hay costos históricos desde el 30/09", null]]);

  const limpio = armar({ desde: "2026-10-05", hasta: "2026-10-05", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }] });
  assert.deepEqual(avisosDeAtencion(limpio, ADMIN), []);
  assert.equal(renderToStaticMarkup(React.createElement(AtencionDelValor, { respuesta: limpio })), "", "sin avisos no se dibuja la caja");
  assert.ok(renderToStaticMarkup(React.createElement(AtencionDelValor, { respuesta: r })).includes(">Atención<"));
});

test("atención: la cuenta que no cierra se dice, sin enlace", () => {
  const r = armar({ desde: "2026-10-05", hasta: "2026-10-05", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }] });
  const roto = { ...r, valor: { ...r.valor, cuadra: false } };
  assert.ok(avisosDeAtencion(roto, ADMIN).some((a) => a.titulo === "La cuenta no cierra" && a.enlace === null));
});

// ── EL GRÁFICO ───────────────────────────────────────────────────────────

const UNO = [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [vBase("2026-09-29", "10.00")] }];

test("los puntos: la apertura y el cierre de cada día; en el día, dos; en el año, uno por mes", () => {
  const dia = armar({ desde: "2026-10-05", hasta: "2026-10-05", hoy: "2026-10-05", cadenas: UNO });
  assert.equal(puntosDeEvolucion(dia.valor).length, 2, "apertura y ahora");
  const semana = armar({ desde: "2026-10-05", hasta: "2026-10-11", hoy: "2026-10-20", cadenas: UNO });
  assert.equal(puntosDeEvolucion(semana.valor).length, 8);
  const anio = armar({ desde: "2026-01-01", hasta: "2026-12-31", hoy: "2026-12-31", cadenas: UNO });
  assert.equal(puntosDeEvolucion(anio.valor).length, 1 + 4, "la apertura y septiembre a diciembre");
  assert.deepEqual(puntosDeEvolucion({ inicial: 10, evolucion: [] }), [], "sin evolución no se dibuja");
});

test("la escala cubre como mínimo ±3 % de la apertura, más un 10 % de aire: un stock estable se ve plano", () => {
  const apertura = 1000000;
  const estable = [apertura, apertura + 50, apertura - 20];
  const e = escalaDelGrafico(estable, apertura);
  const cubre = apertura * ESCALA_MINIMA;
  assert.ok(e.min <= apertura - cubre && e.max >= apertura + cubre, JSON.stringify(e));
  assert.equal(Math.round(e.max - e.min), Math.round(2 * cubre * 1.2), "±3 % y 10 % de aire de cada lado");
  // Plano de verdad: la diferencia entre los puntos es una fracción del alto.
  const ys = trazoDelGrafico(estable, e, 300).map((p) => p.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < ALTO_DEL_GRAFICO_PX * 0.01, ys.join());
  // CONTRAPRUEBA: sin el mínimo, los mismos $70 llenarían el alto.
  const sinMinimo = { min: Math.min(...estable), max: Math.max(...estable) };
  const ysSin = trazoDelGrafico(estable, sinMinimo, 300).map((p) => p.y);
  assert.ok(Math.max(...ysSin) - Math.min(...ysSin) > ALTO_DEL_GRAFICO_PX * 0.9);
  // Un salto grande excede el mínimo y la escala lo sigue.
  const salto = escalaDelGrafico([apertura, apertura * 1.5], apertura);
  assert.ok(salto.max > apertura * 1.5);
  // Apertura en cero: no divide por cero.
  const cero = escalaDelGrafico([0, 0], 0);
  assert.ok(cero.max > cero.min);
});

test("las puntas: el primer día abreviado, y 'ahora' si el período sigue", () => {
  assert.deepEqual(puntasDelGrafico({ desde: "2026-09-27", hasta: "2026-09-30", enCurso: true }), { desde: "dom 27", hasta: "ahora · mié 30" });
  assert.deepEqual(puntasDelGrafico({ desde: "2026-09-27", hasta: "2026-09-30", enCurso: false }), { desde: "dom 27", hasta: "mié 30" });
});

test("el gráfico se dibuja con el tema y sin librerías; sin evolución, nada", () => {
  const semana = armar({ desde: "2026-10-05", hasta: "2026-10-11", hoy: "2026-10-20", cadenas: UNO });
  const html = renderToStaticMarkup(React.createElement(GraficoDeEvolucion, { valor: semana.valor }));
  assert.match(html, /<svg[^>]*height="72"/);
  assert.match(html, /sunmi-text-accent/);
  assert.match(html, /stroke="currentColor"/);
  assert.equal((html.match(/<circle/g) || []).length, 2, "punto en la apertura y en el último valor");
  assert.equal(renderToStaticMarkup(React.createElement(GraficoDeEvolucion, { valor: { ...semana.valor, evolucion: [] } })), "");
});

// ── SIN VALOR Y LO QUE NO CAMBIÓ ─────────────────────────────────────────

test("sin costos históricos no hay tablero: se explica y no se muestra cero", () => {
  const r = armar({ desde: "2026-09-29", hasta: "2026-09-29", hoy: "2026-10-15", cadenas: [{ alAbrir: { cantidadPosterior: "1.000" }, bases: [] }] });
  assert.equal(textosDelCapital(r), null);
  const s = textoSinValor(r);
  assert.equal(s.titulo, "Sin valor para este período");
  assert.match(s.detalle, /miércoles 30 de septiembre/);
  assert.match(s.detalle, /no es cero/);
  assert.equal(r.valor.inicial, null);
});

test("Año se pide con unidad ANIO, que la API ya acepta", () => {
  const ctx = parseContextoStockDiario({ unidad: "anio", fecha: "2026-10-01" });
  assert.equal(ctx.unidad, "ANIO");
  assert.equal(consultaDelResumen(ctx), "unidad=ANIO&fecha=2026-10-01");
});

test("monedaConSigno: el menos tipográfico, y la raya sin valor", () => {
  assert.deepEqual([monedaConSigno(1200), monedaConSigno(-36), monedaConSigno(0), monedaConSigno(null)], ["+$1.200,00", "−$36,00", "$0,00", "—"]);
});
