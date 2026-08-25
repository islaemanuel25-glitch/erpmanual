// lib/stock/limites.js
//
// QUÉ LLEGÓ EN EL CUERPO: ¿UN VALOR, UN BORRADO, O NADA?
//
// ── POR QUÉ ESTO NO PUEDE SER UN `Number(x)` SUELTO ───────────────────────
//
// Desde que un límite en 0 es un valor configurado válido, el endpoint tiene que
// distinguir TRES cosas que antes se aplastaban en una:
//
//   · no vino el campo      → no lo toques (es un guardado parcial);
//   · vino vacío o null     → borralo (el encargado sacó el límite);
//   · vino un número        → guardalo, incluido el 0.
//
// El código anterior hacía `body.nuevoMin !== undefined ? Number(body.nuevoMin)
// : null`, y ahí `Number(null)` da **0**: mandar un null explícito escribía un
// cero. O sea que "sacá el mínimo" y "poné el mínimo en cero" terminaban en la
// misma fila, que es exactamente la confusión que esta tanda vino a cerrar.
//
// Y `Number("")` también da 0, así que un input vaciado en la pantalla escribía
// un cero sin que nadie lo pidiera.
//
// Vive acá y no adentro de la ruta porque es una decisión de tres ramas que se
// puede ejercer con un candado, y adentro de un `route.js` haría falta montar un
// request para probarla.

/** Lo que se hace con el campo, decidido una sola vez. */
export const ACCION_LIMITE = {
  SIN_CAMBIO: "sin-cambio",
  BORRAR: "borrar",
  FIJAR: "fijar",
};

/**
 * @param {unknown} crudo  el valor tal como vino en el cuerpo
 * @returns {{accion: string, valor: number|null}}
 */
export function interpretarLimite(crudo) {
  if (crudo === undefined) return { accion: ACCION_LIMITE.SIN_CAMBIO, valor: null };

  // null y cadena vacía significan lo mismo: sacar el límite. El input de la
  // pantalla manda "" cuando se lo vacía.
  if (crudo === null || (typeof crudo === "string" && crudo.trim() === "")) {
    return { accion: ACCION_LIMITE.BORRAR, valor: null };
  }

  const n = Number(crudo);
  // Basura no se convierte en cero. Un "abc" que terminara en 0 escribiría un
  // límite que nadie pidió, y encima uno que la card lee como configurado.
  if (!Number.isFinite(n)) return { accion: ACCION_LIMITE.SIN_CAMBIO, valor: null };

  return { accion: ACCION_LIMITE.FIJAR, valor: n };
}

/**
 * El valor que hay que escribir, dado lo que llegó y lo que ya estaba.
 *
 * @param {{accion: string, valor: number|null}} interpretado
 * @param {number|null} actual  lo que la fila tiene hoy
 */
export function valorAGuardar(interpretado, actual) {
  if (interpretado.accion === ACCION_LIMITE.SIN_CAMBIO) return actual ?? null;
  if (interpretado.accion === ACCION_LIMITE.BORRAR) return null;
  return interpretado.valor;
}

/**
 * ¿Este guardado cuenta como "los límites se configuraron"?
 *
 * ── SÍ, INCLUSO SI LO QUE SE GUARDA ES UN CERO O UN BORRADO ───────────────
 *
 * Alguien abrió Límites y decidió. La marca registra ESE hecho —que hubo una
 * decisión— y no el valor resultante; si registrara el valor volveríamos a no
 * poder distinguir un cero puesto a propósito de una fila recién creada.
 *
 * Lo único que no cuenta es un guardado que no pidió cambiar nada, que es lo que
 * pasa cuando el cuerpo no trae ninguno de los dos campos.
 */
export function esConfiguracion(minInterpretado, maxInterpretado) {
  return (
    minInterpretado.accion !== ACCION_LIMITE.SIN_CAMBIO ||
    maxInterpretado.accion !== ACCION_LIMITE.SIN_CAMBIO
  );
}
