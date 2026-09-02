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

/**
 * ── LAS PRESENTACIONES ACTIVAS ─────────────────────────────────────────────
 *
 * Dos ranuras, una por grupo, porque dentro de cada grupo solo puede haber una
 * modalidad: tocar "Venta por unidad" con "Venta por pack" puesto reemplaza, no
 * suma. Guardarlas como una lista obligaría a buscar y sacar la del mismo grupo
 * en cada toque, que es la misma regla escrita de una forma en la que se puede
 * olvidar.
 *
 * Las dos juntas son una INTERSECCIÓN —"se compra por pack y se vende por
 * unidad"—, así que el total del listado puede ser menor que cualquiera de las
 * dos cards. Eso no rompe el criterio de la card: lo rompe prometer una
 * población y mostrar otra, y con dos cards encendidas la pantalla está
 * prometiendo el cruce.
 */
export function presentacionesNeutras() {
  return { venta: null, compra: null };
}

/** ¿Hay alguna presentación encendida? */
export function hayPresentacionesPuestas(pres) {
  return Boolean(pres?.venta || pres?.compra);
}

/**
 * ── EL INVARIANTE ──────────────────────────────────────────────────────────
 *
 * **Con un control de "Para revisar" o una presentación activa, los filtros
 * están en su valor por defecto, y los dos bloques no se encienden a la vez.**
 * Siempre, sin excepción y venga de donde venga el estado.
 *
 * ── POR QUÉ LOS DOS BLOQUES SE EXCLUYEN ────────────────────────────────────
 *
 * Por la misma razón por la que un control limpia los filtros, y no por
 * prolijidad. Las cards de los dos bloques cuentan sobre el catálogo ENTERO de
 * la ubicación: la de "Falta regla" dice cuántos productos activos no tienen
 * regla, y la de "Venta por pack" cuántos salen por pack. Encendidas juntas, el
 * listado muestra el cruce y las dos cards siguen mostrando su número entero —
 * o sea, las dos prometen una población que la lista no tiene.
 *
 * Las presentaciones entre sí SÍ se combinan, y no es una excepción: cuando hay
 * una de venta y una de compra encendidas, las dos cards están prometiendo el
 * cruce juntas, que es lo que la pantalla muestra.
 *
 * De acá sale el criterio aprobado del issue #2 —`cantidad de la card = total
 * del listado`— y no de un manejador en particular. Es la diferencia entre una
 * regla y una costumbre: la primera versión limpiaba los filtros al TOCAR la
 * card, y eso cubría solo un camino. Quedaban abiertos otros dos, y los dos
 * rompían el criterio sin que nada avisara:
 *
 *   · escribir en el buscador DESPUÉS de activar el control, o abrir la hoja de
 *     filtros y elegir un proveedor. La card seguía contando el catálogo entero
 *     y el listado pasaba a ser un subconjunto;
 *
 *   · entrar por una URL con los dos —`?control=sin-regla&q=aceite`—, que ni
 *     siquiera pasa por el manejador. Basta con recargar la página, o con
 *     compartir el enlace.
 *
 * Con el invariante escrito como función, los tres caminos se resuelven en el
 * mismo lugar y un cuarto que aparezca mañana tiene dónde preguntar.
 */
export function cumpleElInvariante({ control, filtros, presentaciones = null }) {
  const hayPres = hayPresentacionesPuestas(presentaciones);
  // Los dos bloques no pueden estar encendidos a la vez.
  if (control && hayPres) return false;
  // Y con cualquiera de los dos puesto, los filtros están en su default.
  if ((control || hayPres) && hayFiltrosPuestos(filtros)) return false;
  return true;
}

/**
 * Normaliza un estado que llega de afuera —la URL— para que cumpla el invariante.
 *
 * ── POR QUÉ GANA EL CONTROL Y SE VAN LOS FILTROS ───────────────────────────
 *
 * Es la decisión que hay que tomar acá, y tiene una sola respuesta defendible.
 *
 * Un enlace con `?control=sin-regla` se comparte para mostrar ESA población: es
 * lo que la card promete y lo que el que lo manda quiere que el otro vea.
 * Descartar el control y conservar la búsqueda dejaría el parámetro sin efecto,
 * o sea un enlace que no hace lo que dice.
 *
 * Y es lo mismo que hace tocar la card, así que la pantalla se comporta igual
 * llegando por los dos caminos. Una URL que se comporta distinto que el botón
 * equivalente es de las cosas que después nadie puede explicar.
 */
/**
 * ── Y CON LOS DOS BLOQUES EN LA URL, GANA EL CONTROL ───────────────────────
 *
 * `?control=sin-regla&presVenta=venta-pack` promete dos poblaciones distintas y
 * hay que elegir una. Gana el control por la misma razón por la que ya gana
 * sobre los filtros: es la regla que la pantalla viene sosteniendo, y tener dos
 * criterios de desempate según qué parámetros vengan sería la clase de
 * comportamiento que después nadie puede explicar.
 *
 * No es una preferencia estética: cualquiera de las dos respuestas es defendible
 * por separado, y lo que no se puede es no tener una escrita.
 */
export function normalizarEstadoDeUrl({ control, filtros, presentaciones = null }) {
  const pres = presentaciones ?? presentacionesNeutras();

  if (control) {
    return {
      control,
      // El control gana: las presentaciones se apagan.
      presentaciones: hayPresentacionesPuestas(pres) ? presentacionesNeutras() : pres,
      filtros: hayFiltrosPuestos(filtros) ? filtrosNeutros() : filtros,
    };
  }

  if (hayPresentacionesPuestas(pres)) {
    return {
      control: null,
      presentaciones: pres,
      filtros: hayFiltrosPuestos(filtros) ? filtrosNeutros() : filtros,
    };
  }

  return { control: null, presentaciones: pres, filtros };
}
