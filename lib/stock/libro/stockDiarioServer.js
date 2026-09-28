// lib/stock/libro/stockDiarioServer.js
//
// LAS CONSULTAS DEL STOCK DIARIO. Solo lectura, y solo sobre el libro.
//
// La semántica —estados del día, existencia, deltas, la identidad algebraica—
// vive en `stockDiario.js`, que es puro. Acá se le pregunta a PostgreSQL lo
// mínimo y se le pasa lo que devuelve.
//
// ── LAS TRES PREGUNTAS AL LIBRO ──────────────────────────────────────────
//
//   APERTURA de D: el último movimiento de la cadena con `dia < D`.
//   CIERRE de D:   el último movimiento de la cadena con `dia <= D`.
//   MOVIMIENTOS:   los de `dia` entre las dos puntas del período.
//
// "Último" es por (dia, id) DESCENDENTE. Dentro de una cadena el `id` crece en
// el orden real en que cambió el stock —se asigna con el candado de fila
// tomado— y el día nunca retrocede (el verificador lo exige), así que (dia, id)
// ordena igual que `id` y además deja que el índice
// `(localId, productoLocalId, dia, id)` encuentre la respuesta en un solo
// descenso. El INSTANTE no ordena una cadena: dos movimientos pueden caer en el
// mismo milisegundo. Solo se usa, con el `id` detrás, para listar movimientos de
// cadenas distintas.
//
// ── EL DÍA VIAJA COMO TEXTO ──────────────────────────────────────────────
//
// Los días entran como texto `YYYY-MM-DD` y se convierten a `date` EN LA BASE
// (`::date`). Salen con `to_char(…, 'YYYY-MM-DD')`, que no depende del
// DateStyle de la sesión. Si pasaran por un `Date` de JavaScript, en Argentina
// se correrían al día anterior. "Hoy" lo calcula PostgreSQL con las mismas
// funciones que estampan el `dia` de cada movimiento: `libro_stock_dia` sobre
// `libro_stock_instante()`, en `America/Argentina/Cordoba`.
//
// ── CONSISTENCIA ─────────────────────────────────────────────────────────
//
// Las preguntas de un mismo pedido se hacen en UNA transacción REPEATABLE READ
// de solo lectura: el día en curso sigue recibiendo movimientos, y una
// apertura, un cierre y unos movimientos leídos en momentos distintos podrían
// no cuadrar.
//
// ── SIN NEXT ─────────────────────────────────────────────────────────────
//
// Este módulo depende solo del libro y de `@prisma/client`: la sonda de la
// terminal (`scripts/stock-diario.mjs`) lo carga dentro de la imagen, donde
// `next/server` no resuelve. La semana, el mes y el año —que necesitan las
// vigencias de Semana Operativa, cuyo servidor arrastra el cliente de la app y
// su interceptor de auditoría— viven en `stockDiarioPorUnidadServer.js`. Un
// candado recorre el grafo de imports de la sonda y lo exige.

import { Prisma } from "@prisma/client";

import { TIPO_MOVIMIENTO, SIN_ORIGEN } from "./libroStock.js";
import {
  estadoDelPeriodo,
  exigirDia,
  exigirId,
  exigirPagina,
  existioEnElPeriodo,
  identidadMostrada,
  interpretarMovimiento,
  movidoDesdeAgregado,
  movidoDesdeMovimientos,
  stockDeCadena,
  totalesDeCadenas,
  estadoDesconocido,
  estadoSegunUltimo,
  ESTADO_DEL_DIA,
  MOTIVO_DESCONOCIDA,
} from "./stockDiario.js";

const { ESTADO_INICIAL, ALTA, CAMBIO, BAJA } = TIPO_MOVIMIENTO;

