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

// ── CEROS A LA IZQUIERDA: EAN-13 CONTRA UPC-A ───────────────────────────────
//
// Un mismo producto puede estar cargado como UPC-A de 12 dígitos y leerse como
// EAN-13 —el mismo número con un 0 adelante—, o al revés. Para el escáner del POS
// eso es el MISMO código. Solo vale en la familia GTIN de 12 a 14 dígitos: un
// código interno corto como "0123" contra "123" NO se considera igual, porque
// ahí el cero sí distingue.
const GTIN = /^\d{12,14}$/;

/** Dos códigos son el mismo GTIN si difieren solo en ceros a la izquierda. */
export function mismoCodigoGtin(a, b) {
  const x = String(a ?? "").trim();
  const y = String(b ?? "").trim();
  if (!GTIN.test(x) || !GTIN.test(y)) return false;
  return x.replace(/^0+/, "") === y.replace(/^0+/, "");
}

/**
 * Las formas de 12 a 14 dígitos del mismo GTIN, para buscarlas en la base. Un
 * código que no es GTIN devuelve solo él mismo.
 */
export function variantesGtin(codigo) {
  const c = String(codigo ?? "").trim();
  if (!GTIN.test(c)) return [c];
  const sinCeros = c.replace(/^0+/, "");
  const out = new Set([c]);
  for (const largo of [12, 13, 14]) {
    if (sinCeros.length <= largo) out.add(sinCeros.padStart(largo, "0"));
  }
  return [...out];
}

/**
 * EL BUSCADOR POR CÓDIGO DEL POS, para todos los que lo necesiten. Devuelve el
 * ProductoLocal de `localId` que ese código identifica, o null.
 *
 * Vivía adentro de `pos-ventas/buscar-producto` y Stock buscaba por su cuenta,
 * mirando solo los dos códigos globales de la base: el código propio que un local
 * le agrega a un producto del depósito la caja lo leía y Stock no.
 *
 * El orden es la regla:
 *   1. el código PROPIO del local, letra por letra. Gana sobre un global igual de
 *      otro producto: es lo que el local decidió para su góndola;
 *   2. los globales —principal y secundario—, por `orCodigoBarraProductoLocal`;
 *   3. lo mismo con el MISMO GTIN escrito con otros ceros a la izquierda (UPC-A de
 *      12 contra EAN-13). Va al final a propósito: si estuvieran cargadas las dos
 *      formas, gana la que coincide letra por letra.
 *
 * Solo cuenta `localId`: un código propio de otro local no encuentra nada acá.
 * `consulta` es el `include` o `select` que quiere quien llama.
 */
export async function buscarProductoLocalPorCodigo(db, { localId, codigo, consulta = {} }) {
  const exacto = String(codigo ?? "").trim();
  if (!exacto) return null;
  const delLocal = { localId: Number(localId), activo: true, base: { activo: true } };
  const buscar = (where) => db.productoLocal.findFirst({ where: { ...delLocal, ...where }, ...consulta });
  const intentar = async (c) =>
    (await buscar({ codigo_barra_propio: c })) ?? (await buscar({ OR: orCodigoBarraProductoLocal(c) }));

  const fila = await intentar(exacto);
  if (fila) return fila;
  const otrasFormas = variantesGtin(exacto).filter((v) => v !== exacto);
  return otrasFormas.length ? intentar({ in: otrasFormas }) : null;
}

/**
 * Los códigos escaneables de un ITEM DTO ya mapeado (front/rankeo client-side):
 * codigoBarraPropio + codigoBarra + codigoBarraSecundario.
 */
export function codigosDeItem(item) {
  return [item?.codigoBarraPropio, item?.codigoBarra, item?.codigoBarraSecundario].filter(Boolean);
}
