// lib/stock/busquedaStock.js
//
// LA BÚSQUEDA DE TEXTO DEL LISTADO DE STOCK: nombre, código de barras y
// secundario, sobre la ficha (`ProductoBase`).
//
// Vivía adentro de `app/api/stock_locales/listar/route.js` y se sacó tal cual
// cuando el Control de stock necesitó filtrar su lista igual que Stock: una copia
// al lado habría sido la misma búsqueda escrita dos veces, lista para separarse.
//
// El código PROPIO del local no está acá: vive en `ProductoLocal` y lo resuelve
// `buscarProductoLocalPorCodigo`, el buscador de la caja, ANTES de esto.

/** El `where` de `ProductoBase` para un texto, o `{}` sin texto. */
export function buildTextOR(q) {
  return q
    ? {
        OR: [
          { nombre: { contains: q, mode: "insensitive" } },
          { codigo_barra: { contains: q, mode: "insensitive" } },
          { codigo_barra_secundario: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
}
