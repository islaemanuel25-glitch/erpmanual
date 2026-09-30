// lib/stock/libro/valorDelStockServer.js
//
// LAS CONSULTAS DEL VALOR DEL STOCK. Solo lectura, sobre los dos libros.
//
// La cuenta —el costo congelado, el valor de cada día, la identidad— vive en
// `valorDelStock.js`, que es puro. Acá se le pregunta a PostgreSQL lo mínimo,
// en CONSULTAS AGRUPADAS por local y nunca por producto ni por día:
//
//   1. Las cadenas del local con su estado al abrir y al cerrar: la consulta del
//      Stock Diario (`sqlStockDelLocal`), sin cambiarle nada.
//   2. El cierre de cada (cadena, día) con movimientos: un DISTINCT ON sobre el
//      índice `(localId, productoLocalId, dia, id)`.
//   3. Las versiones de costo de las ubicaciones del local: la vigente al abrir
//      el primer día y las de los días siguientes. Otras dos para sus bases.
//   4. Las líneas de transferencia en viaje al abrir y al cerrar.
//   5. Las identidades, con la consulta del Stock Diario.
//
// Son nueve consultas para un local entero, sea un día o un año. Un candado
// (`valorDelStockServer.test.mjs`) las cuenta con un cliente falso y exige que
// no crezcan con la cantidad de productos ni de días.
//
// Todo en UNA instantánea REPEATABLE READ de solo lectura (`enInstantanea`):
// las cantidades y los costos son del mismo momento.

import { Prisma } from "@prisma/client";

import { estadoDelPeriodo, exigirDia, exigirId, ESTADO_DEL_DIA } from "./stockDiario.js";
import { enInstantanea, hoyDelLibro, identidadesDe, puntoCeroDelLibro, sqlStockDelLocal } from "./stockDiarioServer.js";
import {
  alcanceDeLaValorizacion,
  cantidadesDeLaCadena,
  costoCongeladoPorDia,
  diasValorizados,
  totalesDelValor,
  valorizarCadena,
  valorizarTransito,
} from "./valorDelStock.js";
import { aMilesimas } from "./stockDiario.js";
import { sumarDias } from "@/lib/transferencias/periodoDePago";

/** La activación del Libro de Costos, o null si el libro no está activado. */
export async function activacionDelLibroDeCostos(db) {
  const filas = await db.$queryRaw`
    SELECT to_char(a."dia", 'YYYY-MM-DD') AS "dia", to_char(a."instante", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "instante"
    FROM "LibroCostoActivacion" a ORDER BY a."id" LIMIT 1`;
  return filas[0] ?? null;
}

const COLUMNAS_UBICACION = Prisma.sql`
  u."version"::text AS "version", u."productoLocalId", u."productoBaseId", u."tipo"::text AS "tipo",
  to_char(u."dia", 'YYYY-MM-DD') AS "dia", u."precioCosto"::text AS "precioCosto", u."esDeposito"`;

const COLUMNAS_BASE = Prisma.sql`
  b."version"::text AS "version", b."productoBaseId", b."tipo"::text AS "tipo", to_char(b."dia", 'YYYY-MM-DD') AS "dia",
  b."precioCosto"::text AS "precioCosto", b."unidadMedida", b."factorPack", b."pesoReferenciaKg"::text AS "pesoReferenciaKg",
  b."pesoEsFijo", b."modoCompraProveedor", b."modoVentaDeposito", b."esCombo"`;

/**
 * EL CIERRE DE CADA (CADENA, DÍA) CON MOVIMIENTOS: el último movimiento del día.
 * Exportada para que la prueba de base le pida el plan.
 */
export function sqlCierresPorDia({ localId, desde, hasta }) {
  return Prisma.sql`
    SELECT DISTINCT ON (m."productoLocalId", m."dia")
           m."productoLocalId", to_char(m."dia", 'YYYY-MM-DD') AS "dia", m."tipo"::text AS "tipo",
           m."cantidadPosterior"::text AS "cantidadPosterior"
    FROM "MovimientoStock" m
    WHERE m."localId" = ${localId} AND m."dia" BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY m."productoLocalId", m."dia", m."id" DESC`;
}

/**
 * LAS VERSIONES DE COSTO QUE NECESITAN LOS DÍAS `[desde, hasta]`: la vigente a
 * las 00:00 de `desde` (la última con `dia` anterior) y las que cayeron en los
 * días siguientes, que mueven el costo de los días de después. Las de `hasta`
 * no hacen falta: recién valdrían mañana.
 */
