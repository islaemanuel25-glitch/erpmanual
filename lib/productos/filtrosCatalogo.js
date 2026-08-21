// lib/productos/filtrosCatalogo.js
//
// EL ESTADO DE FILTROS QUE NO REDUCE EL UNIVERSO.
//
// ── PARA QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// El criterio aprobado del issue #2 es literal: **el número de la card de "Para
// revisar" y el total del listado que esa card abre tienen que coincidir**.
//
// La card cuenta el catálogo activo de la ubicación. El listado, además del
// control, aplica lo que la persona haya elegido antes: una búsqueda escrita, un
// proveedor, un estado. Con cualquiera de esas puesto, los dos números no pueden
// coincidir — y mostrarlos los dos al lado no arregla nada: la card sigue
// prometiendo una población que el listado no muestra.
//
// La salida es limpiar esos filtros al activar un control. Y para poder limpiar
// hace falta saber a QUÉ se limpia, que es esto.
//
// ── POR QUÉ `estado` Y `tipo` NO VAN VACÍOS ────────────────────────────────
//
// Son los dos que más fácil se olvidan, porque su valor por defecto no es la
// cadena vacía. El contador cuenta ACTIVOS —de las dos clases, productos y
// combos—, así que con "inactivos" elegido el total no cerraría aunque todo lo
// demás estuviera limpio. Vaciarlos no alcanza: hay que ponerlos en su default.
//
// ── VIVE ACÁ Y NO EN LA PANTALLA ───────────────────────────────────────────
//
// Para que un candado pueda comparar esta forma contra la que la pantalla manda
// al servidor. Escrito adentro del componente, la única forma de comprobarlo
// sería abrir el navegador — que también se hace, pero cuesta minutos en vez de
// milisegundos y no corre en la suite.

/**
 * Los filtros del catálogo en su valor por defecto: el universo entero de la
 * ubicación, que es lo que la card cuenta.
 *
 * Se devuelve una copia nueva en cada llamada a propósito: es estado de React y
 * compartir el objeto haría que dos renders miren la misma referencia mutable.
 */
export function filtrosNeutros() {
  return {
    search: "",
    categoria: "",
    proveedor: "",
    area: "",
    estado: "activos",
    tipo: "todos",
  };
}

/** Las claves que se comparan. Una clave nueva que no esté acá no se mira. */
export const CLAVES_DE_FILTRO = Object.keys(filtrosNeutros());

/**
 * ¿Estos dos conjuntos de filtros son el mismo?
 *
 * Compara clave por clave y no con `JSON.stringify`: el orden de las claves de un
 * objeto de React no está garantizado, y dos objetos iguales con las claves en
 * distinto orden darían distinto. Ya pasó en este repo con otra comparación
 * hecha así.
 */
export function mismosFiltros(a, b) {
  if (!a || !b) return false;
  return CLAVES_DE_FILTRO.every((k) => (a[k] ?? "") === (b[k] ?? ""));
}

/** ¿Hay algo puesto que reduzca el universo? */
export function hayFiltrosPuestos(filtros) {
  return !mismosFiltros(filtros, filtrosNeutros());
}
