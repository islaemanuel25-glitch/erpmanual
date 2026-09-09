// lib/productos/buscarCatalogoLocal.js
//
// BUSCAR EN EL CATÁLOGO DE UN LOCAL. Una sola vez, para todos los que lo pidan.
//
// ── DE DÓNDE SALE ─────────────────────────────────────────────────────────
//
// De `app/api/pos-transferencias/buscarProductos/route.js`, que es donde hoy
// funciona. Se saca tal cual está: mismo universo —productos del local, visibles
// según `productoVisibleWhere`, sin combos—, mismo ranking, mismos límites y el
// mismo `mapItem`.
//
// La recepción de transferencias necesita EXACTAMENTE la misma búsqueda pero con
// otra autorización: el que busca es el local DESTINO y el catálogo es el del
// ORIGEN. La salida fácil era copiar las cien líneas y cambiarle el `checkPerm`.
// Dos buscadores no se rompen el día que se escriben: se rompen el día que uno
// aprende a excluir algo y el otro no. Ya pasó en este repo con el resolutor de
// alias duplicado.
//
// ── LO QUE ESTE MÓDULO NO DECIDE ──────────────────────────────────────────
//
// QUIÉN puede buscar y en QUÉ local. Eso es de cada ruta y es lo único que las
// diferencia: `pos-transferencias` exige `pos_transferencias.ver` y que el
// origen sea el local de la sesión; la recepción exige `transferencias.recibir`
// y que el local de la sesión sea el DESTINO de esa transferencia, con el origen
// resuelto contra la transferencia persistida y no contra el request.
//
// Recibe el cliente por parámetro y no importa `@/lib/prisma`: así se puede
// ejercer contra una transacción o contra una base de prueba.

import { productoVisibleWhere } from "@/lib/visibilidad";
import {
  rankearLiteral,
  resolverContraCatalogo,
} from "@/lib/productos/busquedaFuzzyProducto";
import { codigosDeProductoLocal } from "@/lib/productos/busquedaCodigoBarra";

export const FUZZY_CANDIDATE_LIMIT = 10000;
export const FUZZY_TOP_RESULTS = 10;
export const SIN_QUERY_LIMIT = 50;

/**
 * El universo buscable de un local: sus productos, visibles para él, sin combos.
 *
 * Los combos quedan afuera acá y no en cada llamador: un combo no tiene stock
 * físico propio, así que no se puede transferir ni recibir. Es la misma regla que
 * ya aplicaban las dos consultas del buscador original, escrita una vez.
 */
export function whereCatalogoLocal(localId) {
  return {
    localId: Number(localId),
    base: { AND: [productoVisibleWhere(Number(localId)), { es_combo: false }] },
  };
}

/** La forma en que un producto sale al mundo. Idéntica a la del buscador original. */
/**
 * LA PROYECCIÓN QUE SALE POR EL ENDPOINT DE RECEPCIÓN, Y NADA MÁS.
 *
 * ── QUÉ SE SACA Y POR QUÉ NO ALCANZA CON NO DIBUJARLO ─────────────────────
 *
 * `mapItemCatalogo` trae `stockActual` y `precioCosto` porque el POS los usa: el
 * vendedor necesita saber si hay y a cuánto. **Quien recibe mercadería no.**
 *
 * Y no alcanza con que la pantalla no los muestre: mientras viajen en el JSON
 * están a un `fetch` de distancia de cualquiera con permiso de recibir, y el
 * permiso de recibir no es el permiso de ver costos. Un campo que no tiene por
 * qué salir, no sale.
 *
 * Tampoco se resuelve con un `delete obj.stockActual` en la ruta: eso hay que
 * acordarse de repetirlo cada vez que alguien agregue un campo al mapper de
 * arriba. Con una proyección explícita, lo nuevo NO sale hasta que alguien lo
 * ponga acá a propósito.
 *
 * ── QUÉ SÍ NECESITA LA RECEPCIÓN ──────────────────────────────────────────
 *
 * Identificar el producto —nombre y los tres códigos escaneables—, saber en qué
 * presentación pudo haber llegado —`factorPack`— y poder agruparlo por categoría.
 * Nada de eso dice cuánto hay ni cuánto cuesta.
 *
 * El buscador compartido sigue conociendo todos los campos: el límite es el
 * endpoint público de recepción, no la búsqueda interna. Y el POS no se toca.
 */
export function mapProductoParaRecepcion(item) {
  return {
    productoLocalId: item.productoLocalId,
    baseId: item.baseId,
    nombre: item.nombre,
    codigoBarra: item.codigoBarra,
    codigoBarraSecundario: item.codigoBarraSecundario,
    codigoBarraPropio: item.codigoBarraPropio,
    unidadMedida: item.unidadMedida,
    factorPack: item.factorPack,
    // ── LO QUE HACE FALTA PARA SABER SI ES UNA PIEZA ──────────────────────
    //
    // Sin estos dos, un fiambre de pieza fija —que tiene `unidad_medida = "kg"`—
    // se ofrece como si fuera a granel, y quien agrega el producto termina
    // escribiendo kilos donde el depósito cuenta piezas.
    //
    // No son stock ni costo: son cómo se cuenta el producto, que es exactamente
    // lo que esta pantalla necesita decidir.
    modoVentaDeposito: item.modoVentaDeposito ?? null,
    pesoReferenciaKg: item.pesoReferenciaKg ?? null,
    modoCompraProveedor: item.modoCompraProveedor ?? null,
    categoriaNombre: item.categoriaNombre,
  };
}

