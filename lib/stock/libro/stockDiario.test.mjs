// CANDADO: EL STOCK DIARIO SE DERIVA DEL LIBRO, CON EL DÍA DEL LIBRO.
//
//   node --import ./scripts/alias-loader.mjs --test lib/stock/libro/stockDiario.test.mjs
//
// Lo que afirma:
//
//   1. La semántica pura: los estados del día, que "no existe" y "desconocida"
//      nunca son un número, los deltas solo donde hay dos puntas, la identidad
//      algebraica, los totales que no suman lo desconocido como cero.
//   2. Sobre el SQL QUE CORRE —capturado con un cliente falso que registra cada
//      consulta, no leyendo el archivo—: una cadena nunca se ordena solo por
//      instante; el día sale como texto con `to_char` y nunca crudo ni con
//      `::text` (que depende del DateStyle); el día no se recalcula desde el
//      instante; hoy lo da `libro_stock_dia(libro_stock_instante())`; y nada
//      escribe.
//   3. Que Node no decide el día: ni `Date` ni los helpers de "hoy" de Node en
//      la capa, y ningún consumidor que no sea una prueba le pasa `hoy`.
//   4. Que no nace una segunda fuente: ningún modelo de foto o saldo diario en
//      el schema, y la capa lee solo del libro y de la identidad.
//   5. Que el índice que la hace posible está en el schema y en una migración
//      aditiva de una sola sentencia, y que la prueba de base que mide su plan
//      corre en CI.
//
// Lo que ninguno de estos puede ver —que la consulta devuelva lo correcto
// contra PostgreSQL, que use el índice, que no dependa de la zona— lo prueba
// `scripts/pruebas-db/stockDiario.mjs`, contra una fuerza bruta.
//
// Todo lo que lee código lo lee SIN COMENTARIOS (regla 5 de CLAUDE.md).

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";

import {
  EFECTO,
  ESTADO_DEL_DIA,
  EXISTENCIA,
  FUENTE_IDENTIDAD,
  GRUPO_PRODUCTO_ELIMINADO,
  MOTIVO_DESCONOCIDA,
  PUNTO_CERO_PRODUCCION,
  TEXTO_SIN_ORIGEN,
  UNIDAD_DE_PERIODO,
  aMilesimas,
  claveDeCategoriaActual,
  cuadraLaCadena,
  esDiaValido,
  estadoDelDia,
  estadoDelPeriodo,
  identidadMostrada,
  interpretarMovimiento,
  movidoDesdeAgregado,
  movidoDesdeMovimientos,
  rangoDeStock,
  stockDeCadena,
  totalesDeCadenas,
} from "./stockDiario.js";
import * as server from "./stockDiarioServer.js";
import * as porUnidad from "./stockDiarioPorUnidadServer.js";
import { SIN_ORIGEN } from "./libroStock.js";

const sinComentariosJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const sinComentariosSql = (t) => t.replace(/--[^\n]*/g, "");
const fuente = (f) => sinComentariosJs(readFileSync(f, "utf8"));

const PC = { dia: PUNTO_CERO_PRODUCCION.dia, instante: PUNTO_CERO_PRODUCCION.instanteUTC };
const HOY = "2026-10-05";

function archivos(...patrones) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", ...patrones], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. La semántica pura
// ════════════════════════════════════════════════════════════════════════════

test("el punto cero de producción es el del despliegue: 27/09 parcial, 28/09 primer día completo", () => {
  assert.equal(PUNTO_CERO_PRODUCCION.instanteUTC, "2026-09-28T00:19:13.587Z");
  assert.equal(PUNTO_CERO_PRODUCCION.instanteArgentina, "2026-09-27 21:19:13.587");
  assert.equal(PUNTO_CERO_PRODUCCION.dia, "2026-09-27");
  assert.equal(PUNTO_CERO_PRODUCCION.primerDiaCompleto, "2026-09-28");
  const doc = readFileSync("docs/deploy/MIGRACIONES-SIN-APLICAR.md", "utf8");
  assert.ok(doc.includes("2026-09-28 00:19:13.587 UTC") && doc.includes("2026-09-27 21:19:13.587"), "la constante y la evidencia del despliegue dicen cosas distintas");
});

test("los cuatro estados del día", () => {
  assert.equal(estadoDelDia({ dia: "2026-09-26", puntoCero: PC, hoy: HOY }).estado, ESTADO_DEL_DIA.FUERA_DE_HISTORIA);
  const p = estadoDelDia({ dia: "2026-09-27", puntoCero: PC, hoy: HOY });
  assert.equal(p.estado, ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO);
  assert.equal(p.aperturaConocida, false);
  assert.equal(estadoDelDia({ dia: "2026-09-28", puntoCero: PC, hoy: HOY }).estado, ESTADO_DEL_DIA.COMPLETO);
  const h = estadoDelDia({ dia: HOY, puntoCero: PC, hoy: HOY });
  assert.equal(h.estado, ESTADO_DEL_DIA.EN_CURSO);
  assert.equal(h.enCurso, true);
  // El libro activado hoy: lo que falta es la apertura, y eso manda.
  const hoyEsCero = estadoDelDia({ dia: "2026-09-27", puntoCero: PC, hoy: "2026-09-27" });
  assert.equal(hoyEsCero.estado, ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO);
  assert.equal(hoyEsCero.enCurso, true);
  // Sin libro, todo está fuera de historia.
  assert.equal(estadoDelDia({ dia: HOY, puntoCero: null, hoy: HOY }).estado, ESTADO_DEL_DIA.FUERA_DE_HISTORIA);
});

