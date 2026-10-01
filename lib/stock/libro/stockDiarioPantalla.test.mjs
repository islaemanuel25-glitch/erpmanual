// CANDADO: LA PANTALLA DEL STOCK DIARIO, LA PARTE PURA.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/stockDiarioPantalla.test.mjs
//
// Qué se le pide a la API, cómo se navega y qué dice cada renglón. Los
// productos de prueba NO se escriben a mano: salen de `stockDeCadena` y
// `cadenaApi`, el mismo camino que recorre la ruta, así la forma es la real
// (regla 2 de CLAUDE.md: un fixture plausible que el endpoint nunca manda deja
// un candado verde que no cubre nada).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ESTADO_DEL_DIA,
  EXISTENCIA,
  PUNTO_CERO_PRODUCCION,
  estadoDelPeriodo,
  movidoDesdeAgregado,
  stockDeCadena,
} from "./stockDiario.js";
import { cadenaApi, periodoApi } from "./stockDiarioApi.js";
import {
  PERMISO_STOCK_DIARIO,
  RUTA_STOCK_DIARIO,
  TEXTO_NO_DISPONIBLE,
  TEXTO_NO_EXISTE,
  consultaDelResumen,
  contextoAnterior,
  contextoSiguiente,
  parseContextoStockDiario,
  puedeAvanzar,
  puedeRetroceder,
  renglonDeProducto,
  textoFueraDeHistoria,
  textosDelNavegador,
  urlDeStockDiario,
  variacionDe,
} from "./stockDiarioPantalla.js";

const PC = { dia: PUNTO_CERO_PRODUCCION.dia, instante: PUNTO_CERO_PRODUCCION.instanteUTC };
const HOY = "2026-10-05";
const leer = (qs) => Object.fromEntries(new URLSearchParams(qs));

/** Una respuesta de la API con la forma de `periodoApi`. */
function respuesta(desde, hasta = desde, { unidad = "DIA", hoy = HOY } = {}) {
  const periodo = estadoDelPeriodo({ desde, hasta, puntoCero: PC, hoy });
  return { ok: true, ...periodoApi({ periodo, puntoCero: PC, hoy }, { unidad, fecha: desde, desde, hasta }) };
}

/** Una fila de `/productos`, armada por el motor. */
function fila(r, { antes = null, hasta = null, movido = {}, identidad = {} } = {}) {
  const periodo = estadoDelPeriodo({ desde: r.periodo.desde, hasta: r.periodo.hasta, puntoCero: PC, hoy: r.hoy });
  const ultimo = (x) => (x ? { tipo: x.tipo ?? "CAMBIO", cantidadPosterior: x.cantidad, enTransitoPosterior: x.enTransito ?? "0", cantidadAnterior: x.cantidad, enTransitoAnterior: x.enTransito ?? "0" } : null);
  const c = stockDeCadena({
    localId: 1,
    productoLocalId: 7,
    periodo,
    ultimoAntes: periodo.aperturaConocida ? ultimo(antes) : null,
    ultimoHasta: ultimo(hasta),
    movido: movidoDesdeAgregado(movido),
    identidad: { productoBaseId: 3, nombre: "Coca-Cola 2,25 L", codigoBarra: "779", unidadMedida: "unidad", fuente: "ACTUAL", productoEliminado: false, ...identidad },
  });
  return cadenaApi(c);
}

// ── EL CONTEXTO Y LAS CONSULTAS ─────────────────────────────────────────

test("la pantalla vive en Finanzas y se autoriza como siempre: stock.ver", () => {
  assert.equal(RUTA_STOCK_DIARIO, "/modulos/finanzas/stock-diario");
  assert.equal(PERMISO_STOCK_DIARIO, "stock.ver");
});

test("Día, Semana y Mes se piden con unidad y fecha; sin fecha, el servidor usa hoy", () => {
  assert.deepEqual(leer(consultaDelResumen(parseContextoStockDiario({}))), { unidad: "DIA" });
  assert.deepEqual(leer(consultaDelResumen(parseContextoStockDiario({ unidad: "semana", fecha: "2026-09-30" }))), { unidad: "SEMANA", fecha: "2026-09-30" });
  assert.deepEqual(leer(consultaDelResumen(parseContextoStockDiario({ unidad: "MES", fecha: "basura" }))), { unidad: "MES" });
});