export function mapItemCatalogo(productoLocal) {
  const base = productoLocal.base;
  const stockActual = Number(productoLocal.stock?.[0]?.cantidad || 0);
  return {
    productoLocalId: productoLocal.id,
    baseId: productoLocal.baseId,
    nombre: productoLocal.nombre || base?.nombre || "",
    codigoBarra: base?.codigo_barra || "",
    codigoBarraSecundario: base?.codigo_barra_secundario || "",
    codigoBarraPropio: productoLocal?.codigo_barra_propio || "",
    stockActual,
    precioCosto: Number(productoLocal.precio_costo || base?.precio_costo || 0),
    unidadMedida: base?.unidad_medida || "unidad",
    factorPack: Number(base?.factor_pack || 1),
    // Cómo se cuenta el producto en el depósito. Lo consume la proyección de
    // recepción para distinguir una PIEZA de un kilo — un fiambre de pieza fija
    // dice "kg" y se despacha por piezas.
    modoVentaDeposito: base?.modoVentaDeposito ?? null,
    modoCompraProveedor: base?.modoCompraProveedor ?? null,
    pesoReferenciaKg:
      base?.pesoReferenciaKg == null ? null : Number(base.pesoReferenciaKg),
    categoriaNombre: base?.categoria?.nombre ?? null,
    areaFisicaNombre: base?.area_fisica?.nombre ?? null,
  };
}

/**
 * BUSCAR.
 *
 * Sin `q`: la lista corta de siempre, para que la pantalla tenga algo que
 * mostrar antes de que alguien escriba.
 *
 * Con `q`: se carga el catálogo del local y se rankea EN MEMORIA. No es un
 * capricho: el `take` fijo con LIKE dejaba afuera matches válidos —"leche" no
 * encontraba "Leche Cotar" porque caía después del 30—, y ese defecto ya se pagó.
 *
 * Manual y voz comparten universo y difieren solo en el ranking: la voz tolera
 * variantes y distancia de edición, lo manual es substring e inicio de palabra.
 *
 * @param {*} db cliente Prisma o tx
 * @returns {Promise<{items: Array, total: number, queryInterpretada: string|null}>}
 */
export async function buscarCatalogoLocal(db, { localId, q = "", fromVoice = false } = {}) {
  const texto = String(q || "").trim();
  const where = whereCatalogoLocal(localId);

  if (!texto) {
    const productos = await db.productoLocal.findMany({
      where,
      include: {
        base: { include: { categoria: true, area_fisica: true } },
        stock: { where: { localId: Number(localId) }, select: { cantidad: true } },
      },
      take: SIN_QUERY_LIMIT,
    });
    const items = productos.map(mapItemCatalogo);
    return { items, total: items.length, queryInterpretada: null };
  }

  const candidatos = await db.productoLocal.findMany({
    where,
    select: {
      id: true,
      nombre: true,
      codigo_barra_propio: true,
      base: { select: { nombre: true, codigo_barra: true, codigo_barra_secundario: true } },
    },
    take: FUZZY_CANDIDATE_LIMIT,
  });

  const getNombre = (p) => p.nombre || p.base?.nombre || "";
  const getCodigo = (p) => codigosDeProductoLocal(p);

  let rankings;
  let queryInterpretada = null;
  if (fromVoice) {
    const resuelto = resolverContraCatalogo(candidatos, texto, {
      getNombre,
      getCodigo,
      maxDistance: 3,
    });
    rankings = resuelto.rankings;
    queryInterpretada = resuelto.queryInterpretada;
  } else {
    rankings = rankearLiteral(candidatos, texto, { getNombre, getCodigo });
  }

  const topIds = rankings.slice(0, FUZZY_TOP_RESULTS).map((r) => r.item.id);
  if (topIds.length === 0) {
    return { items: [], total: 0, queryInterpretada: fromVoice ? null : null };
  }

  const productosFull = await db.productoLocal.findMany({
    where: { id: { in: topIds } },
    include: {
      base: { include: { categoria: true, area_fisica: true } },
      stock: { where: { localId: Number(localId) }, select: { cantidad: true } },
    },
  });
  const orden = new Map(topIds.map((id, idx) => [id, idx]));
  productosFull.sort((a, b) => orden.get(a.id) - orden.get(b.id));

  const items = productosFull.map(mapItemCatalogo);
  return { items, total: items.length, queryInterpretada };
}

/**
 * ¿ESTE PRODUCTO PERTENECE AL CATÁLOGO DE ESTE LOCAL?
 *
 * Es la contracara de la búsqueda y existe para lo mismo: que quien agregue una
 * línea en recepción no pueda nombrar un producto de otro origen. Se pregunta
 * con el MISMO `where` que la búsqueda, así que lo que no se puede encontrar
 * tampoco se puede agregar. Si fueran dos filtros distintos, uno se quedaría
 * atrás.
 *
 * @returns {Promise<object|null>} el `ProductoLocal` con su base, o null.
 */
export function productoDelCatalogoLocal(db, { localId, productoLocalId }) {
  const id = Number(productoLocalId);
  if (!Number.isInteger(id) || id <= 0) return Promise.resolve(null);
  return db.productoLocal.findFirst({
    where: { ...whereCatalogoLocal(localId), id },
    include: { base: true },
  });
}
