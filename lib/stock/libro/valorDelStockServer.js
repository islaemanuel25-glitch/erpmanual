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

import { ErrorStockDiario, estadoDelPeriodo, exigirDia, exigirId, exigirPagina, ESTADO_DEL_DIA } from "./stockDiario.js";
import { CATEGORIA, DIRECCION, categoriaDelOrigen, origenesDeLaCategoria, repartirParteEntreMovimientos } from "./explicacionDelValor.js";
import { aMilesimas } from "./stockDiario.js";
import { enInstantanea, hoyDelLibro, identidadesDe, puntoCeroDelLibro, sqlStockDelLocal } from "./stockDiarioServer.js";
import {
  alcanceDeLaValorizacion,
  cantidadesDeLaCadena,
  costoCongeladoPorDia,
  diasValorizados,
  totalesDelValor,
  valorizarCadena,
  valorizarTransito,
  valorEnCentavos,
  escalaDelMomento,
} from "./valorDelStock.js";
import { sumarDias } from "@/lib/transferencias/periodoDePago";

/** La activación del Libro de Costos, o null si el libro no está activado. */
export async function activacionDelLibroDeCostos(db) {
  const filas = await db.$queryRaw`
    SELECT to_char(a."dia", 'YYYY-MM-DD') AS "dia", to_char(a."instante", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "instante"
    FROM "LibroCostoActivacion" a ORDER BY a."id" LIMIT 1`;
  return filas[0] ?? null;
}

// El `instante` viaja con el mismo formato que el de los movimientos del libro:
// el detalle busca la escala vigente en el momento de cada movimiento.
const COLUMNAS_UBICACION = Prisma.sql`
  u."version"::text AS "version", u."productoLocalId", u."productoBaseId", u."tipo"::text AS "tipo",
  to_char(u."dia", 'YYYY-MM-DD') AS "dia", to_char(u."instante", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "instante",
  u."precioCosto"::text AS "precioCosto", u."esDeposito"`;