test("un período que toca el punto cero es parcial; uno que pasa de hoy se recorta; el futuro se rechaza", () => {
  const mes = estadoDelPeriodo({ desde: "2026-09-01", hasta: "2026-09-30", puntoCero: PC, hoy: HOY });
  assert.equal(mes.estado, ESTADO_DEL_DIA.PARCIAL_PUNTO_CERO);
  assert.equal(mes.desdeEfectivo, "2026-09-27");
  const anio = estadoDelPeriodo({ desde: "2026-10-01", hasta: "2026-12-31", puntoCero: PC, hoy: HOY });
  assert.equal(anio.hastaEfectivo, HOY);
  assert.equal(anio.recortadoAHoy, true);
  assert.equal(anio.estado, ESTADO_DEL_DIA.EN_CURSO);
  assert.throws(() => estadoDelDia({ dia: "2026-10-06", puntoCero: PC, hoy: HOY }), (e) => e.codigo === "DIA_FUTURO");
  assert.throws(() => estadoDelPeriodo({ desde: "2026-10-02", hasta: "2026-10-01", puntoCero: PC, hoy: HOY }), (e) => e.codigo === "RANGO_INVALIDO");
});

test("un día es texto YYYY-MM-DD que existe; un objeto de fecha no es un día", () => {
  for (const bueno of ["2026-09-28", "2028-02-29", "2026-12-31"]) assert.ok(esDiaValido(bueno), bueno);
  for (const malo of ["2026-02-29", "2026-13-01", "2026-9-28", "28/09/2026", "2026-09-28T00:00:00Z", new Date(), null, 20260928]) {
    assert.equal(esDiaValido(malo), false, String(malo));
    assert.throws(() => estadoDelDia({ dia: malo, puntoCero: PC, hoy: HOY }), (e) => e.codigo === "DIA_INVALIDO");
  }
});

const fila = (x) => ({
  id: 1, localId: 1, productoLocalId: 7, productoBaseId: 3, stockLocalId: 9, instante: "2026-09-28T13:00:00.000Z", dia: "2026-09-28",
  cantidadAnterior: null, cantidadPosterior: null, enTransitoAnterior: null, enTransitoPosterior: null, origen: SIN_ORIGEN, origenRef: null, ...x,
});

test("un movimiento: delta solo en CAMBIO; ALTA, BAJA y ESTADO_INICIAL sin delta inventado", () => {
  const cambio = interpretarMovimiento(fila({ tipo: "CAMBIO", cantidadAnterior: "15.000", cantidadPosterior: "12.500", enTransitoAnterior: "0.000", enTransitoPosterior: "2.000" }));
  assert.equal(cambio.efecto, EFECTO.CAMBIO);
  assert.equal(cambio.cantidad.delta, -2.5);
  assert.equal(cambio.enTransito.delta, 2);
  const alta = interpretarMovimiento(fila({ tipo: "ALTA", cantidadPosterior: "7.000", enTransitoPosterior: "0.000" }));
  assert.deepEqual([alta.efecto, alta.cantidad.delta, alta.cantidad.anterior, alta.apareceCon], [EFECTO.APARECE, null, null, { cantidad: 7, enTransito: 0 }]);
  const baja = interpretarMovimiento(fila({ tipo: "BAJA", cantidadAnterior: "5.000", enTransitoAnterior: "1.000", nombreCongelado: "X" }));
  assert.deepEqual([baja.efecto, baja.cantidad.delta, baja.cantidad.posterior, baja.desapareceCon], [EFECTO.DESAPARECE, null, null, { cantidad: 5, enTransito: 1 }]);
  assert.equal(baja.identidadCongelada.nombre, "X");
  const inicial = interpretarMovimiento(fila({ tipo: "ESTADO_INICIAL", cantidadPosterior: "20.000", enTransitoPosterior: "0.000" }));
  assert.deepEqual([inicial.efecto, inicial.cantidad.delta, inicial.puntoDePartida.cantidad], [EFECTO.PUNTO_DE_PARTIDA, null, 20]);
  assert.equal(cambio.origenLegible, TEXTO_SIN_ORIGEN);
  assert.equal(interpretarMovimiento(fila({ tipo: "CAMBIO", cantidadAnterior: "1", cantidadPosterior: "2", enTransitoAnterior: "0", enTransitoPosterior: "0", origen: "VENTA" })).origenLegible, "VENTA");
});

test("las milésimas: la ausencia no es cero y los decimales no pierden precisión", () => {
  assert.equal(aMilesimas(null), null);
  assert.equal(aMilesimas(undefined), null);
  assert.equal(aMilesimas("0.000"), 0);
  assert.equal(aMilesimas("-2.5"), -2500);
  assert.equal(aMilesimas("0.1"), 100);
  assert.equal(aMilesimas("999999999.999"), 999999999999);
  assert.throws(() => aMilesimas("1.2345"));
});

