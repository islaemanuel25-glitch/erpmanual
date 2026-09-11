// lib/productos/busquedaDelCatalogo.js
//
// QUIÉN ES DUEÑO DEL TEXTO QUE LA PERSONA ESTÁ ESCRIBIENDO.
//
// ── EL DEFECTO QUE ESTE MÓDULO EXISTE PARA CERRAR ───────────────────────────
//
// En el buscador móvil de Productos, escribir "quilmes" rápido podía terminar
// mostrando "quiquilmes", perder letras o hacer que el texto volviera atrás.
//
// La causa no era el teclado. Era que `filtros.search` cumplía TRES funciones
// incompatibles a la vez: el estado confirmado del listado, el `value` del input
// controlado, y un estado sincronizado en los dos sentidos con `?q=`.
//
// El circuito era: tecla → `setFiltros` → `router.replace("?q=…")` → más tarde
// `searchParams` → efecto de vuelta → `setFiltros` → `value` del input. Con
// varias navegaciones en vuelo, una URL propia PERO VIEJA llegaba cuando el
// estado ya era más nuevo, el guardia la clasificaba como externa y la aplicaba:
// el input retrocedía debajo del teclado y la tecla siguiente se sumaba al valor
// viejo. De ahí "qui" + "quilmes".
//
// ── LAS DOS PIEZAS, Y POR QUÉ SON DOS ──────────────────────────────────────
//
// 1. `ORIGEN_DE_URL` / `laUrlHidrataElEstado`: la URL vuelve a mandar SOLO al
//    entrar y en una navegación real de historial. Un eco de nuestro propio
//    `router.replace` no hidrata nada, nunca. La clasificación dejó de depender
//    de comparar cadenas con lo último que escribimos —que es lo que se rompía
//    con varias en vuelo— y pasa a depender de QUÉ EVENTO ocurrió, que es un
//    hecho y no una inferencia.
//
// 2. `crearConfirmadorDiferido`: el draft del input cambia con cada tecla, y la
//    búsqueda se confirma una sola vez cuando la persona deja de escribir.
//
// ── POR QUÉ ACÁ Y NO ADENTRO DEL COMPONENTE ────────────────────────────────
//
// Porque el arnés de pruebas de este repo no tiene DOM: no hay jsdom ni
// testing-library, y `react-dom/server` no despacha eventos ni corre
// temporizadores. Una decisión que vive adentro de un `useEffect` no se puede
// ejercer; una función pura sí, con `mock.timers`. Y es la MISMA función que usa
// la pantalla, no una réplica escrita al lado para el candado.

/**
 * LA VENTANA DEL BUSCADOR DEL CATÁLOGO, EN UN SOLO LUGAR.
 *
 * Sale de `FiltrosProductos`, que ya la tenía andando con este valor desde antes
 * de esta corrección. No se eligió un número nuevo: el buscador del celular y el
 * del escritorio son el mismo gesto y no pueden esperar tiempos distintos.
 */
export const MS_DEBOUNCE_BUSQUEDA = 250;

/**
 * De dónde vino un cambio de la URL.
 *
 * `ECO_PROPIO` es el `router.push`/`router.replace` que dispara esta pantalla al
 * sincronizar su estado. No es una navegación: es el reflejo de algo que ya pasó
 * en React, y el estado ya lo tiene.
 */
export const ORIGEN_DE_URL = Object.freeze({
  INICIAL: "INICIAL",
  HISTORIAL: "HISTORIAL",
  ECO_PROPIO: "ECO_PROPIO",
});

/**
 * ¿Esta URL tiene derecho a reescribir el estado de la pantalla?
 *
 * Solo la entrada y el historial real. Es la regla entera del arreglo, y está
 * escrita como función para que se pueda ver en rojo: si alguien vuelve a hacer
 * que un eco propio hidrate, el candado lo dice por su nombre.
 *
 * La distinción es barata de obtener y no es una heurística: `popstate` lo
 * dispara el navegador SOLO cuando se recorre el historial —Atrás, Adelante,
 * `history.back()`—. Un `pushState`/`replaceState` programático no lo dispara
 * nunca, así que el eco propio no puede disfrazarse de navegación.
 */
export function laUrlHidrataElEstado(origen) {
  return origen === ORIGEN_DE_URL.INICIAL || origen === ORIGEN_DE_URL.HISTORIAL;
}

/**
 * UNA CONFIRMACIÓN POR ESCRITURA, NO UNA POR TECLA.
 *
 * `programar` reemplaza la confirmación pendiente: siete teclas seguidas dejan
 * una sola. `inmediato` es para lo que YA es una frase completa —dictado, un
 * código escaneado, Enter— donde esperar no aporta nada.
 *
 * Los temporizadores se inyectan para poder correr el reloj en un candado. El
 * default es el del entorno, así que la pantalla no se entera.
 *
 * @param {(valor:any)=>void} confirmar  qué hacer con el texto confirmado
 * @param {object} [opciones]
 * @param {number} [opciones.ms]         la ventana; por defecto la del catálogo
 */
export function crearConfirmadorDiferido(
  confirmar,
  { ms = MS_DEBOUNCE_BUSQUEDA, programarEn = setTimeout, cancelarEn = clearTimeout } = {}
) {
  let pendiente = null;

  const cancelar = () => {
    if (pendiente !== null) cancelarEn(pendiente);
    pendiente = null;
  };

  return {
    /** Una tecla más: se pospone la confirmación. */
    programar(valor) {
      cancelar();
      pendiente = programarEn(() => {
        pendiente = null;
        confirmar(valor);
      }, ms);
    },
    /** Ya es una frase: se confirma ahora y se descarta lo que estuviera en cola. */
    inmediato(valor) {
      cancelar();
      confirmar(valor);
    },
    cancelar,
    /** Para los candados: si hay algo esperando. No lo usa la pantalla. */
    hayPendiente() {
      return pendiente !== null;
    },
  };
}
