// lib/precios/ventaSegunRegla.js
//
// EL PRECIO DE VENTA DE UNA UBICACIÓN, SEGÚN SU REGLA. Una sola función para
// todo el que recalcula un precio cuando cambia el costo.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// La decisión "¿esta fila va por margen o por recargo fijo por unidad?" estaba
// escrita adentro de `propagarCostoALocales` y en ningún otro lado. Aplicar una
// lista de proveedor recalculaba la venta de cada ubicación con
// `precioDesdeMargen` SIN mirar `reglaPrecio`: una fila en recargo fijo que
// arrastraba un margen viejo —el schema no lo borra al cambiar de regla, a
// propósito— salía con ese margen viejo en vez de costo unitario + recargo.
// Mismo dato, dos caminos, dos precios. (Emanuel, 2026-11-03: caso de Casiano,
// cartón de 10, costo $40.260, recargo $300 por unidad.)
//
// ── LA CUENTA NO SE ESCRIBE ACÁ ─────────────────────────────────────────────
//
// Acá solo se ELIGE. La cuenta del recargo es `precioDesdeRecargoUnidad`
// —(costo del bulto ÷ unidades + recargo), redondeo comercial sobre el unitario,
// × unidades— y la del margen es `precioDesdeMargen`. Una tercera fórmula sería
// la que un día dice distinto.

import { precioDesdeMargen, hayReglaAutomatica } from "./precioDesdeMargen.js";
import { REGLA_RECARGO, precioDesdeRecargoUnidad } from "./recargoFijoUnidad.js";

/**
 * Precio de venta de una ubicación para un costo, con SU regla.
 *
 * En modo recargo no se mira ningún margen —ni el de la fila ni el de la ficha—:
 * puede haber uno viejo guardado y no es el que rige. En modo margen, el de la
 * ubicación tiene prioridad y el de la ficha es el respaldo.
 *
 * @param {object} p
 * @param {number|string} p.costo              costo en la escala guardada (bulto para pack).
 * @param {string|null}   p.reglaPrecio        "MARGEN_PORCENTUAL" | "RECARGO_FIJO_UNIDAD".
 * @param {number|string|null} p.recargoFijoUnidad pesos por unidad, si la regla es recargo.
 * @param {number|string|null} p.margenLocal   margen configurado de la ubicación.
 * @param {number|string|null} p.margenBase    margen de la ficha (respaldo).
 * @param {string|null}   p.unidadMedida       de la ficha: `pack`, `cajon`, ...
 * @param {number|null}   p.factorPack         unidades por bulto.
 * @param {boolean}       p.redondeo100        el redondeo comercial de la ficha.
 * @returns {{aplica: boolean, precioVenta: number|null, regla: string,
 *            margenConfigurado: number|null, recargoConfigurado: number|null}}
 *   `aplica` en false: sin regla automática, el precio no se toca.
 */
export function ventaSegunRegla({
  costo,
  reglaPrecio = null,
  recargoFijoUnidad = null,
  margenLocal = null,
  margenBase = null,
  unidadMedida = null,
  factorPack = null,
  redondeo100 = false,
} = {}) {
  if (reglaPrecio === REGLA_RECARGO) {
    const r = precioDesdeRecargoUnidad({ costo, recargoFijoUnidad, unidadMedida, factorPack, redondeo100 });
    return {
      aplica: r.aplica,
      precioVenta: r.aplica ? r.precioVenta : null,
      regla: REGLA_RECARGO,
      margenConfigurado: null,
      recargoConfigurado: r.aplica ? r.recargoConfigurado : null,
    };
  }

  const margenConfigurado = margenLocal !== null && margenLocal !== undefined ? margenLocal : margenBase;
  if (!hayReglaAutomatica(margenConfigurado)) {
    return { aplica: false, precioVenta: null, regla: "MARGEN_PORCENTUAL", margenConfigurado: null, recargoConfigurado: null };
  }
  const { aplica, precioFinal } = precioDesdeMargen({ costo, margenConfigurado, redondeo100 });
  return {
    aplica,
    precioVenta: aplica ? precioFinal : null,
    regla: "MARGEN_PORCENTUAL",
    margenConfigurado: Number(margenConfigurado),
    recargoConfigurado: null,
  };
}
