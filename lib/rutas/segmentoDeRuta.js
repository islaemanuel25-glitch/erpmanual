// ============================================================
// lib/rutas/segmentoDeRuta.js
//
// DESHACER EL TRANSPORTE DE UN SEGMENTO DE URL. NADA MÁS.
//
// ── EL DEFECTO QUE LE DIO ORIGEN, MEDIDO ───────────────────────────────────
//
// Los cuatro medios de cobro por defecto quedaron inabribles en producción. La
// lista arma el enlace con `encodeURIComponent`, así que la clave
// `defecto:EFECTIVO` viaja como `defecto%3AEFECTIVO`; y `use(params)` en un
// componente de cliente entrega el segmento **tal cual viaja**, sin decodificar.
// La comparación quedaba `"defecto:EFECTIVO" !== "defecto%3AEFECTIVO"` y los
// cuatro aparecían como inexistentes.
//
// Medido en el runner, con la aplicación levantada: la respuesta de la pantalla
// contiene el segmento codificado, y una ruta de API con la MISMA clave
// codificada contesta 200 —o sea que del lado del servidor el ruteo sí lo
// decodifica—. Son dos caminos distintos y solo uno necesitaba esto.
//
// ── LO QUE ESTA FUNCIÓN NO HACE, Y ES LO IMPORTANTE ────────────────────────
//
// No interpreta lo que devuelve. No sabe qué es una clave de edición, no conoce
// el prefijo de los defaults, no distingue un id de un tipo contable. Deshace el
// transporte y devuelve el texto; quién lo entienda es problema de otro.
//
// Esa línea es la que mantiene la clave OPACA para la pantalla: decodificar una
// URL no es interpretar lo que viene adentro.
//
// ── POR QUÉ EL `try` NO ES DECORACIÓN ──────────────────────────────────────
//
// `decodeURIComponent` LANZA con un porcentaje suelto o una secuencia trunca
// —`"%"`, `"%E0%A4%A"`—, y eso llega desde la URL, o sea desde afuera. Sin el
// `catch`, una dirección escrita a mano rompería la pantalla con un error de
// JavaScript en vez de mostrar "ese medio ya no está". Se devuelve el texto
// original: no va a resolver nada, que es exactamente lo correcto.
//
// ── Y DECODIFICA UNA SOLA VEZ ──────────────────────────────────────────────
//
// `defecto%253AEFECTIVO` se convierte en `defecto%3AEFECTIVO` y ahí se termina.
// Insistir hasta que no queden porcentajes convertiría un texto escapado dos
// veces en una clave válida, y eso es aceptar como buena una dirección que nadie
// del sistema produce.
// ============================================================

/**
 * El texto que viajó en un segmento de ruta, sin la codificación del transporte.
 *
 * @param {unknown} segmento Lo que entrega el ruteo.
 * @returns {string} El texto decodificado; el original si no se puede decodificar.
 */
export function decodificarSegmentoDeRuta(segmento) {
  if (typeof segmento !== "string") return "";

  try {
    return decodeURIComponent(segmento);
  } catch {
    return segmento;
  }
}