// Las columnas de un movimiento, con los números y los días como TEXTO.
const COLUMNAS = (a) => Prisma.sql`
  ${a}."id", ${a}."tipo"::text AS "tipo", ${a}."stockLocalId", ${a}."localId", ${a}."productoLocalId", ${a}."productoBaseId",
  ${a}."cantidadAnterior"::text AS "cantidadAnterior", ${a}."cantidadPosterior"::text AS "cantidadPosterior",
  ${a}."enTransitoAnterior"::text AS "enTransitoAnterior", ${a}."enTransitoPosterior"::text AS "enTransitoPosterior",
  to_char(${a}."instante", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "instante",
  to_char(${a}."dia", 'YYYY-MM-DD') AS "dia",
  ${a}."origen", ${a}."origenRef",
  ${a}."nombreCongelado", ${a}."codigoBarraCongelado", ${a}."unidadMedidaCongelada"
`;
const M = Prisma.raw('m');

/**
 * Corre `fn` con una instantánea de solo lectura. Si `db` ya es una
 * transacción, la usa tal cual: la instantánea es la del llamador.
 */
async function enInstantanea(db, fn) {
  if (typeof db.$transaction !== "function") return fn(db);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return fn(tx);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000, maxWait: 10_000 }
  );
}

// ════════════════════════════════════════════════════════════════════════════
// El reloj y el punto cero
// ════════════════════════════════════════════════════════════════════════════

/**
 * HOY EN ARGENTINA, SEGÚN POSTGRESQL. Las mismas dos funciones con las que el
 * trigger estampa el `dia` de cada movimiento, así "hoy" y el día de un
 * movimiento recién escrito no pueden diferir a medianoche.
 */
export async function hoyDelLibro(db) {
  const [r] = await db.$queryRaw`SELECT to_char("libro_stock_dia"("libro_stock_instante"()), 'YYYY-MM-DD') AS "hoy"`;
  return r.hoy;
}

/**
 * EL PUNTO CERO DEL LIBRO QUE SE ESTÁ MIRANDO: el primer movimiento, por `id`.
 * Es el ESTADO_INICIAL de la activación; si `StockLocal` estaba vacía al
 * activar, es el primer movimiento que haya. Null si el libro está vacío.
 */
export async function puntoCeroDelLibro(db) {
  const filas = await db.$queryRaw`
    SELECT to_char(m."instante", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "instante",
           to_char(m."dia", 'YYYY-MM-DD') AS "dia", m."tipo"::text AS "tipo"
    FROM "MovimientoStock" m ORDER BY m."id" LIMIT 1`;
  const f = filas[0];
  return f ? { instante: f.instante, dia: f.dia, conEstadoInicial: f.tipo === ESTADO_INICIAL } : null;
}

async function contexto(db, { desde, hasta, hoy }) {
  const puntoCero = await puntoCeroDelLibro(db);
  const hoyReal = hoy ?? (await hoyDelLibro(db));
  const periodo = estadoDelPeriodo({ desde, hasta, puntoCero, hoy: hoyReal });
  return { puntoCero, hoy: hoyReal, periodo };
}

// ════════════════════════════════════════════════════════════════════════════
// Una cadena
// ════════════════════════════════════════════════════════════════════════════

/** El último movimiento de UNA cadena antes de `dia` (estricto) o hasta `dia`. */
async function ultimoDeCadena(db, { localId, productoLocalId, dia, incluido }) {
  const filas = incluido
    ? await db.$queryRaw`
        SELECT ${COLUMNAS(M)} FROM "MovimientoStock" m
        WHERE m."localId" = ${localId} AND m."productoLocalId" = ${productoLocalId} AND m."dia" <= ${dia}::date
        ORDER BY m."dia" DESC, m."id" DESC LIMIT 1`
    : await db.$queryRaw`
        SELECT ${COLUMNAS(M)} FROM "MovimientoStock" m
        WHERE m."localId" = ${localId} AND m."productoLocalId" = ${productoLocalId} AND m."dia" < ${dia}::date
        ORDER BY m."dia" DESC, m."id" DESC LIMIT 1`;
  return filas[0] ?? null;
}

async function movimientosDeCadena(db, { localId, productoLocalId, desde, hasta }) {
  const filas = await db.$queryRaw`
    SELECT ${COLUMNAS(M)} FROM "MovimientoStock" m
    WHERE m."localId" = ${localId} AND m."productoLocalId" = ${productoLocalId}
      AND m."dia" BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY m."dia", m."id"`;
  return filas.map(interpretarMovimiento);
}

