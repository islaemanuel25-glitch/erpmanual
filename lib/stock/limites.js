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

import { cantidadDeStockDeUnaCarga, esCargaEnSueltos, fromUnidades, toUnidades } from "../conversiones/stock.js";

/**
 * EL LÍMITE GUARDADO, EN LA ESCALA EN QUE SE ESCRIBE EN EL MODAL.
 *
 * Tercer nivel de empaque, tanda 8. Los límites se comparan contra
 * `StockLocal.cantidad`, que con sueltos cuenta sueltos. El modal no agrega
 * campos: en el depósito pack se siguen escribiendo bultos, y con sueltos fuera
 * de él se escriben unidades (atados). La conversión es la del embudo.
 *
 * Sin `sueltosPorUnidad` devuelve exactamente lo de antes: bultos con
 * `fromUnidades` sin sueltos, o el valor tal cual.
 *
 * @param {number|null|undefined} valor  el límite en unidades de stock.
 * @param {{ usarBultos: boolean, factorPack: number, sueltosPorUnidad: number|null }} escala
 * @returns {number|null}
 */
export function limiteEnLaEscalaDeCarga(valor, { usarBultos, factorPack, sueltosPorUnidad = null }) {
  if (valor === null || valor === undefined) return null;
  if (usarBultos) return fromUnidades({ unidades: Number(valor), factorPack, sueltosPorUnidad }).bultos;
  if (sueltosPorUnidad) return fromUnidades({ unidades: Number(valor), factorPack: 1, sueltosPorUnidad }).sueltas;
  return valor;
}

/**
 * Lo que el modal manda para un límite escrito: el camino inverso del anterior.
 * Con sueltos y sin bultos va como carga en unidades (`{ unidades }`), que la
 * ruta lleva a sueltos con `interpretarLimiteDeUnaCarga`. Null queda null.
 */
export function limiteParaEnviar(valor, { usarBultos, factorPack, sueltosPorUnidad = null }) {
  if (valor === null || valor === undefined) return valor;
  if (usarBultos) return toUnidades({ cantidad: valor, unidad: "BULTO", factorPack, sueltosPorUnidad });
  if (sueltosPorUnidad) return { unidades: valor };
  return valor;
}

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
 * UN LÍMITE QUE PUEDE LLEGAR EN UNIDADES + SUELTOS (tercer nivel de empaque).
 *
 * `{ unidades, sueltos }` se lleva a sueltos por el embudo
 * (`cantidadDeStockDeUnaCarga`) y recién después se interpreta como cualquier
 * número. Cualquier otra cosa —número, texto, null, ausente— es exactamente lo
 * de `interpretarLimite`. Un producto sin sueltos no acepta la forma nueva.
 *
 * @returns {{accion: string, valor: number|null} | {error: string}}
 */
export function interpretarLimiteDeUnaCarga(crudo, base) {
  if (!esCargaEnSueltos(crudo)) return interpretarLimite(crudo);
  const r = cantidadDeStockDeUnaCarga({ unidades: crudo.unidades, sueltos: crudo.sueltos, base });
  return r.ok ? interpretarLimite(r.cantidad) : { error: r.error };
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
