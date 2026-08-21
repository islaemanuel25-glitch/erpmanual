// lib/productos/whereCatalogo.js
//
// QUÉ PRODUCTOS EXISTEN PARA UNA UBICACIÓN. Los filtros ESTRUCTURALES del
// catálogo: los que no dependen de lo que la persona haya elegido, sino de dónde
// está parada.
//
// ── POR QUÉ SE SACÓ A UN LUGAR SOLO ─────────────────────────────────────────
//
// Porque hay dos consumidores que TIENEN que ver el mismo universo: el listado
// —`/api/productos/listar`— y el contador de "Para revisar"
// —`/api/productos/controles`—. El criterio de aceptación del issue #2 es que
// tocar una card filtre exactamente los productos que componen ese contador, y
// eso no se puede prometer si cada uno arma su propio `where`.
//
// Y no es hipotético: el contador se escribió con `productoVisibleWhere` y
// `activo`, y le faltaba la regla de combos. Con un combo de otro local en la
// base, la card habría contado uno que el listado no muestra, y el número no
// habría cerrado. **No se vio en la primera corrida de la sonda porque en los
// datos de desarrollo no hay ningún combo** — la propia sonda lo dice, "11 · NO
// EJERCIDO". Un caso que no ocurre en la base de prueba pasa en verde igual.
//
// ── LAS TRES REGLAS, Y NINGUNA ES OPCIONAL ─────────────────────────────────
//
//   1. GRUPO. Un producto de otro grupo no existe para esta ubicación.
//
//   2. VISIBILIDAD depósito/local. El depósito no ve lo que crearon los locales;
//      cada local ve lo del depósito más lo suyo, y nada de los otros. La decide
//      `productoVisibleWhere`, que es la misma pieza que usa el resto del ERP.
//
//   3. COMBOS, que es la que se había perdido. Un combo se ve SOLO en el local
//      que lo creó, incluso si nació en el depósito — al revés que un producto
//      normal, que baja del depósito a todos.
//
// El filtro de ACTIVO no está acá a propósito: el listado lo deja elegir
// —activos, inactivos, todos— y el contador lo fija en activos. Son decisiones
// distintas sobre el mismo universo, no partes del universo.

import { productoVisibleWhere } from "@/lib/visibilidad";

/**
 * Los filtros estructurales del catálogo para una ubicación.
 *
 * Devuelve un ARRAY para que cada consumidor lo meta en su propio `AND` junto
 * con lo suyo, en vez de recibir un objeto ya cerrado que después haya que
 * desarmar.
 */
export function filtrosBaseDelCatalogo({ grupoId, localId }) {
  return [
    { grupoId },
    productoVisibleWhere(localId),
    { OR: [{ es_combo: false }, { es_combo: true, creadoEnLocalId: localId }] },
  ];
}