test("Otro es el rango de la API: desde y hasta, sin unidad; sin las dos fechas no se pide nada", () => {
  const ctx = parseContextoStockDiario({ unidad: "OTRO", desde: "2026-09-28", hasta: "2026-10-02" });
  assert.deepEqual(leer(consultaDelResumen(ctx)), { desde: "2026-09-28", hasta: "2026-10-02" });
  assert.equal(consultaDelResumen(parseContextoStockDiario({ unidad: "OTRO", desde: "2026-09-28" })), null);
  assert.equal(urlDeStockDiario(ctx), `${RUTA_STOCK_DIARIO}?unidad=OTRO&desde=2026-09-28&hasta=2026-10-02`);
  // Y un rango no tiene vecinos: no hay flechas.
  const r = respuesta("2026-09-28", "2026-10-02", { unidad: "RANGO" });
  assert.equal(puedeRetroceder(ctx, r), false);
  assert.equal(puedeAvanzar(ctx, r), false);
});

test("SEMANA OPERATIVA: las flechas usan las puntas que devolvió el servidor, no una semana calculada acá", () => {
  // Una semana de miércoles a martes —corte miércoles—, como la armaría el servidor.
  const ctx = parseContextoStockDiario({ unidad: "SEMANA", fecha: "2026-09-30" });
  const r = respuesta("2026-09-30", "2026-10-06", { unidad: "SEMANA", hoy: "2026-10-10" });
  assert.equal(contextoAnterior(ctx, r).fecha, "2026-09-29", "el día antes del miércoles de corte");
  assert.equal(contextoSiguiente(ctx, r).fecha, "2026-10-07", "el día después del martes");
  assert.equal(contextoAnterior(ctx, r).unidad, "SEMANA");
});

test("no se avanza al futuro: la flecha se apaga cuando el período llega a hoy", () => {
  const ctx = parseContextoStockDiario({});
  assert.equal(puedeAvanzar(ctx, respuesta(HOY)), false);
  assert.equal(puedeAvanzar(ctx, respuesta("2026-10-01")), true);
  assert.equal(puedeRetroceder(ctx, respuesta(HOY)), true);
});

// ── LOS ESTADOS DEL PERÍODO ─────────────────────────────────────────────

test("EN_CURSO: 'Hoy · en curso', desde las 00:00, y las filas dicen Apertura → Ahora", () => {
  const r = respuesta(HOY);
  assert.equal(r.estado, ESTADO_DEL_DIA.EN_CURSO);
  assert.deepEqual(textosDelNavegador(r), { titulo: "Hoy · en curso", subtitulo: "lunes 5 de octubre · desde las 00:00" });
  const f = renglonDeProducto(fila(r, { antes: { cantidad: "18" }, hasta: { cantidad: "22" } }), r);
  // La presentación de Stock Locales: unidades físicas, "uds". Hasta el
  // 2026-09-30 esto decía "18 UNIDAD": la unidad de medida pegada al número,
  // que en un pack mentía por el factor (ver `cantidadesDelLibro.test.mjs`).
  assert.equal(f.linea, "Apertura 18 uds → Ahora 22 uds");
  assert.equal(f.variacion, "+4 uds");
});

test("COMPLETO: el día por su nombre, 'día completo', y Apertura → Cierre", () => {
  const r = respuesta("2026-09-29");
  assert.equal(r.estado, ESTADO_DEL_DIA.COMPLETO);
  assert.deepEqual(textosDelNavegador(r), { titulo: "Martes 29 de septiembre", subtitulo: "día completo" });
  const f = renglonDeProducto(fila(r, { antes: { cantidad: "3.8" }, hasta: { cantidad: "2.95" } , identidad: { unidadMedida: "kg" } }), r);
  // El kilo con tres decimales, como `formatCantidad` de Stock Locales.
  assert.equal(f.linea, "Apertura 3.800 kg → Cierre 2.950 kg");
  assert.equal(f.variacion, "−0.850 kg");
});

test("PARCIAL: la apertura es 'No disponible' y no hay variación — nunca un cero", () => {
  const r = respuesta(PC.dia);
  assert.equal(r.estado, ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO);
  assert.deepEqual(textosDelNavegador(r), { titulo: "Domingo 27 de septiembre", subtitulo: "parcial · historial desde las 21:19" });
  const item = fila(r, { antes: { cantidad: "99" }, hasta: { cantidad: "18" } });
  assert.equal(item.apertura.existencia, EXISTENCIA.DESCONOCIDA, "el motor no deja pasar la apertura anterior al punto cero");
  assert.equal(item.apertura.cantidad, null);
  const f = renglonDeProducto(item, r);
  assert.equal(f.linea, `Apertura ${TEXTO_NO_DISPONIBLE} → Cierre 18 uds`);
  assert.equal(f.variacion, null);
  assert.ok(f.avisos.includes("Sin variación: falta la apertura"));
  assert.ok(!/\b0 uds/.test(f.linea));
});