const COLUMNAS_BASE = Prisma.sql`
  b."version"::text AS "version", b."productoBaseId", b."tipo"::text AS "tipo", to_char(b."dia", 'YYYY-MM-DD') AS "dia",
  to_char(b."instante", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "instante",
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
 * LOS MOVIMIENTOS FÍSICOS DEL PERÍODO, AGRUPADOS por (cadena, día, origen,
 * dirección): el delta en milésimas y cuántos movimientos. Una fila por grupo,
 * no por venta: el resumen no carga ninguna operación.
 *
 * El delta es posterior − anterior con la inexistencia en cero —un ALTA no
 * tiene anterior, una BAJA no tiene posterior—, la misma convención con la que
 * la valorización lee las cantidades. Un movimiento que solo cambió el tránsito
 * tiene delta cero y no está: el tránsito no es stock disponible. El
 * ESTADO_INICIAL es el punto de partida, no un movimiento.
 */
export function sqlEfectosPorOrigen({ localId, desde, hasta }) {
  return Prisma.sql`
    SELECT x."productoLocalId", to_char(x."dia", 'YYYY-MM-DD') AS "dia", x."origen",
           CASE WHEN x."delta" > 0 THEN 'ENTRADA' ELSE 'SALIDA' END AS "direccion",
           count(*)::int AS "movimientos", sum(x."delta")::text AS "delta"
    FROM (
      SELECT m."productoLocalId", m."dia", m."origen",
             coalesce(m."cantidadPosterior", 0) - coalesce(m."cantidadAnterior", 0) AS "delta"
      FROM "MovimientoStock" m
      WHERE m."localId" = ${localId} AND m."dia" BETWEEN ${desde}::date AND ${hasta}::date
        AND m."tipo"::text <> 'ESTADO_INICIAL'
    ) x
    WHERE x."delta" <> 0
    GROUP BY x."productoLocalId", x."dia", x."origen", 4`;
}

/**
 * LAS VERSIONES DE COSTO QUE NECESITAN LOS DÍAS `[desde, hasta]`: la vigente a
 * las 00:00 de `desde` (la última con `dia` anterior) y las que cayeron en los
 * días del período. Las de un día mueven el costo del día SIGUIENTE; y además
 * el ALTA de un producto que nace ese día da su costo de ese mismo día —por eso
 * se traen también las de `hasta`—. La regla vive en `costoCongeladoPorDia`.
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
      AND u."dia" >= ${desde}::date AND u."dia" <= ${hasta}::date
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
      WHERE b."productoBaseId" = ANY(${idsBase}::int[]) AND b."dia" >= ${desde}::date AND b."dia" <= ${hasta}::date
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
    const efectosFilas = await tx.$queryRaw`${sqlEfectosPorOrigen({ localId: l, desde: a, hasta: z })}`;
    const efectos = efectosPorCadenaYDia(efectosFilas);
    const versiones = await versionesDeCosto(tx, { localId: l, pls: piezas.map((x) => x.productoLocalId), desde: a, hasta: z });
    const identidades = await identidadesDe(tx, piezas);

    const cadenas = piezas.map((x) => {
      const { cantidadAlAbrir, cierres } = cantidadesDeLaCadena({ alAbrir: x.alAbrir, cierres: cierresPorCadena.get(x.productoLocalId) });
      const costoDelDia = costoCongeladoPorDia({ ubicaciones: versiones.ubicaciones.get(x.productoLocalId) ?? [], basesPorId: versiones.bases });
      return {
        productoLocalId: x.productoLocalId,
        productoBaseId: x.productoBaseId,
        identidad: identidades.get(x.productoLocalId) ?? null,
        valor: valorizarCadena({ dias, cantidadAlAbrir, cierres, costoDelDia, efectosPorDia: efectos.get(x.productoLocalId) ?? new Map() }),
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

    // `versiones` son las mismas con que se valorizó: el detalle de una categoría
    // las usa para leer cada movimiento con la escala de su momento.
    return { ...base, dias, cadenas, totales: totalesDelValor(cadenas, dias, { conExplicacion: true }), transito, versiones };
  });
}

/** Las filas de `sqlEfectosPorOrigen` → cadena → día → grupos, con el delta en milésimas. */
function efectosPorCadenaYDia(filas) {
  const r = new Map();
  for (const f of filas) {
    const p = Number(f.productoLocalId);
    if (!r.has(p)) r.set(p, new Map());
    const porDia = r.get(p);
    if (!porDia.has(f.dia)) porDia.set(f.dia, []);
    porDia.get(f.dia).push({ origen: f.origen, direccion: f.direccion, delta: aMilesimas(f.delta), movimientos: Number(f.movimientos) });
  }
  return r;
}

// ════════════════════════════════════════════════════════════════════════════
// El detalle de una categoría
// ════════════════════════════════════════════════════════════════════════════

/**
 * UNA PÁGINA DE LOS MOVIMIENTOS DE UNA CATEGORÍA, cada uno valorizado. Solo los
 * que cambiaron cantidad, en los días valorizados del período, ordenados por
 * instante e id. Exportada para que la prueba de base le pida el plan.
 */
export function sqlMovimientosDeCategoria({ localId, desde, hasta, origenes, limite, desplazamiento }) {
  return Prisma.sql`
    SELECT m."id", m."productoLocalId", m."productoBaseId", m."tipo"::text AS "tipo", m."origen", m."origenRef",
           m."cantidadAnterior"::text AS "cantidadAnterior", m."cantidadPosterior"::text AS "cantidadPosterior",
           to_char(m."instante", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "instante", to_char(m."dia", 'YYYY-MM-DD') AS "dia",
           count(*) OVER ()::int AS "total"
    FROM "MovimientoStock" m
    WHERE m."localId" = ${localId} AND m."dia" BETWEEN ${desde}::date AND ${hasta}::date
      AND m."tipo"::text <> 'ESTADO_INICIAL'
      AND m."origen" = ANY(${origenes}::text[])
      AND coalesce(m."cantidadPosterior", 0) <> coalesce(m."cantidadAnterior", 0)
    ORDER BY m."dia", m."instante", m."id"
    LIMIT ${limite} OFFSET ${desplazamiento}`;
}

/**
 * EL DETALLE DE UNA CATEGORÍA DE "¿POR QUÉ CAMBIÓ?": fecha, producto, delta
 * físico con la escala de SU momento, su efecto en el capital y la referencia
 * del documento.
 *
 * ── LA SUMA DEL DETALLE ES LA DE LA CATEGORÍA, AL CENTAVO ────────────────
 *
 * No se recalcula nada: se corre la MISMA valorización que el resumen
 * (`valorDelPeriodo`), que deja para cada (producto, día) sus partes por
 * (origen, dirección) ya repartidas. Cada movimiento pertenece a una parte, y el
 * importe de la parte se reparte entre TODOS sus movimientos
 * (`repartirParteEntreMovimientos`). Por eso se traen todos los movimientos de
 * las partes que toca la página, no solo los de la página: el efecto de una fila
 * no depende de en qué página cae ni del orden en que se piden.
 *
 *   Σ filas de la categoría = Σ sus partes = total de la categoría
 *   Σ categorías = movimiento físico
 *
 * Un producto sin costo no está en el movimiento físico: sus filas van con el
 * efecto en null, nunca en cero, y no están en ningún total.
 *
 * ── LA ESCALA DE SU MOMENTO ──────────────────────────────────────────────
 *
 * La cantidad del movimiento está en unidades físicas; cómo se lee —bultos de
 * cuántas, kilos, piezas, depósito o local— sale de las versiones del Libro de
 * Costos vigentes en el instante del movimiento (`versionesEnElInstante`), y se
 * escribe con `presentacionCantidadStock` en la pantalla. Un pack x6 de ayer no
 * se lee como x12 porque hoy lo sea.
 *
 * `categoria` es una de `CATEGORIA`; los orígenes salen de `origenesDeLaCategoria`.
 * OTROS incluye además cualquier origen que no esté en la tabla.
 *
 * @param {object} args  `esDeposito` es el del local hoy, como en `valorDelPeriodo`.
 */
export async function movimientosDeCategoria(db, { localId, desde, hasta, categoria, esDeposito, page, pageSize, hoy } = {}) {
  const l = exigirId(localId, "localId");
  exigirDia(desde, "desde");
  exigirDia(hasta, "hasta");
  const pagina = exigirPagina({ page, pageSize });
  if (!Object.values(CATEGORIA).includes(categoria)) throw new ErrorStockDiario("CATEGORIA_INVALIDA", `categoria tiene que ser ${Object.values(CATEGORIA).join(", ")}: recibí ${JSON.stringify(categoria)}`);
  return enInstantanea(db, async (tx) => {
    const v = await valorDelPeriodo(tx, { localId: l, desde, hasta, esDeposito, hoy });
    const { periodo, puntoCero, hoy: h, alcance } = v;
    const vacia = { total: 0, page: pagina.page, pageSize: pagina.pageSize, totalPages: 1, items: [] };
    if (!alcance.desdeValorizado) return { periodo, puntoCero, hoy: h, alcance, categoria, movimientos: vacia, totalDeLaCategoria: null };
    const resumen = v.totales.explicacion.categorias.find((c) => c.categoria === categoria);

    let origenes = origenesDeLaCategoria(categoria);
    if (categoria === CATEGORIA.OTROS) {
      // Un origen que nadie clasificó también es OTROS: se buscan los del libro.
      const presentes = await tx.$queryRaw`
        SELECT DISTINCT m."origen" FROM "MovimientoStock" m
        WHERE m."localId" = ${l} AND m."dia" BETWEEN ${alcance.desdeValorizado}::date AND ${alcance.hastaValorizado}::date`;
      origenes = [...new Set([...origenes, ...presentes.map((p) => p.origen).filter((o) => categoriaDelOrigen(o) === CATEGORIA.OTROS)])];
    }
    const filas = await tx.$queryRaw`${sqlMovimientosDeCategoria({
      localId: l,
      desde: alcance.desdeValorizado,
      hasta: alcance.hastaValorizado,
      origenes,
      limite: pagina.pageSize,
      desplazamiento: (pagina.page - 1) * pagina.pageSize,
    })}`;
    const total = filas[0]?.total ?? 0;
    const delta = (f) => (aMilesimas(f.cantidadPosterior) ?? 0) - (aMilesimas(f.cantidadAnterior) ?? 0);
    const direccion = (d) => (d > 0 ? DIRECCION.ENTRADA : DIRECCION.SALIDA);
    const clave = (p, dia, origen, dir) => `${p}|${dia}|${origen}|${dir}`;

    // TODOS los movimientos de las partes que toca esta página: una consulta.
    const tocadas = [...new Map(filas.map((f) => [`${f.productoLocalId}|${f.dia}|${f.origen}`, f])).values()];
    const miembros = tocadas.length ? await tx.$queryRaw`${sqlMovimientosDeLasPartes({ localId: l, partes: tocadas })}` : [];
    const porParte = new Map();
    for (const m of miembros) {
      const d = delta(m);
      if (d === 0) continue;
      const k = clave(Number(m.productoLocalId), m.dia, m.origen, direccion(d));
      if (!porParte.has(k)) porParte.set(k, []);
      porParte.get(k).push({ id: Number(m.id), delta: d });
    }

    const cadenaDe = new Map(v.cadenas.map((c) => [c.productoLocalId, c]));
    const repartos = new Map();
    const efectoDe = (f) => {
      const p = Number(f.productoLocalId);
      const d = delta(f);
      const k = clave(p, f.dia, f.origen, direccion(d));
      if (!repartos.has(k)) {
        const delDia = cadenaDe.get(p)?.valor?.partesPorDia?.get(f.dia) ?? null;
        const parte = delDia?.partes.find((x) => x.origen === f.origen && x.direccion === direccion(d)) ?? null;
        repartos.set(k, parte ? { costo: delDia.costo, centavos: repartirParteEntreMovimientos(porParte.get(k) ?? [], delDia.costo, parte.centavos) } : null);
      }
      const r = repartos.get(k);
      return r ? { costo: r.costo, efecto: r.centavos.get(Number(f.id)) ?? null } : { costo: null, efecto: null };
    };

    const faltantes = [...new Set(filas.map((f) => Number(f.productoLocalId)))].filter((p) => !cadenaDe.get(p)?.identidad);
    const identidadesExtra = faltantes.length
      ? await identidadesDe(tx, faltantes.map((p) => ({ localId: l, productoLocalId: p, productoBaseId: Number(filas.find((f) => Number(f.productoLocalId) === p).productoBaseId) })))
      : new Map();

    const items = filas.map((f) => {
      const p = Number(f.productoLocalId);
      const { costo, efecto } = efectoDe(f);
      return {
        id: Number(f.id),
        instante: f.instante,
        dia: f.dia,
        tipo: f.tipo,
        origen: f.origen,
        origenRef: f.origenRef ?? null,
        categoria: categoriaDelOrigen(f.origen),
        productoLocalId: p,
        identidad: cadenaDe.get(p)?.identidad ?? identidadesExtra.get(p) ?? null,
        // La escala con que se leía la cantidad en ese momento. Null si el libro
        // no la tiene: la pantalla cae a la de hoy y lo sabe.
        escalaDelMomento: escalaDelMomento({ ubicaciones: v.versiones.ubicaciones.get(p) ?? [], basesPorId: v.versiones.bases, instante: f.instante }),
        delta: delta(f),
        costo,
        efecto,
      };
    });
    return {
      periodo,
      puntoCero,
      hoy: h,
      alcance,
      categoria,
      // El total de la categoría en el resumen: la suma de TODAS sus filas.
      totalDeLaCategoria: resumen ? resumen.neto : 0,
      movimientos: { total, page: pagina.page, pageSize: pagina.pageSize, totalPages: Math.max(1, Math.ceil(total / pagina.pageSize)), items },
    };
  });
}

/**
 * TODOS LOS MOVIMIENTOS de las (producto, día, origen) pedidas: los que forman
 * las partes que toca una página. La dirección se separa en JavaScript con el
 * mismo delta que la consulta agrupada.
 */
export function sqlMovimientosDeLasPartes({ localId, partes }) {
  const pls = partes.map((x) => Number(x.productoLocalId));
  const dias = partes.map((x) => x.dia);
  const origenes = partes.map((x) => x.origen);
  return Prisma.sql`
    SELECT m."id", m."productoLocalId", to_char(m."dia", 'YYYY-MM-DD') AS "dia", m."origen",
           m."cantidadAnterior"::text AS "cantidadAnterior", m."cantidadPosterior"::text AS "cantidadPosterior"
    FROM "MovimientoStock" m
    JOIN unnest(${pls}::int[], ${dias}::date[], ${origenes}::text[]) AS p("productoLocalId", "dia", "origen")
      ON m."productoLocalId" = p."productoLocalId" AND m."dia" = p."dia" AND m."origen" = p."origen"
    WHERE m."localId" = ${localId} AND m."tipo"::text <> 'ESTADO_INICIAL'`;
}