const periodo = (desde, hasta = desde, hoy = HOY) => estadoDelPeriodo({ desde, hasta, puntoCero: PC, hoy });

test("NO_EXISTE y DESCONOCIDA no llevan número; cero existente sí", () => {
  const nace = stockDeCadena({
    localId: 1, productoLocalId: 7, periodo: periodo("2026-09-28"), ultimoAntes: null,
    ultimoHasta: fila({ tipo: "ALTA", cantidadPosterior: "0.000", enTransitoPosterior: "0.000" }),
    movido: movidoDesdeMovimientos([interpretarMovimiento(fila({ tipo: "ALTA", cantidadPosterior: "0.000", enTransitoPosterior: "0.000" }))]),
  });
  assert.equal(nace.apertura.existencia, EXISTENCIA.NO_EXISTE);
  assert.equal(nace.apertura.cantidad, null);
  assert.equal(nace.cierre.existencia, EXISTENCIA.EXISTE);
  assert.equal(nace.cierre.cantidad, 0);

  const parcial = stockDeCadena({ localId: 1, productoLocalId: 7, periodo: periodo("2026-09-27"), ultimoAntes: null, ultimoHasta: null, movido: movidoDesdeMovimientos([]) });
  assert.equal(parcial.apertura.existencia, EXISTENCIA.DESCONOCIDA);
  assert.equal(parcial.apertura.motivo, MOTIVO_DESCONOCIDA.SIN_APERTURA_HISTORICA);
  assert.equal(parcial.apertura.cantidad, null);
  assert.equal(parcial.apertura.enTransito, null);

  const fuera = stockDeCadena({ localId: 1, productoLocalId: 7, periodo: periodo("2026-09-20"), ultimoAntes: null, ultimoHasta: null, movido: movidoDesdeMovimientos([]) });
  assert.equal(fuera.cierre.motivo, MOTIVO_DESCONOCIDA.FUERA_DE_HISTORIA);
  assert.equal(fuera.cantidad, null);
});

test("la identidad cuadra con aparece y desaparece, y la contraprueba no cuadra", () => {
  const movs = [
    interpretarMovimiento(fila({ id: 1, tipo: "BAJA", cantidadAnterior: "9", enTransitoAnterior: "0" })),
    interpretarMovimiento(fila({ id: 2, tipo: "ALTA", cantidadPosterior: "4", enTransitoPosterior: "0" })),
    interpretarMovimiento(fila({ id: 3, tipo: "CAMBIO", cantidadAnterior: "4", cantidadPosterior: "6", enTransitoAnterior: "0", enTransitoPosterior: "0" })),
  ];
  const movido = movidoDesdeMovimientos(movs);
  const apertura = { existencia: EXISTENCIA.EXISTE, cantidad: 9, enTransito: 0 };
  const cierre = { existencia: EXISTENCIA.EXISTE, cantidad: 6, enTransito: 0 };
  assert.deepEqual(cuadraLaCadena({ apertura, cierre, movido, parcial: false }), { cantidad: true, enTransito: true });
  assert.equal(cuadraLaCadena({ apertura, cierre: { ...cierre, cantidad: 7 }, movido, parcial: false }).cantidad, false);
});

// ── CUÁNTOS MOVIMIENTOS ENTRARON Y SALIERON (la pantalla de Stock Diario) ──

test("entradas y salidas se CUENTAN con la misma regla que las suman: solo CAMBIO, por la dirección", () => {
  const movs = [
    fila({ id: 1, tipo: "ESTADO_INICIAL", cantidadPosterior: "20", enTransitoPosterior: "0" }),
    fila({ id: 2, tipo: "CAMBIO", cantidadAnterior: "20", cantidadPosterior: "22", enTransitoAnterior: "0", enTransitoPosterior: "0", origen: "VENTA" }),
    fila({ id: 3, tipo: "CAMBIO", cantidadAnterior: "22", cantidadPosterior: "25.5", enTransitoAnterior: "0", enTransitoPosterior: "0" }),
    fila({ id: 4, tipo: "CAMBIO", cantidadAnterior: "25.5", cantidadPosterior: "24", enTransitoAnterior: "0", enTransitoPosterior: "0", origen: "VENTA" }),
    // Solo el tránsito: para la cantidad no es ni entrada ni salida.
    fila({ id: 5, tipo: "CAMBIO", cantidadAnterior: "24", cantidadPosterior: "24", enTransitoAnterior: "0", enTransitoPosterior: "6", origen: "VENTA" }),
    // Aparecer y desaparecer no son entradas ni salidas, igual que en las sumas.
    fila({ id: 6, tipo: "BAJA", cantidadAnterior: "24", enTransitoAnterior: "6", origen: "VENTA" }),
    fila({ id: 7, tipo: "ALTA", cantidadPosterior: "3", enTransitoPosterior: "0", origen: "VENTA" }),
  ].map(interpretarMovimiento);
  const m = movidoDesdeMovimientos(movs);
  assert.deepEqual([m.cantidad.movimientosDeEntrada, m.cantidad.movimientosDeSalida], [2, 1]);
  assert.deepEqual([m.enTransito.movimientosDeEntrada, m.enTransito.movimientosDeSalida], [1, 0]);
  // Las sumas siguen siendo cantidades, en milésimas, sin tocar.
  assert.deepEqual([m.cantidad.entradas, m.cantidad.salidas], [5500, 1500]);
  // El CAMBIO sin origen (id 3) es una entrada —su dirección se conoce— y además
  // cuenta como sin clasificar: la causa es lo que no se sabe. El ESTADO_INICIAL
  // también es SIN_ORIGEN en la fila de prueba, y no es entrada.
  assert.equal(m.sinClasificar, 2);
});