/**
 * EL ESTADO DE UNA CADENA AL CIERRE DE UN DÍA: si existía y con cuánto. Es la
 * pregunta más chica y la que usan las demás.
 */
export async function estadoDeCadenaAlCierre(db, { localId, productoLocalId, dia, hoy } = {}) {
  const l = exigirId(localId, "localId");
  const p = exigirId(productoLocalId, "productoLocalId");
  exigirDia(dia);
  return enInstantanea(db, async (tx) => {
    const { periodo } = await contexto(tx, { desde: dia, hasta: dia, hoy });
    if (periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA) return { estado: periodo.estado, ...estadoDesconocido(MOTIVO_DESCONOCIDA.FUERA_DE_HISTORIA) };
    const ultimo = await ultimoDeCadena(tx, { localId: l, productoLocalId: p, dia: periodo.hastaEfectivo, incluido: true });
    return { estado: periodo.estado, ...estadoSegunUltimo(ultimo), provisional: periodo.enCurso };
  });
}

async function identidadesDe(db, cadenas) {
  // cadenas: [{ productoLocalId, productoBaseId }]
  if (cadenas.length === 0) return new Map();
  const bases = [...new Set(cadenas.map((c) => c.productoBaseId))];
  const pls = [...new Set(cadenas.map((c) => c.productoLocalId))];
  const actuales = await db.$queryRaw`
    SELECT pb."id", pb."nombre", pb."codigo_barra" AS "codigoBarra", pb."unidad_medida"::text AS "unidadMedida",
           pb."categoria_id" AS "categoriaId", cat."nombre" AS "categoriaNombre"
    FROM "ProductoBase" pb LEFT JOIN "Categoria" cat ON cat."id" = pb."categoria_id"
    WHERE pb."id" = ANY(${bases}::int[])`;
  const vivos = await db.$queryRaw`SELECT pl."id" FROM "ProductoLocal" pl WHERE pl."id" = ANY(${pls}::int[])`;
  const porBase = new Map(actuales.map((a) => [Number(a.id), a]));
  const plVivos = new Set(vivos.map((v) => Number(v.id)));

  // La identidad congelada solo se busca para las cadenas cuyo producto ya no
  // existe: suelen ser pocas.
  const sinActual = cadenas.filter((c) => !porBase.has(c.productoBaseId));
  const congeladas = new Map();
  if (sinActual.length) {
    const localId = cadenas[0].localId;
    const filas = await db.$queryRaw`
      SELECT DISTINCT ON (m."productoLocalId") m."productoLocalId", m."nombreCongelado", m."codigoBarraCongelado", m."unidadMedidaCongelada"
      FROM "MovimientoStock" m
      WHERE m."localId" = ${localId} AND m."productoLocalId" = ANY(${sinActual.map((c) => c.productoLocalId)}::int[])
        AND m."tipo"::text = ${BAJA}
      ORDER BY m."productoLocalId", m."dia" DESC, m."id" DESC`;
    for (const f of filas) {
      congeladas.set(Number(f.productoLocalId), { nombre: f.nombreCongelado, codigoBarra: f.codigoBarraCongelado, unidadMedida: f.unidadMedidaCongelada });
    }
  }

  const r = new Map();
  for (const c of cadenas) {
    r.set(
      c.productoLocalId,
      identidadMostrada({
        productoBaseId: c.productoBaseId,
        actual: porBase.get(c.productoBaseId) ?? null,
        congelada: congeladas.get(c.productoLocalId) ?? null,
        productoLocalExiste: plVivos.has(c.productoLocalId),
      })
    );
  }
  return r;
}

