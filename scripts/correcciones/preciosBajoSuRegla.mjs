// QUÉ HACER CON UNA FILA QUE VENDE POR DEBAJO DE SU REGLA O A PÉRDIDA.
//
// Corrección pedida por Emanuel el 2026-10-30, sobre la medición del mismo día
// (`/home/emanuel/mediciones/precios-por-ubicacion-20261030.csv`). Módulo puro:
// no lee la base ni escribe nada. Decide UNA fila; el generador
// (`generarCorreccionPrecios20261030.mjs`) lo recorre y arma la migración.
//
// ── EL PRECIO SALE DE LAS FUNCIONES DEL REPO, NO DE UNA FÓRMULA NUEVA ──────
//
// Margen: `precioDesdeMargen`. Monto fijo por unidad: `precioDesdeRecargoUnidad`.
// Las dos con el redondeo a 100 que ya tiene la ficha. Una tercera cuenta acá
// sería la segunda fórmula de precio que un día dice distinto.
//
// ── LAS REGLAS DE LA TANDA ────────────────────────────────────────────────
//
//   · Margen > 0 → con ese margen (el del local, o el de la ficha si el local no
//     tiene). Monto fijo → costo + su monto. Margen ≤ 0 o sin regla → 30 %, y se
//     guarda margen 30.
//   · NUNCA se baja un precio: si el nuevo no es mayor que el actual, no se toca.
//   · NO se aplican, y van a la lista: un precio nuevo de más del DOBLE del
//     actual (fiambres cargados por 100 g), un producto de promo —nombre con
//     PROMO, OFERTA o MAS PANES, o en una oferta vigente—, y una fila con margen
//     positivo que igual vende a pérdida: ahí el problema no es la regla.

import { precioDesdeMargen } from "../../lib/precios/precioDesdeMargen.js";
import { precioDesdeRecargoUnidad, REGLA_RECARGO, hayRecargoConfigurado } from "../../lib/precios/recargoFijoUnidad.js";

/** El margen que reciben las filas sin regla o con margen cero o negativo. */
export const MARGEN_POR_DEFECTO = 30;

/** Más que esto veces el precio actual no se aplica: es una escala mal cargada. */
export const TOPE_VECES = 2;

/** Nombres que son de promo y no se corrigen por regla. */
export const PATRON_PROMO = /PROMO|OFERTA|MAS PANES/i;

export const ACCION = Object.freeze({ APLICAR: "APLICAR", LISTA: "LISTA", NADA: "NADA" });
export const MOTIVO = Object.freeze({
  DOBLE: "doble",
  PROMO: "promo",
  MARGEN_POSITIVO_A_PERDIDA: "margen positivo a pérdida",
  NO_SUBE: "el nuevo no es mayor",
  SIN_COSTO: "sin costo",
});

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {object} f
 * @param {string}  f.nombre
 * @param {number}  f.costo           costo que ve la ubicación
 * @param {number}  f.venta           precio que ve la ubicación
 * @param {string}  f.reglaPrecio     "MARGEN_PORCENTUAL" | "RECARGO_FIJO_UNIDAD"
 * @param {number|null} f.margen      el margen que usa hoy (local, o el de la ficha)
 * @param {number|null} f.recargoFijoUnidad
 * @param {string}  f.unidadMedida
 * @param {number|null} f.factorPack
 * @param {boolean} f.redondeo100     el de la ficha
 * @param {boolean} f.enOfertaVigente
 * @returns {{ accion, motivo?, precioNuevo?, margenNuevo? }}
 */
export function decidirCorreccion(f = {}) {
  const costo = num(f.costo);
  const venta = num(f.venta) ?? 0;
  if (costo === null || costo <= 0) return { accion: ACCION.NADA, motivo: MOTIVO.SIN_COSTO };

  // La promo va primero: su precio lo decide la oferta, no la regla.
  if (f.enOfertaVigente === true || PATRON_PROMO.test(String(f.nombre ?? ""))) {
    return { accion: ACCION.LISTA, motivo: MOTIVO.PROMO, precioNuevo: null };
  }

  const margen = num(f.margen);
  const enRecargo = f.reglaPrecio === REGLA_RECARGO && hayRecargoConfigurado(f.recargoFijoUnidad);

  // Margen positivo y a pérdida: la regla ya pide ganar, así que lo que está mal
  // es otra cosa —el costo o el precio cargados—. Se lista, no se corrige.
  if (!enRecargo && margen !== null && margen > 0 && venta < costo) {
    return { accion: ACCION.LISTA, motivo: MOTIVO.MARGEN_POSITIVO_A_PERDIDA, precioNuevo: null };
  }

  let precioNuevo;
  let margenNuevo = null;
  if (enRecargo) {
    precioNuevo = precioDesdeRecargoUnidad({
      costo,
      recargoFijoUnidad: f.recargoFijoUnidad,
      unidadMedida: f.unidadMedida,
      factorPack: f.factorPack,
      redondeo100: f.redondeo100 === true,
    }).precioVenta;
  } else {
    const usaElSuyo = margen !== null && margen > 0;
    precioNuevo = precioDesdeMargen({
      costo,
      margenConfigurado: usaElSuyo ? margen : MARGEN_POR_DEFECTO,
      redondeo100: f.redondeo100 === true,
    }).precioFinal;
    if (!usaElSuyo) margenNuevo = MARGEN_POR_DEFECTO;
  }
  precioNuevo = Math.round(precioNuevo * 100) / 100;

  if (!(precioNuevo > venta)) return { accion: ACCION.NADA, motivo: MOTIVO.NO_SUBE, precioNuevo };
  if (venta > 0 && precioNuevo > venta * TOPE_VECES) {
    return { accion: ACCION.LISTA, motivo: MOTIVO.DOBLE, precioNuevo };
  }
  return { accion: ACCION.APLICAR, precioNuevo, margenNuevo };
}