test("los conteos del agregado de la base se leen tal cual, y la cadena los expone enteros", () => {
  const m = movidoDesdeAgregado({ cEntradas: "7.500", cSalidas: "2", cMovEntradas: 3, cMovSalidas: 1, tMovEntradas: 2, tMovSalidas: 4, movimientos: 5 });
  assert.deepEqual([m.cantidad.movimientosDeEntrada, m.cantidad.movimientosDeSalida, m.enTransito.movimientosDeEntrada, m.enTransito.movimientosDeSalida], [3, 1, 2, 4]);
  const c = stockDeCadena({ localId: 1, productoLocalId: 1, periodo: periodo("2026-09-28"), ultimoAntes: null, ultimoHasta: null, movido: m });
  assert.equal(c.cantidad.movimientosDeEntrada, 3, "un conteo no pasa por las milésimas");
  assert.equal(c.cantidad.entradas, 7.5);
  const sinConteos = movidoDesdeAgregado({});
  assert.deepEqual([sinConteos.cantidad.movimientosDeEntrada, sinConteos.cantidad.movimientosDeSalida], [0, 0]);
});

test("los totales suman los conteos de todas las cadenas, y fuera de historia la cadena no trae ninguno", () => {
  const p = periodo("2026-09-28");
  const conMovido = (e, s) => stockDeCadena({ localId: 1, productoLocalId: e, periodo: p, ultimoAntes: null, ultimoHasta: null, movido: movidoDesdeAgregado({ cMovEntradas: e, cMovSalidas: s }) });
  const t = totalesDeCadenas([conMovido(3, 1), conMovido(2, 5)]);
  assert.deepEqual([t.cantidad.movimientosDeEntrada, t.cantidad.movimientosDeSalida], [5, 6]);
  const fuera = stockDeCadena({ localId: 1, productoLocalId: 1, periodo: periodo("2026-09-20"), ultimoAntes: null, ultimoHasta: null, movido: movidoDesdeAgregado({ cMovEntradas: 3 }) });
  assert.equal(fuera.cantidad, null);
});

test("en la base, el conteo usa el MISMO filtro que la suma: una sola definición de entrada y de salida", () => {
  const sql = fuente("lib/stock/libro/stockDiarioServer.js");
  const filtroDe = (alias) => sql.match(new RegExp(`FILTER \\(([^)]*)\\)::(?:int|text) AS "${alias}"`))?.[1];
  for (const [conteo, suma] of [["cMovEntradas", "cEntradas"], ["cMovSalidas", "cSalidas"], ["tMovEntradas", "tEntradas"], ["tMovSalidas", "tSalidas"]]) {
    assert.ok(filtroDe(conteo), `no encontré el conteo ${conteo}`);
    assert.equal(filtroDe(conteo), filtroDe(suma), `${conteo} y ${suma} filtran distinto`);
  }
});

test("un total con una parte desconocida es null, no la suma de las conocidas", () => {
  const p = periodo("2026-09-27");
  const a = stockDeCadena({ localId: 1, productoLocalId: 1, periodo: p, ultimoAntes: null, ultimoHasta: fila({ tipo: "CAMBIO", cantidadPosterior: "3", enTransitoPosterior: "0" }), movido: movidoDesdeMovimientos([]) });
  const t = totalesDeCadenas([a]);
  assert.equal(t.cantidad.apertura.total, null);
  assert.equal(t.cantidad.apertura.desconocidas, 1);
  assert.equal(t.cantidad.cierre.total, 3);
});

test("identidad: el nombre de hoy si el producto existe, el congelado si no; la categoría solo actual", () => {
  const vivo = identidadMostrada({ productoBaseId: 3, actual: { nombre: "Hoy", categoriaId: 5 }, congelada: { nombre: "Ayer" }, productoLocalExiste: true });
  assert.deepEqual([vivo.fuente, vivo.nombre, vivo.categoriaActualId], [FUENTE_IDENTIDAD.ACTUAL, "Hoy", 5]);
  const muerto = identidadMostrada({ productoBaseId: 3, actual: null, congelada: { nombre: "Ayer", codigoBarra: "1" }, productoLocalExiste: false });
  assert.deepEqual([muerto.fuente, muerto.nombre, muerto.categoriaActualId, muerto.productoEliminado], [FUENTE_IDENTIDAD.CONGELADA_EN_BAJA, "Ayer", null, true]);
  assert.equal(identidadMostrada({ productoBaseId: 3, actual: null, congelada: null, productoLocalExiste: false }).fuente, FUENTE_IDENTIDAD.DESCONOCIDA);
  assert.equal(claveDeCategoriaActual({ identidad: muerto }), GRUPO_PRODUCTO_ELIMINADO);
});

