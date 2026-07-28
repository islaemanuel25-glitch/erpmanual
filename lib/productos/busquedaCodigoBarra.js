// lib/productos/busquedaCodigoBarra.js
//
// Condición CENTRALIZADA de búsqueda/escaneo por código de barras, para que todos
// los buscadores por ubicación reconozcan los MISMOS tres códigos y ninguno quede
// desalineado:
//   1) codigo_barra_propio  → del ProductoLocal de la ubicación activa (por local);
//   2) codigo_barra          → global de ProductoBase;
//   3) codigo_barra_secundario → global de ProductoBase.
//
// El código propio es local POR CONSTRUCCIÓN: las queries de escaneo ya filtran por
// `localId` sobre ProductoLocal, así que un código propio de otro local jamás matchea.

/**
 * Cláusula OR de match EXACTO para una query de **ProductoLocal** ya acotada por
 * `localId`. Se usa dentro de `where: { localId, activo, base: { activo:true }, OR: <esto> }`.
 */
export function orCodigoBarraProductoLocal(codigo) {
  return [
    { codigo_barra_propio: codigo },
    { base: { OR: [{ codigo_barra: codigo }, { codigo_barra_secundario: codigo }] } },
  ];
}

/**
 * Cláusula OR de match por código para una query de **ProductoBase** acotada a un
 * `localId` (listados base-céntricos). Incluye los dos globales + el propio del
 * ProductoLocal de ESE local vía relación. `mode` opcional para case-insensitive.
 * `op` es "equals" | "contains".
 */
export function orCodigoBarraBaseLocal(codigo, localId, { op = "equals", mode } = {}) {
  const cond = mode ? { [op]: codigo, mode } : { [op]: codigo };
  return [
    { codigo_barra: cond },
    { codigo_barra_secundario: cond },
    { locales: { some: { localId, codigo_barra_propio: cond } } },
  ];
}

/**
 * Los códigos "escaneables" de un ProductoLocal (para ranking/getCodigo del fuzzy):
 * propio + los dos globales de la base. Filtra vacíos/null.
 */
export function codigosDeProductoLocal(pl) {
  return [pl?.codigo_barra_propio, pl?.base?.codigo_barra, pl?.base?.codigo_barra_secundario].filter(Boolean);
}

/**
 * Los códigos escaneables de un ITEM DTO ya mapeado (front/rankeo client-side):
 * codigoBarraPropio + codigoBarra + codigoBarraSecundario.
 */
export function codigosDeItem(item) {
  return [item?.codigoBarraPropio, item?.codigoBarra, item?.codigoBarraSecundario].filter(Boolean);
}
