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

import { existsSync as fs_existe, readFileSync } from "node:fs";
import { CATEGORIA, DIRECCION, categoriaDelOrigen } from "./explicacionDelValor.js";
import { SIN_ORIGEN } from "./libroStock.js";
import { parseReturnParams } from "@/lib/reportes-ventas/returnParams";
import { cantidadesDeLaCadena, costoCongeladoPorDia, totalesDelValor, valorizarCadena } from "./valorDelStock.js";
import { ESTADO_VALOR, escalaDelMomento } from "./valorDelStock.js";
import { identidadApi, valorApi, movimientoDeCategoriaApi, transferenciaDelValorApi } from "./stockDiarioApi.js";
import { identidadMostrada } from "./stockDiario.js";
import {
  DESTINO_DE_CATEGORIA,
  DESTINO_DE_TRANSFERENCIA,
  TEXTO_A_COSTO,
  TEXTO_CUANDO_CUENTA,
  consultaDeCategoria,
  consultaDeTransferencias,
  documentoDelMovimiento,
  enlaceDeCategoria,
  enlaceDeTransferencia,
  parseContextoStockDiario,
  renglonDeMovimiento,
  renglonDeTransferencia,
  textosDePorQueCambio,
} from "./stockDiarioPantalla.js";
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

test("12-14. SIN_ORIGEN se ve como movimientos anteriores a la trazabilidad, con su efecto y su explicación, sin detalle ni enlace", () => {
  const r = respuesta([g(SIN_ORIGEN, -24), g("VENTA", -1)], { abre: 120, cierra: 95 });
  const t = textosDePorQueCambio(r);
  const f = t.filas.find((x) => x.clave === CATEGORIA.SIN_CLASIFICAR);
  assert.equal(f.rotulo, "Movimientos anteriores a la trazabilidad");
  assert.equal(f.importe, "−$2.400,00");
  assert.equal(f.detalle, "1 movimiento");
  assert.equal(f.explicacion, "El stock cambió antes de que el ERP empezara a registrar el origen de cada movimiento.");
  assert.equal(f.abreTransferencias, false);
  assert.equal(enlaceDeCategoria(f.clave, r, ADMIN), null, "no lleva a ningún listado");
  assert.equal(t.aviso, null, "ya no es un aviso de algo perdido: la fila lo explica");
  // En la base sigue siendo lo que es: no se reclasifica.
  assert.equal(categoriaDelOrigen(SIN_ORIGEN), CATEGORIA.SIN_CLASIFICAR);
  assert.equal(r.valor.explicacion.sinClasificar.movimientos, 1);
  const html = renderToStaticMarkup(React.createElement(PorQueCambio, { respuesta: r, ctx: parseContextoStockDiario({}) }));
  assert.ok(html.includes("Movimientos anteriores a la trazabilidad") && !html.includes("Sin clasificar"), html);
  assert.ok(!html.includes("Ver ›"), "ninguna de estas filas abre un listado");
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

// ── #118 · RESUMEN DEL CAPITAL, NO COPIA DE LOS MÓDULOS ──────────────────

/** Perfiles como los da `UserContext`: el admin tiene `*`. */
const ADMIN = { permisos: ["*"] };
const CON = (...permisos) => ({ permisos: ["stock.ver", ...permisos] });
const SOLO_STOCK = CON();
const codigoSinComentarios = (ruta) => readFileSync(ruta, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

test("1. dice, arriba y a la vista, que todo es a costo y que cuenta cuando cambió el stock", () => {
  assert.equal(TEXTO_A_COSTO, "Los importes muestran cómo cambió el valor de tu mercadería a costo. No son precios de venta.");
  assert.match(TEXTO_CUANDO_CUENTA, /el día en que cambió el stock de esta ubicación/);
  const r = respuesta([g("VENTA", -3)], { abre: 100, cierra: 97 });
  const html = renderToStaticMarkup(React.createElement(PorQueCambio, { respuesta: r, ctx: parseContextoStockDiario({}) }));
  const aCosto = html.indexOf(TEXTO_A_COSTO);
  assert.ok(aCosto > 0 && aCosto < html.indexOf("Ventas"), "el texto va antes de la primera categoría");
  assert.ok(html.includes(TEXTO_CUANDO_CUENTA));
});

test("10-11. Ventas y Compras no abren un listado de movimientos: llevan a su módulo, y solo con su permiso", () => {
  const r = respuesta([g("COMPRA_PROVEEDOR", 24), g("VENTA", -3)], { abre: 100, cierra: 121 });
  const t = textosDePorQueCambio(r);
  for (const f of t.filas) assert.equal(f.abreTransferencias, false, `${f.clave} se abre`);
  const html = renderToStaticMarkup(React.createElement(PorQueCambio, { respuesta: r, ctx: parseContextoStockDiario({}) }));
  assert.ok(!html.includes("Ver ›"), "una fila de Ventas o Compras se volvió a abrir");
  // La pantalla ya no pide el listado por categoría.
  const fuente = codigoSinComentarios("components/stock_diario/PorQueCambio.jsx");
  assert.doesNotMatch(fuente, /diario\/movimientos|consultaDeCategoria|renglonDeMovimiento/);

  // Ventas: el reporte con la ubicación y los días valorizados, que el reporte entiende.
  const v = enlaceDeCategoria(CATEGORIA.VENTAS, r, CON("reportes.ver"));
  assert.equal(v.texto, "Ir a Ventas");
  const [ruta, qs] = v.href.split("?");
  assert.equal(ruta, "/modulos/reportes-ventas");
  assert.deepEqual(parseReturnParams(new URLSearchParams(qs)), { tab: "venta", fechaDesde: D, fechaHasta: D, localId: 1 });
  assert.equal(enlaceDeCategoria(CATEGORIA.VENTAS, r, SOLO_STOCK), null, "sin reportes.ver no hay enlace");
  // Compras: el historial, que no recibe período ni ubicación.
  assert.deepEqual(enlaceDeCategoria(CATEGORIA.COMPRAS, r, CON("compras.ver")), { texto: "Ir a Compras", href: "/modulos/compras-proveedor/historial" });
  assert.equal(enlaceDeCategoria(CATEGORIA.COMPRAS, r, SOLO_STOCK), null);
  assert.ok(enlaceDeCategoria(CATEGORIA.COMPRAS, r, ADMIN), "el admin abre todo, como en esas pantallas");
  // Sin módulo dueño, solo el resumen.
  for (const c of [CATEGORIA.AJUSTES, CATEGORIA.ALTAS_Y_BAJAS, CATEGORIA.OTROS, CATEGORIA.SIN_CLASIFICAR, CATEGORIA.TRANSFERENCIAS]) assert.equal(enlaceDeCategoria(c, r, ADMIN), null, c);
});

test("8-9. el enlace de cada destino pide el MISMO permiso que la guarda de su pantalla", () => {
  const destinos = [
    [DESTINO_DE_CATEGORIA.VENTAS, "app/modulos/reportes-ventas/page.jsx"],
    [DESTINO_DE_CATEGORIA.COMPRAS, "app/modulos/compras-proveedor/historial/page.jsx"],
    [DESTINO_DE_TRANSFERENCIA, "app/modulos/transferencias/[id]/page.jsx"],
  ];
  for (const [d, pagina] of destinos) {
    assert.ok(pagina.startsWith(`app${d.ruta}`), `${d.ruta} no es la ruta de ${pagina}`);
    const guarda = codigoSinComentarios(pagina);
    assert.ok(guarda.includes(`.includes("${d.permiso}")`), `${pagina} ya no pide ${d.permiso}: el enlace terminaría en "sin permisos"`);
    assert.ok(guarda.includes('.includes("*")'), `${pagina} cambió cómo reconoce al admin`);
    assert.ok(guarda.includes("<SinPermisos"), `${pagina} ya no frena sin permiso`);
  }
});

test("8-9. una transferencia lleva a su detalle real; sin transferencias.ver no hay enlace", () => {
  const t = transferenciaDelValorApi({ id: 319, existe: true, estado: "Recibida", origen: { id: 9, nombre: "Depósito" }, destino: { id: 1, nombre: "Casiano" }, diaEnvio: "2026-09-29", diaRecepcion: "2026-09-30", diaCancelacion: null, movimientos: 3, sinCosto: 0, entradas: 116927275, salidas: 0, neto: 116927275 });
  assert.deepEqual(enlaceDeTransferencia(t, CON("transferencias.ver")), { texto: "Ir a transferencia", href: "/modulos/transferencias/319" });
  assert.ok(fs_existe("app/modulos/transferencias/[id]/page.jsx"));
  assert.equal(enlaceDeTransferencia(t, SOLO_STOCK), null);
  assert.equal(enlaceDeTransferencia(t, null), null);
  assert.equal(enlaceDeTransferencia({ ...t, existe: false }, ADMIN), null, "una referencia que no resuelve no lleva a ningún lado");
});

test("2-3. cada transferencia dice de dónde vino y cuándo se envió y se recibió, con su impacto a costo", () => {
  const r = { local: { id: 1 } };
  const base = { existe: true, estado: "Recibida", origen: { id: 9, nombre: "Depósito" }, destino: { id: 1, nombre: "Casiano" }, movimientos: 1, sinCosto: 0, entradas: 0, salidas: 0, diaCancelacion: null };
  // Enviada el día anterior y recibida hoy.
  assert.deepEqual(renglonDeTransferencia(transferenciaDelValorApi({ ...base, id: 319, diaEnvio: "2026-09-29", diaRecepcion: "2026-09-30", neto: 116927275 }), r), {
    titulo: "Transferencia #319",
    contraparte: "Desde Depósito",
    linea: "Enviada 29/09 · Recibida 30/09",
    importe: "+$1.169.272,75",
  });
  // Enviada y recibida el mismo día.
  assert.equal(renglonDeTransferencia(transferenciaDelValorApi({ ...base, id: 327, diaEnvio: "2026-09-30", diaRecepcion: "2026-09-30", neto: 57616910 }), r).linea, "Enviada 30/09 · Recibida 30/09");
  // 6. Vista desde el origen: hacia dónde, sin recibir todavía, y en negativo.
  const enviada = renglonDeTransferencia(transferenciaDelValorApi({ ...base, id: 330, origen: { id: 1, nombre: "Casiano" }, destino: { id: 4, nombre: "Centro" }, diaEnvio: "2026-09-30", diaRecepcion: null, neto: -40000, sinCosto: 2 }), r);
  assert.deepEqual([enviada.contraparte, enviada.linea, enviada.importe], ["Hacia Centro", "Enviada 30/09 · Sin recibir · 2 sin costo", "−$400,00"]);
  // Cancelada: lo dice en vez de "sin recibir".
  assert.equal(renglonDeTransferencia(transferenciaDelValorApi({ ...base, id: 331, diaEnvio: "2026-09-29", diaRecepcion: null, diaCancelacion: "2026-09-30", neto: 0 }), r).linea, "Enviada 29/09 · Cancelada 30/09");
  // Una referencia que no resuelve se dice, con su importe: no se esconde.
  assert.deepEqual(renglonDeTransferencia(transferenciaDelValorApi({ id: null, existe: false, movimientos: 1, sinCosto: 0, entradas: 0, salidas: -100, neto: -100 }), r), { titulo: "Sin transferencia registrada", linea: "No se encontró la transferencia", importe: "−$1,00" });
});

test("15-18. las transferencias se piden con el mismo período de la pantalla: día, semana, mes y personalizado", () => {
  for (const unidad of ["DIA", "SEMANA", "MES"]) {
    const qs = new URLSearchParams(consultaDeTransferencias(parseContextoStockDiario({ unidad, fecha: "2026-09-30", localId: "4" })));
    assert.deepEqual([qs.get("unidad"), qs.get("fecha"), qs.get("localId")], [unidad, "2026-09-30", "4"], unidad);
  }
  const otro = new URLSearchParams(consultaDeTransferencias(parseContextoStockDiario({ unidad: "OTRO", desde: "2026-09-29", hasta: "2026-10-01" })));
  assert.deepEqual([otro.get("desde"), otro.get("hasta")], ["2026-09-29", "2026-10-01"]);
});

test("Transferencias es la única fila que se abre, y abre transferencias, no productos", () => {
  const r = respuesta([g("TRANSFERENCIA_RECEPCION", 12, 3), g("VENTA", -2)], { abre: 100, cierra: 110 });
  const t = textosDePorQueCambio(r);
  assert.deepEqual(t.filas.map((f) => [f.clave, f.abreTransferencias]), [["VENTAS", false], ["TRANSFERENCIAS", true]]);
  const fuente = codigoSinComentarios("components/stock_diario/PorQueCambio.jsx");
  assert.match(fuente, /\/api\/stock_locales\/diario\/transferencias\?/);
  // 19. Sin anchos fijos: la fila se encoge a la izquierda y el importe no se parte.
  assert.doesNotMatch(fuente, /[\s"'`]w-(\[|\d)|min-w-\[/);
  assert.match(fuente, /min-w-0 flex-1/);
  assert.match(fuente, /shrink-0/);
});