test("los períodos: la fecha es obligatoria y la semana usa la vigencia que regía ese día", () => {
  assert.throws(() => rangoDeStock({ unidad: UNIDAD_DE_PERIODO.SEMANA }), (e) => e.codigo === "DIA_INVALIDO");
  assert.deepEqual(rangoDeStock({ unidad: UNIDAD_DE_PERIODO.MES, fecha: "2026-02-10" }).desde, "2026-02-01");
  assert.deepEqual(rangoDeStock({ unidad: UNIDAD_DE_PERIODO.ANIO, fecha: "2026-02-10" }).hasta, "2026-12-31");
  const vigencias = [{ diaDeCorte: 1, vigenteDesde: null }, { diaDeCorte: 3, vigenteDesde: "2026-10-12" }];
  const vieja = rangoDeStock({ unidad: UNIDAD_DE_PERIODO.SEMANA, fecha: "2026-09-30", vigencias });
  assert.deepEqual([vieja.desde, vieja.hasta], ["2026-09-28", "2026-10-04"]);
  const sinLaFutura = rangoDeStock({ unidad: UNIDAD_DE_PERIODO.SEMANA, fecha: "2026-09-30", vigencias: vigencias.slice(0, 1) });
  assert.deepEqual([vieja.desde, vieja.hasta], [sinLaFutura.desde, sinLaFutura.hasta], "un cambio de corte futuro movió una semana vieja");
});

// ════════════════════════════════════════════════════════════════════════════
// 2. El SQL que corre, capturado
// ════════════════════════════════════════════════════════════════════════════
//
// Un cliente falso que registra el texto de cada consulta y contesta lo mínimo
// para que la capa siga hasta el final. Así se afirma sobre lo que la capa
// MANDA a la base, no sobre lo que el archivo dice.

function clienteQueGraba() {
  const consultas = [];
  const responder = (sql) => {
    if (sql.includes('"libro_stock_dia"("libro_stock_instante"())')) return [{ hoy: HOY }];
    if (/FROM "MovimientoStock" m ORDER BY m\."id" LIMIT 1/.test(sql)) return [{ instante: PC.instante, dia: PC.dia, tipo: "ESTADO_INICIAL" }];
    if (sql.includes("WITH RECURSIVE cadenas")) {
      const ultimo = { ...fila({ tipo: "CAMBIO", cantidadAnterior: "1.000", cantidadPosterior: "2.000", enTransitoAnterior: "0.000", enTransitoPosterior: "0.000" }) };
      return [{ productoLocalId: 7, ultimoAntes: ultimo, ultimoHasta: ultimo, movido: null }];
    }
    if (sql.includes("LIMIT 1") && sql.includes('"productoLocalId" =')) return [fila({ tipo: "CAMBIO", cantidadAnterior: "1.000", cantidadPosterior: "2.000", enTransitoAnterior: "0.000", enTransitoPosterior: "0.000" })];
    if (sql.includes('count(*)::int AS "total"')) return [{ total: 3 }];
    return [];
  };
  const db = {
    consultas,
    $queryRaw(partes, ...valores) {
      const sql = Prisma.sql(partes, ...valores).sql;
      consultas.push(sql);
      return Promise.resolve(responder(sql));
    },
    $executeRaw(partes, ...valores) {
      consultas.push(Prisma.sql(partes, ...valores).sql);
      return Promise.resolve(0);
    },
    semanaOperativaVigencia: { findMany: async () => [] },
  };
  return db;
}

async function todoLoQueLaCapaManda() {
  const db = clienteQueGraba();
  await server.hoyDelLibro(db);
  await server.puntoCeroDelLibro(db);
  await server.estadoDeCadenaAlCierre(db, { localId: 1, productoLocalId: 7, dia: "2026-09-30" });
  await server.stockDiarioDeCadena(db, { localId: 1, productoLocalId: 7, dia: "2026-09-30" });
  await server.stockDeCadenaEnPeriodo(db, { localId: 1, productoLocalId: 7, desde: "2026-09-28", hasta: "2026-09-30" });
  await server.stockDiarioDelLocal(db, { localId: 1, dia: "2026-09-30" });
  await server.stockDelPeriodo(db, { localId: 1, desde: "2026-09-28", hasta: "2026-10-01" });
  await porUnidad.stockDeUnidad(db, { localId: 1, unidad: UNIDAD_DE_PERIODO.SEMANA, fecha: "2026-09-30" });
  await server.movimientosDelDia(db, { localId: 1, dia: "2026-09-30" });
  await server.movimientosDelDia(db, { localId: 1, dia: "2026-09-30", productoLocalId: 7 });
  await server.movimientosDelPeriodo(db, { localId: 1, desde: "2026-09-28", hasta: "2026-09-30", page: 2, pageSize: 10 });
  await server.movimientosDelPeriodo(db, { localId: 1, desde: "2026-09-28", hasta: "2026-09-30", productoLocalId: 7, page: 1, pageSize: 10 });
  await server.detalleDeCadena(db, { localId: 1, productoLocalId: 7, desde: "2026-09-28", hasta: "2026-09-30", page: 1, pageSize: 10 });
  await porUnidad.rangoDelPedido(db, { localId: 1, unidad: UNIDAD_DE_PERIODO.SEMANA });
  await porUnidad.rangoDelPedido(db, { localId: 1, desde: "2026-09-28", hasta: "2026-09-30" });
  await server.identidadesDe(db, [{ localId: 1, productoLocalId: 7, productoBaseId: 3 }]);
  await server.enInstantanea(db, (tx) => server.hoyDelLibro(tx));
  return db.consultas.map((s) => s.replace(/\s+/g, " "));
}