test("FUERA DE HISTORIA: ni conteos ni filas; se dice desde cuándo hay registro y que no es cero", () => {
  const r = respuesta("2026-09-26");
  assert.equal(r.estado, ESTADO_DEL_DIA.FUERA_DE_HISTORIA);
  assert.deepEqual(textosDelNavegador(r), { titulo: "Sábado 26 de septiembre", subtitulo: "fuera de historia" });
  assert.deepEqual(textoFueraDeHistoria(r), {
    titulo: "Sin historial de stock para este día",
    detalle: "El registro de stock empieza el domingo 27/09 a las 21:19. Antes de esa hora no hay datos de ningún producto: no es cero.",
  });
  // Sin libro: tampoco se inventa una fecha.
  assert.match(textoFueraDeHistoria({ ...r, puntoCero: null }).detalle, /todavía no empezó/);
});

test("un período de varios días: su rango, y el aviso según esté en curso o parcial", () => {
  const semana = respuesta("2026-09-28", "2026-10-04", { unidad: "SEMANA" });
  assert.deepEqual(textosDelNavegador(semana), { titulo: "28/09 al 04/10", subtitulo: "período completo" });
  const enCurso = respuesta("2026-10-01", "2026-10-31", { unidad: "MES" });
  assert.equal(textosDelNavegador(enCurso).subtitulo, "en curso · hasta hoy, 05/10");
  const parcial = respuesta("2026-09-01", "2026-09-30", { unidad: "MES" });
  assert.equal(textosDelNavegador(parcial).subtitulo, "parcial · historial desde el domingo 27 de septiembre a las 21:19");
});

// ── UN PRODUCTO ─────────────────────────────────────────────────────────

test("PRODUCTO ELIMINADO: 'Ahora No existe', sin variación; nunca 'Ahora 0'", () => {
  const r = respuesta(HOY);
  const item = fila(r, { antes: { cantidad: "5" }, hasta: { tipo: "BAJA", cantidad: "5" }, identidad: { productoEliminado: true } });
  assert.equal(item.cierre.existencia, EXISTENCIA.NO_EXISTE);
  assert.equal(item.cierre.cantidad, null);
  const f = renglonDeProducto(item, r);
  assert.equal(f.linea, `Apertura 5 uds → Ahora ${TEXTO_NO_EXISTE}`);
  assert.equal(f.variacion, null, "no se resta contra un cero inventado");
  assert.deepEqual(f.avisos, ["Producto eliminado"]);
  // Y en un período completo, "Cierre No existe".
  const rc = respuesta("2026-09-29");
  assert.equal(renglonDeProducto(fila(rc, { antes: { cantidad: "5" }, hasta: { tipo: "BAJA", cantidad: "5" }, identidad: { productoEliminado: true } }), rc).linea, `Apertura 5 uds → Cierre ${TEXTO_NO_EXISTE}`);
});

test("un producto que apareció en el período: 'Apertura No existe', sin variación, y se avisa", () => {
  const r = respuesta("2026-09-29");
  const item = fila(r, { antes: null, hasta: { tipo: "ALTA", cantidad: "7" }, movido: { altas: 1 } });
  const f = renglonDeProducto(item, r);
  assert.equal(f.linea, `Apertura ${TEXTO_NO_EXISTE} → Cierre 7 uds`);
  assert.equal(f.variacion, null);
  assert.ok(f.avisos.includes("Apareció en el período"));
});

test("tránsito, sin clasificar y reinterpretado: los avisos de la fila salen de la API", () => {
  const r = respuesta(HOY);
  const conTransito = fila(r, { antes: { cantidad: "12" }, hasta: { cantidad: "12", enTransito: "6" } });
  const f = renglonDeProducto(conTransito, r);
  assert.equal(f.variacion, "0");
  assert.deepEqual(f.avisos, ["En tránsito 6 uds"]);
  // Antes esta fila traía `unidad: "pieza"`, que no es un valor del enum
  // `UnidadMedida` y el endpoint nunca manda: la pieza es una LECTURA del kilo en
  // el depósito, no una unidad de medida.
  const sinClasificar = renglonDeProducto({ ...fila(r, { antes: { cantidad: "3" }, hasta: { cantidad: "2" } }), sinClasificar: 1 }, r);
  assert.deepEqual([sinClasificar.variacion, sinClasificar.avisos], ["−1 uds", ["1 movimiento sin clasificar"]]);
  assert.ok(renglonDeProducto({ ...conTransito, reinterpretada: true }, r).avisos.includes("Reinterpretado en el período"));
});

test("la variación se resta en milésimas: 4,35 − 3,8 es 0,55 exacto", () => {
  const e = (cantidad) => ({ existencia: EXISTENCIA.EXISTE, cantidad });
  assert.equal(variacionDe({ apertura: e(4.35), cierre: e(3.8) }), -0.55);
  assert.equal(variacionDe({ apertura: { existencia: EXISTENCIA.DESCONOCIDA, cantidad: null }, cierre: e(3) }), null);
  assert.equal(variacionDe({ apertura: e(3), cierre: { existencia: EXISTENCIA.NO_EXISTE, cantidad: null } }), null);
});