async function reinterpretacionesDe(db, { localId, bases, desde, hasta }) {
  if (!desde) return [];
  const filas = await db.$queryRaw`
    SELECT r."id", r."entidad", r."entidadId", r."campo", r."valorAnterior", r."valorPosterior", r."filasConStock",
           to_char(r."instante", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "instante", to_char(r."dia", 'YYYY-MM-DD') AS "dia"
    FROM "ReinterpretacionDeStock" r
    WHERE r."dia" BETWEEN ${desde}::date AND ${hasta}::date
      AND ((r."entidad" = 'ProductoBase' AND r."entidadId" = ANY(${bases}::int[]))
           OR (r."entidad" = 'Local' AND r."entidadId" = ${localId}))
    ORDER BY r."id"`;
  return filas.map((f) => ({ ...f, id: Number(f.id), entidadId: Number(f.entidadId), filasConStock: Number(f.filasConStock) }));
}

function reinterpretacionesDeLaCadena(todas, localId, productoBaseId) {
  return todas.filter(
    (r) => (r.entidad === "ProductoBase" && r.entidadId === productoBaseId) || (r.entidad === "Local" && r.entidadId === localId)
  );
}

/**
 * EL STOCK DE UNA CADENA EN UN PERÍODO, con el detalle de sus movimientos.
 * `stockDiarioDeCadena` es el caso de un día.
 */
export async function stockDeCadenaEnPeriodo(db, { localId, productoLocalId, desde, hasta, hoy } = {}) {
  const l = exigirId(localId, "localId");
  const p = exigirId(productoLocalId, "productoLocalId");
  exigirDia(desde, "desde");
  exigirDia(hasta, "hasta");
  return enInstantanea(db, async (tx) => {
    const { periodo, puntoCero, hoy: h } = await contexto(tx, { desde, hasta, hoy });
    const fuera = periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA;
    const ultimoAntes = fuera || !periodo.aperturaConocida ? null : await ultimoDeCadena(tx, { localId: l, productoLocalId: p, dia: desde, incluido: false });
    const ultimoHasta = fuera ? null : await ultimoDeCadena(tx, { localId: l, productoLocalId: p, dia: periodo.hastaEfectivo, incluido: true });
    const movimientos = fuera ? [] : await movimientosDeCadena(tx, { localId: l, productoLocalId: p, desde: periodo.desdeEfectivo, hasta: periodo.hastaEfectivo });

    const baseId = Number((ultimoHasta ?? ultimoAntes ?? movimientos[0])?.productoBaseId ?? 0);
    const identidad = baseId ? (await identidadesDe(tx, [{ localId: l, productoLocalId: p, productoBaseId: baseId }])).get(p) : null;
    const reinterpretaciones = baseId && !fuera ? await reinterpretacionesDe(tx, { localId: l, bases: [baseId], desde: periodo.desdeEfectivo, hasta: periodo.hastaEfectivo }) : [];

    const cadena = stockDeCadena({
      localId: l,
      productoLocalId: p,
      periodo,
      ultimoAntes,
      ultimoHasta,
      movido: movidoDesdeMovimientos(movimientos),
      identidad,
      reinterpretaciones,
    });
    return { periodo, puntoCero, hoy: h, cadena: { ...cadena, existio: !fuera && existioEnElPeriodo(cadena) }, movimientos };
  });
}

/** EL STOCK DIARIO DE UNA CADENA: apertura, movimientos y cierre de UN día. */
export async function stockDiarioDeCadena(db, { localId, productoLocalId, dia, hoy } = {}) {
  exigirDia(dia);
  return stockDeCadenaEnPeriodo(db, { localId, productoLocalId, desde: dia, hasta: dia, hoy });
}

// ════════════════════════════════════════════════════════════════════════════
// Un local entero
// ════════════════════════════════════════════════════════════════════════════

/**
 * LO QUE UN GRUPO DE MOVIMIENTOS SUMA, con los nombres que lee
 * `movidoDesdeAgregado`. Una sola definición para el local entero y para una
 * cadena: el detalle de un producto tiene que sumar exactamente igual que su
 * fila en el listado.
 */