test("el cliente falso ejerce todas las funciones exportadas de la capa", async () => {
  const fuenteDelTest = readFileSync("lib/stock/libro/stockDiario.test.mjs", "utf8");
  const sinEjercer = [];
  for (const [nombre, modulo] of [["server", server], ["porUnidad", porUnidad]]) {
    // Los `sql…` construyen la consulta y no la corren: los ejercen las funciones
    // que los usan, y la prueba de base les pide el plan.
    const exportadas = Object.keys(modulo).filter((k) => typeof modulo[k] === "function" && !k.startsWith("sql"));
    sinEjercer.push(...exportadas.filter((k) => !fuenteDelTest.includes(`${nombre}.${k}(db`)).map((k) => `${nombre}.${k}`));
  }
  assert.deepEqual(sinEjercer, [], "hay funciones de la capa cuyo SQL nadie captura");
  assert.ok((await todoLoQueLaCapaManda()).length > 15);
});

test("una cadena nunca se ordena solo por instante: cada ORDER BY con instante lleva el id detrás", async () => {
  const consultas = await todoLoQueLaCapaManda();
  const ordenes = consultas.flatMap((s) => [...s.matchAll(/ORDER BY ([^)]*?)(?: LIMIT| \)|$)/g)].map((m) => m[1].trim()));
  assert.ok(ordenes.length > 5);
  for (const o of ordenes) {
    if (/"instante"/.test(o)) assert.match(o, /"instante"[^,]*, \w+\."id"/, `ORDER BY ${o}: el instante no desempata el mismo milisegundo`);
  }
  // Y cada "último movimiento" (LIMIT 1 sobre una cadena) es por (dia, id) descendente.
  const ultimos = consultas.flatMap((s) => [...s.matchAll(/"productoLocalId" = [^ ]+ AND m\."dia" (<|<=) [^ ]+ ORDER BY ([^L]+) LIMIT 1/g)].map((m) => m[2].trim()));
  assert.ok(ultimos.length >= 4, "no encontré las búsquedas de apertura y cierre");
  for (const o of ultimos) assert.equal(o, 'm."dia" DESC, m."id" DESC');
});

test("el día sale como texto con to_char y nunca crudo, con ::text, ni recalculado desde el instante", async () => {
  const consultas = await todoLoQueLaCapaManda();
  const todo = consultas.join("\n");
  assert.doesNotMatch(todo, /AT TIME ZONE/i, "la capa convierte zonas: el día ya viene calculado en la columna");
  assert.doesNotMatch(todo, /"instante"\s*::\s*date|date_trunc|date\(\s*\w*\.?"instante"/i, "la capa deriva un día desde el instante");
  assert.doesNotMatch(todo, /"dia"\s*::\s*text/, "::text de una fecha depende del DateStyle de la sesión");
  for (const s of consultas) {
    // Cada columna de salida que se llama dia viene de to_char con el formato ISO.
    const salidas = (s.match(/ AS "dia"/g) || []).length;
    const conToChar = (s.match(/to_char\(\w+\."dia", 'YYYY-MM-DD'\) AS "dia"/g) || []).length;
    assert.equal(conToChar, salidas, `una columna dia sale sin to_char: ${s.slice(0, 160)}`);
    // Y ninguna lista de SELECT devuelve la columna dia sin formatear.
    const limpio = s.replace(/to_char\(\w+\."dia", 'YYYY-MM-DD'\)/g, "");
    for (const [, lista] of limpio.matchAll(/SELECT (.*?) FROM /g)) {
      assert.doesNotMatch(lista, /\b\w+\."dia"/, `un SELECT devuelve dia crudo: ${lista.slice(0, 160)}`);
    }
  }
  // Hoy: la función del libro, sobre el reloj del libro.
  const libroDia = [...todo.matchAll(/"libro_stock_dia"\(([^)]*\)?)\)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(libroDia)], ['"libro_stock_instante"()']);
});