async function versionesDeCosto(db, { localId, pls, desde, hasta }) {
  if (pls.length === 0) return { ubicaciones: new Map(), bases: new Map() };
  const uAbrir = await db.$queryRaw`
    SELECT DISTINCT ON (u."productoLocalId") ${COLUMNAS_UBICACION}
    FROM "CostoUbicacionVersion" u
    WHERE u."localId" = ${localId} AND u."productoLocalId" = ANY(${pls}::int[]) AND u."dia" < ${desde}::date
    ORDER BY u."productoLocalId", u."instante" DESC, u."version" DESC`;
  const uCambios = await db.$queryRaw`
    SELECT ${COLUMNAS_UBICACION}
    FROM "CostoUbicacionVersion" u
    WHERE u."localId" = ${localId} AND u."productoLocalId" = ANY(${pls}::int[])
      AND u."dia" >= ${desde}::date AND u."dia" < ${hasta}::date
    ORDER BY u."productoLocalId", u."instante", u."version"`;

  const ubicaciones = new Map();
  for (const u of [...uAbrir, ...uCambios]) {
    const k = Number(u.productoLocalId);
    if (!ubicaciones.has(k)) ubicaciones.set(k, []);
    ubicaciones.get(k).push(u);
  }

  const idsBase = [...new Set([...uAbrir, ...uCambios].map((u) => Number(u.productoBaseId)))];
  const bases = new Map();
  if (idsBase.length) {
    const bAbrir = await db.$queryRaw`
      SELECT DISTINCT ON (b."productoBaseId") ${COLUMNAS_BASE}
      FROM "CostoBaseVersion" b
      WHERE b."productoBaseId" = ANY(${idsBase}::int[]) AND b."dia" < ${desde}::date
      ORDER BY b."productoBaseId", b."instante" DESC, b."version" DESC`;
    const bCambios = await db.$queryRaw`
      SELECT ${COLUMNAS_BASE}
      FROM "CostoBaseVersion" b
      WHERE b."productoBaseId" = ANY(${idsBase}::int[]) AND b."dia" >= ${desde}::date AND b."dia" < ${hasta}::date
      ORDER BY b."productoBaseId", b."instante", b."version"`;
    for (const b of [...bAbrir, ...bCambios]) {
      const k = Number(b.productoBaseId);
      if (!bases.has(k)) bases.set(k, []);
      bases.get(k).push(b);
    }
  }
  return { ubicaciones, bases };
}

/**
 * LAS LÍNEAS EN VIAJE AL CIERRE DEL DÍA `dia`, salidas de este local: despachadas
 * ese día o antes, y ni recibidas ni canceladas hasta ese día inclusive. Los días
 * se comparan con `libro_stock_dia`, el mismo reloj de los dos libros.
 *
 * `TransferenciaDetalle.productoId` es el ProductoLocal del DESTINO; la cadena
 * del origen —la fila que tiene el `enTransito`— es el ProductoLocal de la misma
 * base en el local de origen.
 */
export function sqlTransitoAlCierre({ localId, dia }) {
  return Prisma.sql`
    SELECT d."id", d."transferenciaId", d."cantidad"::text AS "cantidad", d."precioCosto"::text AS "precioCosto",
           d."unidadEnviada"::text AS "unidadEnviada", d."presentacionEnvio"::text AS "presentacionEnvio",
           d."cantidadPresentada"::text AS "cantidadPresentada", d."sueltasEnviadas"::text AS "sueltasEnviadas",
           d."factorPresentacion", d."pesoPiezaKg"::text AS "pesoPiezaKg",
           plo."id" AS "productoLocalOrigenId", pb."nombre",
           pb."unidad_medida"::text AS "unidad_medida", pb."factor_pack", pb."modoCompraProveedor"::text AS "modoCompraProveedor",
           pb."pesoReferenciaKg"::text AS "pesoReferenciaKg", pb."modoVentaDeposito"::text AS "modoVentaDeposito", pb."pesoEsFijo"
    FROM "Transferencia" t
    JOIN "TransferenciaDetalle" d ON d."transferenciaId" = t."id"
    LEFT JOIN "ProductoLocal" pld ON pld."id" = d."productoId"
    LEFT JOIN "ProductoBase" pb ON pb."id" = pld."baseId"
    LEFT JOIN "ProductoLocal" plo ON plo."localId" = t."origenId" AND plo."baseId" = pld."baseId"
    WHERE t."origenId" = ${localId} AND d."agregadoEnRecepcion" = false
      AND t."fechaEnvio" IS NOT NULL AND "libro_stock_dia"(t."fechaEnvio") <= ${dia}::date
      AND (t."fechaRecepcion" IS NULL OR "libro_stock_dia"(t."fechaRecepcion") > ${dia}::date)
      AND (t."canceladaEn" IS NULL OR "libro_stock_dia"(t."canceladaEn") > ${dia}::date)
    ORDER BY d."id"`;
}

const numeroONulo = (v) => (v === null || v === undefined ? null : Number(v));

/** Una fila de la consulta de tránsito con la forma que lee `valorizarLineaDelRemito`. */
function lineaDeTransito(f) {
  return {
    id: Number(f.id),
    transferenciaId: Number(f.transferenciaId),
    productoLocalOrigenId: numeroONulo(f.productoLocalOrigenId),
    nombre: f.nombre ?? null,
    cantidad: Number(f.cantidad),
    precioCosto: numeroONulo(f.precioCosto),
    unidadEnviada: f.unidadEnviada ?? null,
    presentacionEnvio: f.presentacionEnvio ?? null,
    cantidadPresentada: numeroONulo(f.cantidadPresentada),
    sueltasEnviadas: numeroONulo(f.sueltasEnviadas),
    factorPresentacion: numeroONulo(f.factorPresentacion),
    pesoPiezaKg: numeroONulo(f.pesoPiezaKg),
    base: {
      unidad_medida: f.unidad_medida ?? null,
      factor_pack: numeroONulo(f.factor_pack),
      modoCompraProveedor: f.modoCompraProveedor ?? null,
      pesoReferenciaKg: numeroONulo(f.pesoReferenciaKg),
      modoVentaDeposito: f.modoVentaDeposito ?? null,
      pesoEsFijo: f.pesoEsFijo === true,
    },
  };
}