const SUMAS = Prisma.sql`
  count(*)::int AS "movimientos",
  count(*) FILTER (WHERE m."origen" = ${SIN_ORIGEN})::int AS "sinClasificar",
  count(*) FILTER (WHERE m."tipo"::text = ${ESTADO_INICIAL})::int AS "estadosIniciales",
  count(*) FILTER (WHERE m."tipo"::text = ${ALTA})::int AS "altas",
  count(*) FILTER (WHERE m."tipo"::text = ${CAMBIO})::int AS "cambios",
  count(*) FILTER (WHERE m."tipo"::text = ${BAJA})::int AS "bajas",
  sum(m."cantidadPosterior" - m."cantidadAnterior") FILTER (WHERE m."tipo"::text = ${CAMBIO} AND m."cantidadPosterior" > m."cantidadAnterior")::text AS "cEntradas",
  sum(m."cantidadAnterior" - m."cantidadPosterior") FILTER (WHERE m."tipo"::text = ${CAMBIO} AND m."cantidadPosterior" < m."cantidadAnterior")::text AS "cSalidas",
  sum(m."cantidadPosterior") FILTER (WHERE m."tipo"::text = ${ALTA})::text AS "cAparece",
  sum(m."cantidadAnterior") FILTER (WHERE m."tipo"::text = ${BAJA})::text AS "cDesaparece",
  sum(m."cantidadPosterior") FILTER (WHERE m."tipo"::text = ${ESTADO_INICIAL})::text AS "cPartida",
  sum(m."enTransitoPosterior" - m."enTransitoAnterior") FILTER (WHERE m."tipo"::text = ${CAMBIO} AND m."enTransitoPosterior" > m."enTransitoAnterior")::text AS "tEntradas",
  sum(m."enTransitoAnterior" - m."enTransitoPosterior") FILTER (WHERE m."tipo"::text = ${CAMBIO} AND m."enTransitoPosterior" < m."enTransitoAnterior")::text AS "tSalidas",
  sum(m."enTransitoPosterior") FILTER (WHERE m."tipo"::text = ${ALTA})::text AS "tAparece",
  sum(m."enTransitoAnterior") FILTER (WHERE m."tipo"::text = ${BAJA})::text AS "tDesaparece",
  sum(m."enTransitoPosterior") FILTER (WHERE m."tipo"::text = ${ESTADO_INICIAL})::text AS "tPartida"
`;

/**
 * LA CONSULTA DE UN LOCAL ENTERO. Exportada para que la prueba de base pueda
 * pedirle el plan (EXPLAIN) a la misma consulta que corre de verdad.
 *
 *   1. Las cadenas del local, TODAS las que alguna vez existieron —también las
 *      de productos borrados—, saltando por el índice: una búsqueda por cadena
 *      en vez de leer cada movimiento.
 *   2. Por cadena, el último movimiento antes de `desde` (apertura) y hasta
 *      `hasta` (cierre): un descenso cada uno por `(localId, productoLocalId,
 *      dia, id)`.
 *   3. Los movimientos del período, sumados por cadena, por `(localId, dia)`.
 *
 * `desde` es el primer día del período con historia conocida (si la apertura
 * no se conoce, la búsqueda igual no encuentra nada antes del punto cero).
 */
export function sqlStockDelLocal({ localId, desde, hasta }) {
  return Prisma.sql`
    WITH RECURSIVE cadenas AS (
      (SELECT m."productoLocalId" AS p FROM "MovimientoStock" m
        WHERE m."localId" = ${localId} ORDER BY m."productoLocalId" LIMIT 1)
      UNION ALL
      SELECT (SELECT m."productoLocalId" FROM "MovimientoStock" m
               WHERE m."localId" = ${localId} AND m."productoLocalId" > c.p
               ORDER BY m."productoLocalId" LIMIT 1)
      FROM cadenas c WHERE c.p IS NOT NULL
    ),
    movido AS (
      SELECT m."productoLocalId" AS p, ${SUMAS}
      FROM "MovimientoStock" m
      WHERE m."localId" = ${localId} AND m."dia" BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY m."productoLocalId"
    )
    SELECT c.p AS "productoLocalId",
           to_jsonb(a) AS "ultimoAntes", to_jsonb(z) AS "ultimoHasta", to_jsonb(g) AS "movido"
    FROM cadenas c
    LEFT JOIN LATERAL (
      SELECT ${COLUMNAS(M)} FROM "MovimientoStock" m
      WHERE m."localId" = ${localId} AND m."productoLocalId" = c.p AND m."dia" < ${desde}::date
      ORDER BY m."dia" DESC, m."id" DESC LIMIT 1
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT ${COLUMNAS(M)} FROM "MovimientoStock" m
      WHERE m."localId" = ${localId} AND m."productoLocalId" = c.p AND m."dia" <= ${hasta}::date
      ORDER BY m."dia" DESC, m."id" DESC LIMIT 1
    ) z ON true
    LEFT JOIN movido g ON g.p = c.p
    WHERE c.p IS NOT NULL
      AND ((a."id" IS NOT NULL AND a."tipo" <> ${BAJA}) OR g.p IS NOT NULL)
    ORDER BY c.p
  `;
}