test("la capa solo lee: ninguna sentencia escribe, y lee solo del libro y de la identidad", async () => {
  const consultas = await todoLoQueLaCapaManda();
  for (const s of consultas) {
    if (s.startsWith("SET TRANSACTION")) continue;
    assert.doesNotMatch(s, /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/i, s.slice(0, 120));
  }
  const tablas = new Set(consultas.flatMap((s) => [...s.matchAll(/(?:FROM|JOIN) "(\w+)"/g)].map((m) => m[1])));
  assert.deepEqual([...tablas].sort(), ["Categoria", "MovimientoStock", "ProductoBase", "ProductoLocal", "ReinterpretacionDeStock"]);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Node no decide el día
// ════════════════════════════════════════════════════════════════════════════

const CAPA = [
  "lib/stock/libro/stockDiario.js",
  "lib/stock/libro/stockDiarioServer.js",
  "lib/stock/libro/stockDiarioPorUnidadServer.js",
  "lib/stock/libro/stockDiarioApi.js",
  "lib/stock/libro/stockDiarioRutas.js",
  // El Valor del Stock es la misma capa: lee el mismo libro con el mismo reloj.
  "lib/stock/libro/valorDelStock.js",
  "lib/stock/libro/valorDelStockServer.js",
];

test("la capa no usa Date ni los relojes de Node", () => {
  for (const f of CAPA) {
    const t = fuente(f);
    assert.doesNotMatch(t, /\bDate\b/, `${f} usa Date: un día argentino no es un instante`);
    assert.doesNotMatch(t, /hoyArgentinaISO|fechaArgentinaISO|rangoArgentina|performance\.now|process\.hrtime/, `${f} toma la hora de Node`);
    assert.doesNotMatch(t, /\.instante\s*\.\s*(slice|substring|substr|split)/, `${f} saca el día del texto del instante`);
  }
});

test("la capa pura llama a los helpers de período SIEMPRE con la fecha: sin ella usarían el hoy de Node", () => {
  const t = fuente("lib/stock/libro/stockDiario.js");
  const llamadas = [...t.matchAll(/\b(rangoDelPeriodo|semanaQueContiene)\(\{([^}]*)\}\)/g)];
  assert.ok(llamadas.length >= 3);
  for (const [, nombre, args] of llamadas) assert.match(args, /(^|[\s,])(hoy:\s*fecha|fecha)\s*(,|$)/, `${nombre}({${args}}) no pasa la fecha`);
});

test("nadie fuera de las pruebas le pasa `hoy` a la capa: en la app lo decide PostgreSQL", () => {
  // Una sola estrella: en un pathspec de git cruza directorios, y `**/` dejaría
  // afuera los scripts de primer nivel, que es justamente donde está el consumidor.
  const consumidores = archivos("app/*.js", "app/*.jsx", "lib/*.js", "lib/*.mjs", "scripts/*.mjs", "scripts/*.js", "components/*.jsx")
    .filter((f) => !CAPA.includes(f) && !f.endsWith(".test.mjs") && !f.startsWith("scripts/pruebas-db/"))
    .filter((f) => /stockDiarioServer/.test(readFileSync(f, "utf8")));
  assert.deepEqual(consumidores, ["scripts/stock-diario.mjs"], "apareció un consumidor nuevo de la capa: revisar que no inyecte el día");
  for (const f of consumidores) assert.doesNotMatch(fuente(f), /\bhoy\s*:/, `${f} inyecta hoy`);
});

// ════════════════════════════════════════════════════════════════════════════
// 4. Ninguna segunda fuente
// ════════════════════════════════════════════════════════════════════════════

test("no hay foto ni saldo diario en el schema: el Stock Diario se deriva", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8").replace(/\/\/[^\n]*/g, "");
  const modelos = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]);
  const sospechosos = modelos.filter((m) => /(Snapshot|Foto|Saldo|Cierre|Apertura|Diario)/i.test(m) && /Stock/i.test(m));
  assert.deepEqual(sospechosos, [], "un modelo de stock por día sería una segunda fuente de verdad");
});

test("ningún cron ni tarea programada calcula el Stock Diario", () => {
  const culpables = archivos("app/*.js", "lib/*.js", "lib/*.mjs", "scripts/*.mjs", "scripts/*.js", ".github/workflows/*.yml", "docker-compose*.yml", "Dockerfile*")
    .filter((f) => !f.endsWith(".test.mjs") && f !== "scripts/pruebas-db/stockDiario.mjs")
    .filter((f) => {
      const t = readFileSync(f, "utf8");
      return /stockDiario|stock-diario/.test(t) && /\b(cron|schedule|setInterval|node-cron)\b/i.test(sinComentariosJs(t));
    });
  assert.deepEqual(culpables, []);
});

// ════════════════════════════════════════════════════════════════════════════
// 5. El índice
// ════════════════════════════════════════════════════════════════════════════

const MIGRACION_INDICE = "prisma/migrations/20260928150000_stock_diario_indice/migration.sql";

test("el índice (localId, productoLocalId, dia, id) está en el schema, sin perder los anteriores", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8").replace(/\/\/[^\n]*/g, "");
  const mov = schema.match(/\bmodel MovimientoStock \{([\s\S]*?)\n\}/)[1];
  assert.match(mov, /@@index\(\[localId, productoLocalId, dia, id\]\)/);
  assert.match(mov, /@@index\(\[localId, productoLocalId, id\]\)/);
  assert.match(mov, /@@index\(\[localId, dia\]\)/);
});

test("la migración del índice es una sola sentencia, aditiva, con las columnas en ese orden", () => {
  const sentencias = sinComentariosSql(readFileSync(MIGRACION_INDICE, "utf8")).split(";").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(sentencias, [
    'CREATE INDEX "MovimientoStock_localId_productoLocalId_dia_id_idx" ON "MovimientoStock"("localId", "productoLocalId", "dia", "id")',
  ]);
});

