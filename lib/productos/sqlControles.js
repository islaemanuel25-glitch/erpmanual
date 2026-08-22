// lib/productos/sqlControles.js
//
// CÓMO VIAJAN LAS COLUMNAS DE LOS CONTROLES. Nada más que eso.
//
// ── QUÉ PROBLEMA RESUELVE, CON EL NÚMERO ────────────────────────────────────
//
// Los cuatro controles se clasifican EN MEMORIA —dependen del precio y el costo
// efectivos, que Prisma no puede mergear en un `where`—, así que hay que traer el
// catálogo entero de la ubicación. Medido contra producción, con las 2.363 filas
// de "Casiano casas":
//
//   findMany con la relación `locales` anidada  ······  375–583 ms
//   Postgres, el mismo LEFT JOIN, EXPLAIN ANALYZE ····      2,3 ms
//
// O sea: **el tiempo no estaba en la base, estaba en el traslado.** Prisma arma un
// objeto por fila, un `Decimal` por cada columna numérica y una lista anidada por
// la relación; con 2.363 filas y 13 columnas eso son decenas de miles de objetos
// que se construyen para que la clasificación los lea una vez y los tire.
//
// Este módulo trae las MISMAS columnas por SQL crudo, con un LEFT JOIN en vez de
// la relación anidada, y las devuelve en la MISMA forma que devolvía Prisma
// —`{ ...base, locales: [local] }`— para que la clasificación no se entere.
//
// Medido igual, mismo día y misma base: **112 ms** contra 375. Y sigue habiendo
// margen: 81 de esos 112 son la consulta de ids, que es la que decide el universo
// y por eso NO se toca (abajo está el porqué).
//
// ── LO QUE ESTE MÓDULO NO HACE, Y ES LO IMPORTANTE ──────────────────────────
//
// **No decide qué productos entran.** Eso lo sigue resolviendo Prisma con
// `filtrosBaseDelCatalogo`, que es la pieza compartida entre el contador de las
// cards y el filtro del listado. Escribir el universo en SQL acá lo duplicaría, y
// el archivo de al lado ya cuenta cómo salió eso la última vez: al contador le
// faltaba la regla de combos y nadie lo vio, porque en desarrollo no hay combos.
//
// Por eso son dos pasos: Prisma contesta QUIÉNES —una lista de ids— y este SQL
// contesta CÓMO ESTÁN. El corte por el techo y el orden siguen saliendo de
// `opcionesDelTecho()`, así que el contador y el filtro cortan por el mismo lugar
// exactamente igual que antes.
//
// ── POR QUÉ LOS NÚMEROS VIAJAN COMO TEXTO ───────────────────────────────────
//
// `::float8` también anda y mide parecido. Se eligió `::text` porque es
// IDÉNTICO a lo que pasaba antes: la clasificación consume todo con `Number(...)`
// —`reglaDeGananciaDe`, `seVendeSinGanancia` y `diagnosticarMargen` lo hacen los
// tres—, y `Number("1234.56")` da exactamente el mismo double que
// `Number(new Decimal("1234.56"))`, porque el `Decimal` de Prisma se construye
// desde esa misma cadena. Con `float8` la conversión la haría Postgres: da lo
// mismo en la práctica, pero es OTRA conversión, y no hay motivo para introducir
// una diferencia que hay que ir a demostrar.
//
// Está comprobado y no deducido: la contraprueba corrió los dos caminos sobre los
// 2.363 productos de producción y comparó los CUATRO controles de cada uno más
// los siete campos mergeados. Cero diferencias.
//
// ── EL PELIGRO DEL SQL CRUDO, Y CÓMO SE ATA ─────────────────────────────────
//
// Una consulta cruda no la revisa nadie: Prisma no la mira, el build no la mira y
// los candados de dominio tampoco. Si mañana una columna se renombra en el
// schema, el `select` de Prisma falla al compilar la consulta y esto seguiría
// pidiendo una columna que ya no existe, fallando recién contra Postgres.
//
// Por eso la lista de columnas NO está escrita acá: se DERIVA de
// `SELECT_CONTROLES_BASE` y `SELECT_CONTROLES_LOCAL`, que son las mismas
// constantes que ya tenían su candado contra `prisma/schema.prisma`. Agregar un
// campo al select lo agrega al SQL solo, y un campo que el schema no tenga pone
// rojo ese candado antes de llegar a la base.
//
// Lo único que sí está declarado a mano es CUÁLES son decimales —hay que saberlo
// para castear—, y tiene su propio candado que lo compara contra el schema en las
// dos direcciones.