/**
 * EL STOCK DE TODO UN LOCAL EN UN PERÍODO: una fila por cada cadena que existió
 * en algún momento del período, y los totales.
 *
 * @param {object} db
 * @param {{ localId:number, desde:string, hasta:string, hoy?:string }} args
 *   `hoy` es solo para las pruebas: en la app lo decide PostgreSQL.
 */
export async function stockDelPeriodo(db, { localId, desde, hasta, hoy } = {}) {
  const l = exigirId(localId, "localId");
  exigirDia(desde, "desde");
  exigirDia(hasta, "hasta");
  return enInstantanea(db, async (tx) => {
    const { periodo, puntoCero, hoy: h } = await contexto(tx, { desde, hasta, hoy });
    // Fuera de historia no hay números, tampoco un total en cero.
    if (periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA) {
      return { localId: l, periodo, puntoCero, hoy: h, cadenas: [], totales: null, reinterpretaciones: [] };
    }
    const filas = await tx.$queryRaw`${sqlStockDelLocal({ localId: l, desde: periodo.desdeEfectivo, hasta: periodo.hastaEfectivo })}`;

    const piezas = filas.map((f) => ({
      localId: l,
      productoLocalId: Number(f.productoLocalId),
      ultimoAntes: periodo.aperturaConocida ? f.ultimoAntes : null,
      ultimoHasta: f.ultimoHasta,
      agregado: f.movido,
    }));
    for (const x of piezas) x.productoBaseId = Number((x.ultimoHasta ?? x.ultimoAntes).productoBaseId);

    const identidades = await identidadesDe(tx, piezas);
    const reinterpretaciones = await reinterpretacionesDe(tx, {
      localId: l,
      bases: [...new Set(piezas.map((x) => x.productoBaseId))],
      desde: periodo.desdeEfectivo,
      hasta: periodo.hastaEfectivo,
    });

    const cadenas = piezas
      .map((x) =>
        stockDeCadena({
          localId: l,
          productoLocalId: x.productoLocalId,
          periodo,
          ultimoAntes: x.ultimoAntes,
          ultimoHasta: x.ultimoHasta,
          movido: movidoDesdeAgregado(x.agregado),
          identidad: identidades.get(x.productoLocalId) ?? null,
          reinterpretaciones: reinterpretacionesDeLaCadena(reinterpretaciones, l, x.productoBaseId),
        })
      )
      .filter(existioEnElPeriodo);

    return { localId: l, periodo, puntoCero, hoy: h, cadenas, totales: totalesDeCadenas(cadenas), reinterpretaciones };
  });
}

/** EL STOCK DIARIO DE UN LOCAL: todas sus cadenas, un día. */
export async function stockDiarioDelLocal(db, { localId, dia, hoy } = {}) {
  exigirDia(dia);
  return stockDelPeriodo(db, { localId, desde: dia, hasta: dia, hoy });
}

// ════════════════════════════════════════════════════════════════════════════
// Movimientos
// ════════════════════════════════════════════════════════════════════════════

/**
 * LOS MOVIMIENTOS DE UN DÍA. De una cadena, en su orden (`id`). De todo el
 * local, por instante y `id`: entre cadenas distintas el orden no cambia ningún
 * saldo, y el `id` desempata el mismo milisegundo.
 */