test("la prueba de base que mide el plan y compara contra la fuerza bruta corre en CI", () => {
  const ci = readFileSync(".github/workflows/verificacion.yml", "utf8");
  assert.match(ci, /scripts\/pruebas-db\/stockDiario\.mjs/);
  const prueba = readFileSync("scripts/pruebas-db/stockDiario.mjs", "utf8");
  assert.ok(prueba.includes('"MovimientoStock_localId_productoLocalId_dia_id_idx"'), "la prueba de base mira otro índice");
  assert.ok(prueba.includes("20260928150000_stock_diario_indice"));
});

// ════════════════════════════════════════════════════════════════════════════
// 6. La sonda de la terminal carga sin Next
// ════════════════════════════════════════════════════════════════════════════
//
// `scripts/stock-diario.mjs` corre dentro de la imagen de producción, donde
// `next/server` no resuelve desde un script suelto. El 2026-09-28 falló ahí antes
// de conectarse: el motor importaba el servidor de Semana Operativa, que importa
// `@/lib/prisma`, que importa el interceptor de auditoría, que importa
// `next/server`. Dos candados: el grafo de imports, leído; y la sonda, corrida con
// `next` bloqueado, que tiene que llegar hasta intentar la conexión.

const SONDA = "scripts/stock-diario.mjs";
const EXTENSIONES_IMPORT = ["", ".js", ".mjs", "/index.js"];

function resolverImport(desde, especificador) {
  let base = null;
  if (especificador.startsWith("@/")) base = especificador.slice(2);
  else if (especificador.startsWith(".")) base = path.join(path.dirname(desde), especificador);
  else return { paquete: especificador };
  for (const ext of EXTENSIONES_IMPORT) {
    const f = path.normalize(base + ext);
    if (existsSync(f) && statSync(f).isFile()) return { archivo: f };
  }
  throw new Error(`no pude resolver ${especificador} desde ${desde}`);
}

/** Todo lo que la sonda carga: archivos del repo y paquetes, siguiendo imports estáticos y `import("…")` literales. */
function grafoDe(inicio) {
  const archivosVistos = new Set();
  const paquetes = new Set();
  const pendientes = [inicio];
  while (pendientes.length) {
    const f = pendientes.pop();
    if (archivosVistos.has(f)) continue;
    archivosVistos.add(f);
    const codigo = sinComentariosJs(readFileSync(f, "utf8"));
    const especificadores = [
      ...[...codigo.matchAll(/\bimport\s+(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...codigo.matchAll(/\bexport\s+[^'"]*?\s+from\s+["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...codigo.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
    ];
    for (const e of especificadores) {
      const r = resolverImport(f, e);
      if (r.paquete) paquetes.add(r.paquete);
      else pendientes.push(r.archivo);
    }
  }
  return { archivos: archivosVistos, paquetes };
}

test("el grafo de imports de la sonda no llega a Next ni al cliente de la app", () => {
  const { archivos, paquetes } = grafoDe(SONDA);
  assert.ok(archivos.has("lib/stock/libro/stockDiarioServer.js"), "la sonda dejó de usar el motor: este candado no estaría mirando nada");
  const next = [...paquetes].filter((p) => p === "next" || p.startsWith("next/"));
  assert.deepEqual(next, [], "la sonda importa Next: en la imagen no carga");
  for (const prohibido of ["lib/prisma.js", "lib/auditoria/interceptor.js", "lib/semanaOperativa/semanaOperativaServer.js"]) {
    assert.ok(!archivos.has(prohibido), `la sonda llega a ${prohibido}, que arrastra next/server`);
  }
});

test("la sonda, corrida con next bloqueado como en la imagen, carga el motor y llega a la base", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "sonda-sin-next-"));
  const bloqueo = path.join(dir, "sin-next.mjs");
  writeFileSync(
    bloqueo,
    `import { register } from "node:module";
register("data:text/javascript," + encodeURIComponent(\`export async function resolve(s, c, n) {
  if (s === "next" || s.startsWith("next/")) { const e = new Error("BLOQUEADO " + s); e.code = "ERR_MODULE_NOT_FOUND"; throw e; }
  return n(s, c);
}\`));
`
  );
  // La marca del alias loader no se hereda: con ella, el hijo no resolvería `@/`.
  const { __ERPAZUL_ALIAS_LOADER__: _marca, ...entorno } = process.env;
  const r = spawnSync(process.execPath, ["--import", "./scripts/alias-loader.mjs", "--import", bloqueo, SONDA, "--local", "1", "--dia", "2026-09-28"], {
    env: { ...entorno, DATABASE_URL: "postgresql://nadie@127.0.0.1:1/sonda_sin_base" },
    encoding: "utf8",
    timeout: 60_000,
  });
  const salida = `${r.stdout}${r.stderr}`;
  assert.doesNotMatch(salida, /BLOQUEADO|next\/server|ERR_MODULE_NOT_FOUND/, "la sonda no carga sin Next");
  // Sin base en ese puerto, lo único que puede fallar es la conexión: el motor ya cargó.
  assert.match(salida, /No se pudo consultar el Stock Diario/);
  assert.equal(r.status, 2);
});
