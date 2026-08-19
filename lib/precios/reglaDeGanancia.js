// QUÉ REGLA DE GANANCIA TIENE UNA FILA, Y CÓMO SE ESCRIBE EN LA TARJETA.
//
// ── LAS TRES RESPUESTAS, Y POR QUÉ SON TRES Y NO DOS ──────────────────────
//
// La pregunta que contesta la tarjeta es "¿esta fila tiene porcentaje asignado?".
// La respuesta obvia sería sí o no, y sería falsa: hay filas que NO tienen
// porcentaje y tampoco les falta nada, porque su precio sale de una regla
// distinta —`RECARGO_FIJO_UNIDAD`, pesos fijos sobre el costo unitario—. Meterlas
// en "falta" sería mandar a corregir 231 filas que están bien.
//
// Por eso son tres: tiene porcentaje, tiene recargo, o no tiene nada.
//
// ── EL CERO NO ES UNA AUSENCIA ────────────────────────────────────────────
//
// Un margen de 0 es un valor cargado —"vendé esto al costo"— y se muestra como
// "0 %". El criterio no es mío: es el mismo que ya está escrito en
// `lib/mappers/producto.js`, que por eso lee el margen con `pick` y no con el
// criterio de precios. Lo que falta es `null`, y nada más.
//
// Cuidado con confundir esto con `hayReglaAutomatica`, que exige margen > 0: esa
// pregunta es "¿hay que recalcular el precio al mover el costo?", y para eso un
// 0 efectivamente no alcanza. Acá la pregunta es "¿alguien decidió un
// porcentaje?", y un 0 sí es una decisión. Son dos preguntas distintas sobre el
// mismo dato, y por eso no comparten función.
//
// ── DE DÓNDE SALE EL NÚMERO ───────────────────────────────────────────────
//
// Del margen CONFIGURADO, no del efectivo. `margenEfectivoDe` contesta otra cosa
// —cuánto está ganando de hecho— y se puede calcular para casi cualquier fila con
// costo, así que usarlo acá borraría justamente la distinción que la tarjeta
// existe para mostrar: todas tendrían un porcentaje y ninguna se vería "sin
// asignar". Queda anotado porque es una decisión, no un olvido.

import { REGLA_RECARGO, hayRecargoConfigurado } from "./recargoFijoUnidad.js";

export const GANANCIA_PORCENTAJE = "PORCENTAJE";
export const GANANCIA_RECARGO = "RECARGO";
export const GANANCIA_FALTA = "FALTA";

/**
 * Qué regla de ganancia tiene la fila.
 *
 * @param {object} p
 * @param {number|string|null} p.margen             margen configurado (ya mergeado base+local).
 * @param {string|null} p.reglaPrecio               "MARGEN_PORCENTUAL" | "RECARGO_FIJO_UNIDAD".
 * @param {number|string|null} p.recargoFijoUnidad  pesos por unidad, si la regla es recargo.
 * @returns {{tipo: string, porcentaje?: number, recargo?: number}}
 */
export function reglaDeGananciaDe({ margen, reglaPrecio, recargoFijoUnidad } = {}) {
  // El recargo se mira PRIMERO. Una fila en modo recargo puede tener además un
  // margen viejo guardado de cuando estaba en modo porcentaje —el schema no lo
  // borra al cambiar de regla, a propósito, para poder volver—. Mirar el margen
  // primero mostraría un porcentaje que no se está aplicando.
  if (reglaPrecio === REGLA_RECARGO && hayRecargoConfigurado(recargoFijoUnidad)) {
    return { tipo: GANANCIA_RECARGO, recargo: Number(recargoFijoUnidad) };
  }

  const m = Number(margen);
  const hayMargen =
    margen !== null && margen !== undefined && margen !== "" && Number.isFinite(m);

  return hayMargen
    ? { tipo: GANANCIA_PORCENTAJE, porcentaje: m }
    : { tipo: GANANCIA_FALTA };
}

/**
 * Cómo se escribe en la tarjeta.
 *
 * El porcentaje va REDONDEADO a entero: el propósito es comparar de un golpe de
 * ojo, y "30,43 %" no se compara mejor que "30 %" — ocupa más y se lee peor. El
 * valor exacto sigue estando en Editar, sin tocar.
 *
 * La única excepción es el redondeo que MENTIRÍA: un margen chico pero real que
 * redondeado da 0 se leería como "vendé al costo", que es una decisión distinta y
 * ya tiene su propio aviso. Ése se escribe "<1 %".
 */
export function textoDeGanancia(regla) {
  if (!regla) return null;

  if (regla.tipo === GANANCIA_FALTA) return "falta %";

  if (regla.tipo === GANANCIA_RECARGO) {
    // Los pesos van sin decimales por lo mismo que el porcentaje: es un vistazo.
    return `+$${Math.round(regla.recargo).toLocaleString("es-AR")}/un`;
  }

  const p = regla.porcentaje;
  const redondeado = Math.round(p);
  if (redondeado === 0 && p !== 0) return p > 0 ? "<1 %" : ">-1 %";
  return `${redondeado.toLocaleString("es-AR")} %`;
}