/** El tránsito del Libro de Stock de cada cadena, en milésimas, según un movimiento. */
function transitoDelLibro(piezas, lado) {
  const r = new Map();
  for (const x of piezas) {
    const m = x[lado];
    if (!m || m.tipo === "BAJA") continue;
    const t = aMilesimas(m.enTransitoPosterior) ?? 0;
    if (t !== 0) r.set(x.productoLocalId, t);
  }
  return r;
}

/**
 * EL VALOR DEL STOCK DE UN LOCAL EN UN PERÍODO.
 *
 * @param {object} db
 * @param {{ localId:number, desde:string, hasta:string, esDeposito:boolean, hoy?:string }} args
 *   `esDeposito` es el del local HOY, y solo decide cómo se lee el tránsito
 *   (la pieza del depósito). El costo de cada día usa el `esDeposito` que congeló
 *   el Libro de Costos. `hoy` es solo para las pruebas.
 */
export async function valorDelPeriodo(db, { localId, desde, hasta, esDeposito, hoy } = {}) {
  const l = exigirId(localId, "localId");
  exigirDia(desde, "desde");
  exigirDia(hasta, "hasta");
  if (esDeposito !== true && esDeposito !== false) throw new TypeError("valorDelPeriodo necesita esDeposito booleano");
  return enInstantanea(db, async (tx) => {
    const puntoCero = await puntoCeroDelLibro(tx);
    const h = hoy ?? (await hoyDelLibro(tx));
    const periodo = estadoDelPeriodo({ desde, hasta, puntoCero, hoy: h });
    const activacionCostos = await activacionDelLibroDeCostos(tx);
    const alcance = alcanceDeLaValorizacion({ periodo, puntoCeroStock: puntoCero, activacionCostos });
    const base = { localId: l, periodo, puntoCero, activacionCostos, hoy: h, alcance };
    if (!alcance.desdeValorizado || periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA) {
      return { ...base, dias: [], cadenas: [], totales: null, transito: null };
    }
    const dias = diasValorizados(alcance);
    const { desdeValorizado: a, hastaValorizado: z } = alcance;

    const filas = await tx.$queryRaw`${sqlStockDelLocal({ localId: l, desde: a, hasta: z })}`;
    const piezas = filas.map((f) => ({
      localId: l,
      productoLocalId: Number(f.productoLocalId),
      alAbrir: f.ultimoAntes,
      alCerrar: f.ultimoHasta,
      productoBaseId: Number((f.ultimoHasta ?? f.ultimoAntes).productoBaseId),
    }));
    const cierresFilas = await tx.$queryRaw`${sqlCierresPorDia({ localId: l, desde: a, hasta: z })}`;
    const cierresPorCadena = new Map();
    for (const f of cierresFilas) {
      const k = Number(f.productoLocalId);
      if (!cierresPorCadena.has(k)) cierresPorCadena.set(k, []);
      cierresPorCadena.get(k).push(f);
    }
    const versiones = await versionesDeCosto(tx, { localId: l, pls: piezas.map((x) => x.productoLocalId), desde: a, hasta: z });
    const identidades = await identidadesDe(tx, piezas);

    const cadenas = piezas.map((x) => {
      const { cantidadAlAbrir, cierres } = cantidadesDeLaCadena({ alAbrir: x.alAbrir, cierres: cierresPorCadena.get(x.productoLocalId) });
      const costoDelDia = costoCongeladoPorDia({ ubicaciones: versiones.ubicaciones.get(x.productoLocalId) ?? [], basesPorId: versiones.bases });
      return {
        productoLocalId: x.productoLocalId,
        productoBaseId: x.productoBaseId,
        identidad: identidades.get(x.productoLocalId) ?? null,
        valor: valorizarCadena({ dias, cantidadAlAbrir, cierres, costoDelDia }),
      };
    });

    const transito = {};
    for (const [lado, dia, pieza] of [
      ["alAbrir", sumarDias(a, -1), "alAbrir"],
      ["alCerrar", z, "alCerrar"],
    ]) {
      const lineas = (await tx.$queryRaw`${sqlTransitoAlCierre({ localId: l, dia })}`).map(lineaDeTransito);
      transito[lado] = valorizarTransito({ lineas, origenEsDeposito: esDeposito, transitoDelLibro: transitoDelLibro(piezas, pieza) });
    }

    return { ...base, dias, cadenas, totales: totalesDelValor(cadenas, dias), transito };
  });
}