import {
  SELECT_CONTROLES_BASE,
  SELECT_CONTROLES_LOCAL,
  opcionesDelTecho,
  seTrunco,
  dentroDelTecho,
} from "./controlesDesdePrisma";

/**
 * ── LOS CAMPOS QUE POSTGRES DEVUELVE COMO `numeric` ────────────────────────
 *
 * Son los que hay que castear a texto. Está escrito a mano porque el tipo vive en
 * `schema.prisma` y este módulo no lo puede leer en tiempo de ejecución — pero no
 * queda librado a la memoria: un candado compara esta lista contra el schema en
 * las DOS direcciones, así que sobra tanto olvidarse uno como poner uno de más.
 *
 * `factor_pack` NO está: es `Int`, y Postgres ya lo devuelve como número.
 */
export const CAMPOS_DECIMAL = new Set([
  "precio_costo",
  "precio_venta",
  "margen",
  "pesoReferenciaKg",
  "recargoFijoUnidad",
]);

/** Los campos de cada lado, en el orden en que los declara el select. */
export const CAMPOS_BASE = Object.keys(SELECT_CONTROLES_BASE);
export const CAMPOS_LOCAL = Object.keys(SELECT_CONTROLES_LOCAL);

/**
 * Un campo del schema como columna SQL.
 *
 * Va SIEMPRE entre comillas: Prisma crea las columnas con el nombre exacto del
 * schema, así que `pesoReferenciaKg` sin comillas se leería `pesoreferenciakg` y
 * la consulta fallaría. Con comillas funcionan los dos estilos —`precio_costo` y
 * `pesoReferenciaKg`— sin tener que distinguirlos.
 */
const columna = (alias, campo) =>
  CAMPOS_DECIMAL.has(campo)
    ? `${alias}."${campo}"::text AS "${alias}_${campo}"`
    : `${alias}."${campo}" AS "${alias}_${campo}"`;

/**
 * ── LA CONSULTA ────────────────────────────────────────────────────────────
 *
 * Dos parámetros posicionales y ninguna interpolación de datos:
 *
 *   $1 — los ids del universo, que ya resolvió Prisma
 *   $2 — la ubicación
 *
 * Lo único que se concatena son los NOMBRES DE COLUMNA, y salen de las constantes
 * de arriba: no hay ningún camino por el que algo escrito por una persona llegue
 * al texto de la consulta. Por eso se puede usar `$queryRawUnsafe` sin que el
 * nombre signifique lo que parece — lo "unsafe" de esa función es que no escapa lo
 * que se le concatena, y acá no se le concatena nada de afuera.
 *
 * `ORDER BY b.id ASC` repite el orden de `ORDEN_DEL_TECHO`. No es decorativo: la
 * lista de ids ya viene cortada por ese mismo orden, y devolverlas desordenadas
 * haría que dos corridas armaran el arreglo distinto sin cambiar el resultado —
 * que es la clase de diferencia que después nadie puede explicar.
 */
export const SQL_CONTROLES = [
  "SELECT",
  [
    ...CAMPOS_BASE.map((c) => columna("b", c)),
    ...CAMPOS_LOCAL.map((c) => columna("l", c)),
  ].join(",\n       "),
  'FROM "ProductoBase" b',
  'LEFT JOIN "ProductoLocal" l ON l."baseId" = b.id AND l."localId" = $2',
  "WHERE b.id = ANY($1::int[])",
  "ORDER BY b.id ASC",
].join("\n");

