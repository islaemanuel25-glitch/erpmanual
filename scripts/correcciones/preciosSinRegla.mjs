// QUÉ HACER CON UNA FILA SIN MARGEN —O CON MARGEN ≤ 0— QUE QUEDÓ CON PRECIO VIEJO.
//
// Corrección pedida por Emanuel el 2026-10-30, segunda del día. Diagnóstico
// suyo: una fila sin margen nunca se recalcula cuando sube el costo, así que la
// venta se queda en un precio viejo. Las 252 filas que la medición llamó "de
// escala" son esto mismo —el costo del bulto está bien y la venta es vieja—, no
// un error de carga. Módulo puro: decide UNA fila.
//
// ── LA REGLA ─────────────────────────────────────────────────────────────
//
// Sobre el costo del bulto tal como está, margen efectivo = venta ÷ costo − 1.
//
//   · Menor a 30 % → margen 30 y la venta sale de `precioDesdeMargen` con el
//     redondeo de la ficha.
//   · 30 % o más → el precio NO cambia, y el margen queda ANCLADO al entero de
//     abajo del efectivo; si con ese margen el sistema daría menos que el precio
//     actual, el de arriba. Así el próximo recálculo nunca lo baja.
//   · Sin costo → no se toca.
//   · NUNCA baja un precio.
//
// Lo decidido aparte por Emanuel —precios fijos, filas que van a 30 aunque
// salten mucho, filas que no se tocan— entra por los parámetros, no por nombres
// escritos acá.

import { precioDesdeMargen } from "../../lib/precios/precioDesdeMargen.js";

export const MARGEN_OBJETIVO = 30;
/** Una venta nueva de más de esto veces la actual se lista: el costo debe estar mal. */
export const TOPE_VECES = 30;
export const PATRON_PROMO = /PROMO|OFERTA|MAS PANES/i;

export const ACCION = Object.freeze({ APLICAR: "APLICAR", LISTA: "LISTA", NADA: "NADA" });
export const TIPO = Object.freeze({ SUBE_A_30: "SUBE_A_30", ANCLADO: "ANCLADO", SUBE_A_SU_MARGEN: "SUBE_A_SU_MARGEN" });
export const MOTIVO = Object.freeze({
  PROMO: "promo",
  EXCLUIDO: "excluido por pedido",
  TREINTA_VECES: "más de 30 veces la venta actual",
  SIN_COSTO: "sin costo",
});

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const precioCon = (costo, margen, redondeo100) =>
  Math.round(precioDesdeMargen({ costo, margenConfigurado: margen, redondeo100 }).precioFinal * 100) / 100;

/**
 * El margen entero que conserva `venta`: el de abajo del efectivo, o el de
 * arriba si con el de abajo el sistema daría menos que `venta`.
 */
export function margenAnclado({ costo, venta, redondeo100 }) {
  // Al centésimo antes de truncar: 1.45 × 100 da 144,99999… en binario.
  const efectivo = Math.round((venta / costo - 1) * 100 * 1e6) / 1e6;
  const abajo = Math.floor(efectivo);
  return precioCon(costo, abajo, redondeo100) >= venta - 0.005 ? abajo : abajo + 1;
}

/**
 * @param {object} f
 * @param {string}  f.nombre
 * @param {number}  f.costo          costo del bulto que ve la ubicación
 * @param {number}  f.venta          venta del bulto que ve la ubicación
 * @param {boolean} f.redondeo100    el de la ficha
 * @param {boolean} f.enOfertaVigente
 * @param {boolean} [f.excluida]     decidido por Emanuel: no se toca
 * @param {number}  [f.precioFijo]   decidido por Emanuel: este precio
 * @param {boolean} [f.aTreintaSinTope] decidido por Emanuel: a 30 aunque salte
 * @param {number}  [f.margenPropio] una fila de escala que SÍ tiene margen: sube
 *                                   a lo que da el suyo y no se le toca
 * @param {number}  [f.topeSobre]    contra qué se miden las 30 veces; en una fila
 *                                   de escala, la venta por unidad × el factor
 * @returns {{ accion, tipo?, motivo?, precioNuevo, margenNuevo? }}
 */
export function decidirSinRegla(f = {}) {
  const costo = num(f.costo);
  const venta = num(f.venta) ?? 0;
  const red = f.redondeo100 === true;
  if (costo === null || costo <= 0) return { accion: ACCION.NADA, motivo: MOTIVO.SIN_COSTO, precioNuevo: null };

  // Las 30 veces se miden contra la venta, salvo que el llamador diga contra qué.
  const referencia = num(f.topeSobre) ?? venta;
  const margenPropio = num(f.margenPropio);
  const objetivo = margenPropio !== null && margenPropio > 0 ? margenPropio : MARGEN_OBJETIVO;
  const aTreinta = precioCon(costo, objetivo, red);
  if (f.excluida === true) return { accion: ACCION.LISTA, motivo: MOTIVO.EXCLUIDO, precioNuevo: aTreinta };
  if (f.enOfertaVigente === true || PATRON_PROMO.test(String(f.nombre ?? ""))) {
    return { accion: ACCION.LISTA, motivo: MOTIVO.PROMO, precioNuevo: aTreinta };
  }

  // Un precio decidido a mano: sube a ése, y el margen se ancla sobre él.
  const fijo = num(f.precioFijo);
  if (fijo !== null) {
    const precio = fijo > venta ? fijo : venta;
    return {
      accion: ACCION.APLICAR,
      tipo: precio > venta ? TIPO.SUBE_A_30 : TIPO.ANCLADO,
      precioNuevo: precio > venta ? precio : null,
      margenNuevo: margenAnclado({ costo, venta: precio, redondeo100: red }),
    };
  }

  // Una fila de escala que ya tiene su margen: sube a lo que da el suyo, sin
  // tocarlo. Si ya gana eso o más, no hay nada que hacer.
  if (margenPropio !== null && margenPropio > 0) {
    if (!(aTreinta > venta)) return { accion: ACCION.NADA, precioNuevo: null };
    if (referencia > 0 && aTreinta > referencia * TOPE_VECES) {
      return { accion: ACCION.LISTA, motivo: MOTIVO.TREINTA_VECES, precioNuevo: aTreinta };
    }
    return { accion: ACCION.APLICAR, tipo: TIPO.SUBE_A_SU_MARGEN, precioNuevo: aTreinta, margenNuevo: null };
  }

  const efectivo = (venta / costo - 1) * 100;
  if (efectivo < MARGEN_OBJETIVO) {
    if (!(aTreinta > venta)) {
      // No pasa con números de verdad —30 % sobre el costo supera a una venta que
      // gana menos—, pero si pasara, el precio no baja: se ancla.
      return { accion: ACCION.APLICAR, tipo: TIPO.ANCLADO, precioNuevo: null, margenNuevo: margenAnclado({ costo, venta, redondeo100: red }) };
    }
    if (f.aTreintaSinTope !== true && referencia > 0 && aTreinta > referencia * TOPE_VECES) {
      return { accion: ACCION.LISTA, motivo: MOTIVO.TREINTA_VECES, precioNuevo: aTreinta };
    }
    return { accion: ACCION.APLICAR, tipo: TIPO.SUBE_A_30, precioNuevo: aTreinta, margenNuevo: MARGEN_OBJETIVO };
  }

  return { accion: ACCION.APLICAR, tipo: TIPO.ANCLADO, precioNuevo: null, margenNuevo: margenAnclado({ costo, venta, redondeo100: red }) };
}
