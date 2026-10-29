// lib/productos/busquedaComoLaCaja.js
//
// LA BÚSQUEDA POR TEXTO DE LA CAJA, PARA QUIEN NECESITE BUSCAR IGUAL.
//
// Sale tal cual de `app/api/pos-ventas/buscar-producto/route.js`, que es donde
// hoy funciona: qué se trae de cada candidato, de dónde sale el nombre que se
// compara, qué códigos cuentan, y la coincidencia literal (`rankearLiteral`:
// código exacto > nombre exacto > empieza con > una palabra empieza con >
// contiene). El orden de los resultados es el de esa función.
//
// La usa también el Control de stock: buscar "coca" tiene que encontrar lo
// mismo y en el mismo orden que en la caja. Escribir otra búsqueda "parecida"
// es dejar que un día la caja encuentre un producto y el control no.
//
// No decide el universo —qué productos son candidatos—: eso es de cada pantalla.

import { rankearLiteral } from "@/lib/productos/busquedaFuzzyProducto";
import { buscarProductoLocalPorCodigo, codigosDeProductoLocal } from "@/lib/productos/busquedaCodigoBarra";

/** Lo que se trae de cada candidato para poder compararlo. */
export const SELECT_CANDIDATO_DE_BUSQUEDA = Object.freeze({
  id: true,
  // La ficha: Productos lista fichas y ordena las suyas por este ranking.
  baseId: true,
  nombre: true,
  codigo_barra_propio: true,
  base: { select: { nombre: true, codigo_barra: true, codigo_barra_secundario: true } },
});

/** El nombre que se compara: el del producto del local, o el de la ficha. */
export const nombreDeBusqueda = (p) => p.nombre || p.base?.nombre || "";

/** Los códigos que cuentan como coincidencia exacta: propio, principal y secundario. */
export const codigosDeBusqueda = (p) => codigosDeProductoLocal(p);

/** Cuántos productos del local mira la caja como mucho. */
export const TOPE_CANDIDATOS_DE_LA_CAJA = 10000;

/**
 * EL UNIVERSO DE LA CAJA: los productos activos del local con su ficha activa.
 * Sin `orderBy` a propósito: el empate del ranking lo decide este orden, así
 * que quien quiera el mismo orden que la caja tiene que pedir esto mismo.
 * Salió de `pos-ventas/buscar-producto` (2026-10-29) para que Productos lo use.
 */
export function candidatosDeLaCaja(db, localId) {
  return db.productoLocal.findMany({
    where: { localId, activo: true, base: { activo: true } },
    select: SELECT_CANDIDATO_DE_BUSQUEDA,
    take: TOPE_CANDIDATOS_DE_LA_CAJA,
  });
}

/** La coincidencia literal de la caja, ordenada como la caja. */
export function rankearComoLaCaja(candidatos, q) {
  return rankearLiteral(candidatos, q, { getNombre: nombreDeBusqueda, getCodigo: codigosDeBusqueda });
}

/**
 * LA BÚSQUEDA MANUAL DE LA CAJA, ENTERA, para quien no arma ítems de venta: los
 * productos del local (`{ id, baseId }`) en el orden en que los muestra la caja.
 * Son los dos pasos de `pos-ventas/buscar-producto`, con sus mismas piezas: un
 * código del local trae ese producto solo (`buscarProductoLocalPorCodigo`, el
 * escaneo de la caja); si no es un código, el ranking literal sobre
 * `candidatosDeLaCaja`. La caja muestra los 10 primeros; esto devuelve todos,
 * en el mismo orden.
 */
export async function buscarComoLaCaja(db, { localId, q }) {
  const exacto = await buscarProductoLocalPorCodigo(db, { localId, codigo: q, consulta: { select: { id: true, baseId: true } } });
  if (exacto) return [{ id: exacto.id, baseId: exacto.baseId }];
  return rankearComoLaCaja(await candidatosDeLaCaja(db, localId), q).map((r) => ({ id: r.item.id, baseId: r.item.baseId }));
}
