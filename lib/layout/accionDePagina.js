// ============================================================
// lib/layout/accionDePagina.js
//
// LAS DOS DECISIONES DEL SLOT DE ACCIÓN DE PÁGINA, COMO FUNCIONES PURAS.
//
// El shell dibuja el título de la página —`LayoutBase` en mobile, el `<h1>` del
// `Header` en escritorio— y hasta ahora una pantalla no tenía forma de poner
// nada al lado de ese título: su contenido vive dentro de `<main>`, que es una
// caja hermana y aparte. La única salida era duplicar el título, esconder el
// global o empujar con márgenes negativos.
//
// El slot resuelve eso: la pantalla REGISTRA un nodo y el shell lo dibuja en su
// fila. Acá viven las dos decisiones del registro, separadas de React para que
// se puedan ejercer sin navegador.
//
// ── POR QUÉ `limpiar` COMPARA Y NO BORRA A CIEGAS ──────────────────────────
//
// Es lo único que no es obvio de todo el mecanismo. Al navegar de una pantalla
// con acción a otra con acción, React puede correr la limpieza de la primera
// DESPUÉS de que la segunda ya registró la suya. Un `setAccion(null)` a ciegas
// borraría la acción de la pantalla nueva y el botón desaparecería sin que nada
// avise. Comparando, la limpieza tardía no hace nada.
// ============================================================

/**
 * Qué acción queda registrada cuando una pantalla registra `nodo`.
 *
 * La última que registra gana: en cualquier momento hay una sola pantalla
 * montada. `null` o `undefined` significan "esta pantalla no aporta acción" y
 * dejan el slot vacío.
 *
 * @param {unknown} actual Lo que había registrado.
 * @param {unknown} nodo   Lo que registra la pantalla.
 * @returns {unknown} La acción que queda.
 */
export function registrarAccion(actual, nodo) {
  return nodo ?? null;
}

/**
 * Qué queda cuando la pantalla que registró `nodo` se desmonta.
 *
 * Solo vacía el slot si lo que hay adentro sigue siendo SU nodo. Si otra
 * pantalla ya registró el suyo, la limpieza llegó tarde y no toca nada.
 *
 * @param {unknown} actual Lo que hay registrado ahora.
 * @param {unknown} nodo   Lo que había registrado la pantalla que se va.
 * @returns {unknown} La acción que queda.
 */
export function limpiarAccion(actual, nodo) {
  return actual === nodo ? null : actual;
}