export async function movimientosDelDia(db, { localId, dia, productoLocalId = null } = {}) {
  const l = exigirId(localId, "localId");
  exigirDia(dia);
  if (productoLocalId !== null && productoLocalId !== undefined) {
    const p = exigirId(productoLocalId, "productoLocalId");
    return movimientosDeCadena(db, { localId: l, productoLocalId: p, desde: dia, hasta: dia });
  }
  const filas = await db.$queryRaw`
    SELECT ${COLUMNAS(M)} FROM "MovimientoStock" m
    WHERE m."localId" = ${l} AND m."dia" = ${dia}::date
    ORDER BY m."instante", m."id"`;
  return filas.map(interpretarMovimiento);
}

/**
 * UNA PÁGINA DE MOVIMIENTOS, paginada EN LA BASE. Exportada para que la prueba
 * de base le pida el plan a la misma consulta que corre de verdad.
 *
 * De una cadena, en su orden: (dia, id), que dentro de una cadena es el orden en
 * que cambió el stock y baja por `(localId, productoLocalId, dia, id)`. De todo
 * el local, por (instante, id): el `id` desempata el mismo milisegundo, así el
 * orden es estable entre páginas.
 *
 * El local se ordena escrito como (dia, instante, id), que es EL MISMO orden:
 * `dia` es `libro_stock_dia(instante)`, que no decrece con el instante —el
 * verificador del libro exige esa coherencia—. Escrito así, PostgreSQL recorre
 * `(localId, dia)` en orden y ordena solo dentro de cada día (Incremental Sort):
 * una página lee sus días, no el período entero. La prueba de base mide el plan.
 */
export function sqlMovimientosPagina({ localId, desde, hasta, productoLocalId = null, limite, desplazamiento }) {
  if (productoLocalId !== null) {
    return Prisma.sql`
      SELECT ${COLUMNAS(M)} FROM "MovimientoStock" m
      WHERE m."localId" = ${localId} AND m."productoLocalId" = ${productoLocalId}
        AND m."dia" BETWEEN ${desde}::date AND ${hasta}::date
      ORDER BY m."dia", m."id"
      LIMIT ${limite} OFFSET ${desplazamiento}`;
  }
  return Prisma.sql`
    SELECT ${COLUMNAS(M)} FROM "MovimientoStock" m
    WHERE m."localId" = ${localId} AND m."dia" BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY m."dia", m."instante", m."id"
    LIMIT ${limite} OFFSET ${desplazamiento}`;
}

async function paginaDeMovimientos(db, { localId, desde, hasta, productoLocalId = null, pagina }) {
  const filtroCadena = productoLocalId !== null ? Prisma.sql`AND m."productoLocalId" = ${productoLocalId}` : Prisma.empty;
  const [{ total }] = await db.$queryRaw`
    SELECT count(*)::int AS "total" FROM "MovimientoStock" m
    WHERE m."localId" = ${localId} ${filtroCadena} AND m."dia" BETWEEN ${desde}::date AND ${hasta}::date`;
  const filas = await db.$queryRaw`${sqlMovimientosPagina({
    localId,
    desde,
    hasta,
    productoLocalId,
    limite: pagina.pageSize,
    desplazamiento: (pagina.page - 1) * pagina.pageSize,
  })}`;
  return {
    total,
    page: pagina.page,
    pageSize: pagina.pageSize,
    totalPages: Math.max(1, Math.ceil(total / pagina.pageSize)),
    items: filas.map(interpretarMovimiento),
  };
}

const PAGINA_VACIA = (pagina) => ({ total: 0, page: pagina.page, pageSize: pagina.pageSize, totalPages: 1, items: [] });

/**
 * LOS MOVIMIENTOS DE UN LOCAL —o de una cadena— EN UN PERÍODO, de a una página.
 * El período se recorta como en `stockDelPeriodo`: desde el punto cero y hasta
 * hoy. Fuera de historia no hay movimientos que mostrar.
 */
