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
import { codigosDeProductoLocal } from "@/lib/productos/busquedaCodigoBarra";

/** Lo que se trae de cada candidato para poder compararlo. */
export const SELECT_CANDIDATO_DE_BUSQUEDA = Object.freeze({
  id: true,
  nombre: true,
  codigo_barra_propio: true,
  base: { select: { nombre: true, codigo_barra: true, codigo_barra_secundario: true } },
});

/** El nombre que se compara: el del producto del local, o el de la ficha. */
export const nombreDeBusqueda = (p) => p.nombre || p.base?.nombre || "";

/** Los códigos que cuentan como coincidencia exacta: propio, principal y secundario. */
export const codigosDeBusqueda = (p) => codigosDeProductoLocal(p);

/** La coincidencia literal de la caja, ordenada como la caja. */
export function rankearComoLaCaja(candidatos, q) {
  return rankearLiteral(candidatos, q, { getNombre: nombreDeBusqueda, getCodigo: codigosDeBusqueda });
}
