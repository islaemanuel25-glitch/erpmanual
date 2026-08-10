// lib/precios/precioDesdeMargen.js
//
// ÚNICA fórmula de precio a partir de costo + margen configurado del ERP.
//
// Existe para resolver un defecto concreto: el margen configurado por el usuario
// se deformaba porque el redondeo comercial a 100 generaba un margen EFECTIVO
// mayor, y ese efectivo se persistía encima del configurado. En la siguiente
// actualización de costo el precio salía del efectivo, no del configurado, y el
// margen subía un escalón en cada edición.
//
// La regla es: el margen configurado es un DATO DE ENTRADA que nunca se
// recalcula. El efectivo es una SALIDA informativa. Por eso este módulo devuelve
// `margenConfigurado` tal como lo recibió, sin normalizarlo ni redondearlo, al
// lado de `margenEfectivo`: quien consuma no puede confundirlos.
//
//   precioBase  = costo × (1 + margenConfigurado / 100)
//   precioFinal = redondeo100 ? Math.ceil(precioBase / 100) × 100 : precioBase
//   margenEfectivo = ((precioFinal / costo) − 1) × 100        ← solo informativo
//
// El redondeo es SIEMPRE hacia arriba. `Math.round` bajaría el precio por debajo
// de costo+margen, que es justamente lo que el margen configurado promete.
//
// Módulo puro: sin BD, sin side effects, sin imports de Next. Se importa tanto
// desde componentes cliente como desde rutas de API y desde tests en node.

import { redondear100 } from "./redondeo.js";

// Precisión: `precioBase` conserva la del cálculo completo. El redondeo a 2
// decimales es responsabilidad de quien PERSISTE (Decimal(12,2) en la base), no
// de la fórmula: redondear acá y volver a redondear al guardar arrastra error.

/**
 * ¿El producto tiene una regla automática de precio?
 *
 * El ERP no tiene un flag de "precio manual": la presencia de un margen > 0 es
 * el único indicador de que el precio se deriva del costo. Sin margen (null,
 * 0 o negativo) el precio es manual y NO debe recalcularse al mover el costo.
 *
 * Se exporta aparte de `precioDesdeMargen` a propósito: la fórmula sabe
 * calcular con cualquier margen finito (el formulario permite margen negativo,
 * venta < costo), pero los recálculos automáticos del servidor necesitan esta
 * compuerta para no pisar precios cargados a mano.
 */
export function hayReglaAutomatica(margenConfigurado) {
  const m = Number(margenConfigurado);
  return Number.isFinite(m) && m > 0;
}

/**
 * Margen efectivo de un precio ya redondeado. Solo informativo.
 * Devuelve null si no puede calcularse (costo 0 o inválido): sin costo el
 * margen no está definido, y forzar un 0 mentiría.
 */
export function margenEfectivoDe(costo, precioFinal) {
  const c = Number(costo);
  const p = Number(precioFinal);
  if (!Number.isFinite(c) || c <= 0) return null;
  if (!Number.isFinite(p)) return null;
  return (p / c - 1) * 100;
}

/**
 * Precio a partir del costo y el margen CONFIGURADO.
 *
 * @param {object}  args
 * @param {number}  args.costo
 * @param {number|null|undefined} args.margenConfigurado  se devuelve intacto
 * @param {boolean} args.redondeo100
 *
 * @returns {{
 *   aplica: boolean,              // false = no corresponde recalcular el precio
 *   margenConfigurado: number|null, // TAL CUAL entró (null si no había)
 *   precioBase: number|null,      // sin redondear
 *   precioFinal: number|null,     // redondeado si correspondía
 *   margenEfectivo: number|null,  // informativo; null si el costo es 0
 * }}
 *
 * `aplica: false` cuando el margen es null/undefined/no numérico o el costo no
 * es un número válido. En ese caso `precioFinal` es null y el llamador NO debe
 * tocar el precio de venta: no se inventa margen 0 (eso dejaría venta = costo y
 * borraría el precio cargado a mano).
 */
export function precioDesdeMargen({ costo, margenConfigurado, redondeo100 = false } = {}) {
  const mNum = Number(margenConfigurado);
  const margenValido =
    margenConfigurado !== null &&
    margenConfigurado !== undefined &&
    margenConfigurado !== "" &&
    Number.isFinite(mNum);

  // `Number(null)` es 0: sin este chequeo explícito un costo ausente se leería
  // como costo cero y devolvería un precio calculado de 0.
  const c = Number(costo);
  const costoValido =
    costo !== null && costo !== undefined && costo !== "" && Number.isFinite(c) && c >= 0;

  if (!margenValido || !costoValido) {
    return {
      aplica: false,
      margenConfigurado: margenValido ? mNum : null,
      precioBase: null,
      precioFinal: null,
      margenEfectivo: null,
    };
  }

  const precioBase = c * (1 + mNum / 100);
  const precioFinal = redondeo100 ? redondear100(precioBase) : precioBase;

  return {
    aplica: true,
    // Invariante del módulo: entra y sale idéntico. Nunca se sustituye por el
    // efectivo, que es lo que producía el trinquete.
    margenConfigurado: mNum,
    precioBase,
    precioFinal,
    margenEfectivo: margenEfectivoDe(c, precioFinal),
  };
}