/**
 * Una fila cruda a la forma que devolvía `findMany`.
 *
 * ── POR QUÉ SE DEVUELVE LA FORMA VIEJA Y NO UNA MEJOR ─────────────────────
 *
 * Porque el que la consume es `filaParaControles`, y esa función es la que
 * garantiza que el contador y el filtro mergeen igual. Cambiarle la entrada
 * obligaría a tocarla, y ahí es donde se separan los dos números. Este módulo
 * cambia el transporte y nada más.
 *
 * `locales` es un arreglo de 0 o 1 elemento, igual que con `take: 1`: sin
 * ProductoLocal para la ubicación, el LEFT JOIN devuelve todo en null y acá queda
 * la lista vacía — que es lo que `filaParaControles` interpreta como "sin
 * override", su caso ya probado.
 */
export function filaCrudaAFilaPrisma(cruda) {
  const base = {};
  for (const campo of CAMPOS_BASE) base[campo] = cruda[`b_${campo}`] ?? null;
  // El id llega como número, pero se normaliza igual: si algún día la columna
  // pasa a `BigInt`, `$queryRaw` devolvería un BigInt y la comparación contra los
  // ids de Prisma dejaría de dar sin que nadie lo note.
  base.id = cruda.b_id === null || cruda.b_id === undefined ? null : Number(cruda.b_id);

  // Sin fila del local, el JOIN deja TODO en null. Se mira `l_id` y no un campo
  // cualquiera: un ProductoLocal puede existir con el precio en null, así que
  // preguntar por el precio confundiría "no hay override" con "hay override sin
  // precio", que son dos cosas distintas para la clasificación.
  if (cruda.l_id === null || cruda.l_id === undefined) return { ...base, locales: [] };

  const local = {};
  for (const campo of CAMPOS_LOCAL) local[campo] = cruda[`l_${campo}`] ?? null;
  local.id = Number(cruda.l_id);
  local.localId = Number(cruda.l_localId);

  return { ...base, locales: [local] };
}

/**
 * ── LA ÚNICA FORMA DE TRAER FILAS PARA CLASIFICAR ─────────────────────────
 *
 * La usan las DOS rutas: el contador de las cards y el filtro del listado. Antes
 * cada una tenía su propio `findMany` con su propio `select` y su propio
 * `opcionesDelTecho()` — dos consultas escritas al lado, que es exactamente lo
 * que este repo ya pagó una vez cuando a una le faltó la regla de combos.
 *
 * Recibe `prisma` como argumento en vez de importarlo. Así este módulo no
 * arrastra el cliente y sus candados siguen corriendo en milisegundos sin base de
 * datos ni cliente generado.
 *
 * @param {object} prisma
 * @param {object} opciones.where    el universo, ya armado con `filtrosBaseDelCatalogo`
 * @param {number} opciones.localId
 * @returns {Promise<{filas: Array, truncado: boolean}>} filas en la forma de `findMany`
 */
export async function traerFilasParaControles(prisma, { where, localId }) {
  // PASO 1 — QUIÉNES. Lo decide Prisma con el `where` compartido, y corta con el
  // techo y el orden compartidos. Nada de esto se movió a SQL a propósito.
  const conIds = await prisma.productoBase.findMany({
    where,
    ...opcionesDelTecho(),
    select: { id: true },
  });

  // El truncado se calcula ACÁ, sobre la consulta que trae una fila de más — que
  // es lo que lo hace detectable. Si se calculara sobre el resultado del SQL,
  // como ahí ya vienen cortadas, nunca se prendería.
  const truncado = seTrunco(conIds);
  const ids = dentroDelTecho(conIds).map((f) => f.id);

  if (ids.length === 0) return { filas: [], truncado };

  // PASO 2 — CÓMO ESTÁN. Las columnas, por SQL crudo. Ver arriba el porqué y el
  // número.
  const crudas = await prisma.$queryRawUnsafe(SQL_CONTROLES, ids, localId);

  return { filas: crudas.map(filaCrudaAFilaPrisma), truncado };
}