export async function movimientosDelPeriodo(db, { localId, desde, hasta, productoLocalId = null, page, pageSize, hoy } = {}) {
  const l = exigirId(localId, "localId");
  const p = productoLocalId === null || productoLocalId === undefined ? null : exigirId(productoLocalId, "productoLocalId");
  exigirDia(desde, "desde");
  exigirDia(hasta, "hasta");
  const pagina = exigirPagina({ page, pageSize });
  return enInstantanea(db, async (tx) => {
    const { periodo, puntoCero, hoy: h } = await contexto(tx, { desde, hasta, hoy });
    if (periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA) {
      return { localId: l, periodo, puntoCero, hoy: h, movimientos: PAGINA_VACIA(pagina) };
    }
    const movimientos = await paginaDeMovimientos(tx, {
      localId: l,
      desde: periodo.desdeEfectivo,
      hasta: periodo.hastaEfectivo,
      productoLocalId: p,
      pagina,
    });
    return { localId: l, periodo, puntoCero, hoy: h, movimientos };
  });
}

/**
 * UNA CADENA EN UN PERÍODO, CON SUS MOVIMIENTOS DE A UNA PÁGINA.
 *
 * Lo mismo que `stockDeCadenaEnPeriodo`, pero sin traer todos los movimientos:
 * las sumas salen de la base con las MISMAS columnas que el listado del local
 * (`SUMAS`), y los movimientos se paginan. Todo en una sola instantánea: la
 * apertura, el cierre, las sumas y la página son del mismo momento.
 */
export async function detalleDeCadena(db, { localId, productoLocalId, desde, hasta, page, pageSize, hoy } = {}) {
  const l = exigirId(localId, "localId");
  const p = exigirId(productoLocalId, "productoLocalId");
  exigirDia(desde, "desde");
  exigirDia(hasta, "hasta");
  const pagina = exigirPagina({ page, pageSize });
  return enInstantanea(db, async (tx) => {
    const { periodo, puntoCero, hoy: h } = await contexto(tx, { desde, hasta, hoy });
    const fuera = periodo.estado === ESTADO_DEL_DIA.FUERA_DE_HISTORIA;
    const ultimoAntes = fuera || !periodo.aperturaConocida ? null : await ultimoDeCadena(tx, { localId: l, productoLocalId: p, dia: desde, incluido: false });
    const ultimoHasta = fuera ? null : await ultimoDeCadena(tx, { localId: l, productoLocalId: p, dia: periodo.hastaEfectivo, incluido: true });
    const [agregado] = fuera
      ? [null]
      : await tx.$queryRaw`
          SELECT ${SUMAS} FROM "MovimientoStock" m
          WHERE m."localId" = ${l} AND m."productoLocalId" = ${p}
            AND m."dia" BETWEEN ${periodo.desdeEfectivo}::date AND ${periodo.hastaEfectivo}::date`;
    const movimientos = fuera
      ? PAGINA_VACIA(pagina)
      : await paginaDeMovimientos(tx, { localId: l, desde: periodo.desdeEfectivo, hasta: periodo.hastaEfectivo, productoLocalId: p, pagina });

    // La base de la cadena sale del libro. Sin ningún movimiento hasta el cierre
    // la cadena todavía no existía: no hay identidad que mostrar.
    const baseId = Number((ultimoHasta ?? ultimoAntes)?.productoBaseId ?? 0);
    const identidad = baseId ? (await identidadesDe(tx, [{ localId: l, productoLocalId: p, productoBaseId: baseId }])).get(p) : null;
    const reinterpretaciones = baseId && !fuera ? await reinterpretacionesDe(tx, { localId: l, bases: [baseId], desde: periodo.desdeEfectivo, hasta: periodo.hastaEfectivo }) : [];

    const cadena = stockDeCadena({
      localId: l,
      productoLocalId: p,
      periodo,
      ultimoAntes,
      ultimoHasta,
      movido: movidoDesdeAgregado(agregado),
      identidad,
      reinterpretaciones,
    });
    return { periodo, puntoCero, hoy: h, cadena: { ...cadena, existio: !fuera && existioEnElPeriodo(cadena) }, movimientos };
  });
}
