// lib/precios/recargoFijoUnidad.js
//
// SEGUNDA forma de derivar el precio de venta: en vez de un PORCENTAJE sobre el
// costo, una cantidad fija de PESOS que se suma al costo UNITARIO.
//
//   costo bulto 100.000, factor 10  →  costo unitario 10.000
//   recargo 100                     →  unitario 10.100  →  redondeo  →  precio
//
// Convive con la regla de margen sin tocarla: cuál se usa lo decide
// ProductoLocal.reglaPrecio, y el default es MARGEN_PORCENTUAL, así que todo lo
// que existe hoy sigue funcionando igual.
//
// ── DÓNDE SE REDONDEA ───────────────────────────────────────────────────────
// El redondeo comercial se aplica al precio UNITARIO y recién después se
// multiplica por el factor. El recargo se piensa por unidad, así que lo que tiene
// que quedar redondo es lo que paga el cliente por una unidad. Con costo unitario
// 3.642 y recargo 100 el unitario da 3.742, sube a 3.800 y el precio guardado es
// 38.000 en un pack de 10 — el cliente paga 3.800, no 3.742.
//
// ── EL RECARGO GUARDADO NO SE RECONSTRUYE ───────────────────────────────────
// Es el mismo cuidado que ya tiene el margen: el recargo EFECTIVO que resulta del
// redondeo (en el ejemplo, 158) es informativo y NO se persiste. Si se guardara,
// cada cambio de costo lo iría inflando. Solo una edición manual del precio puede
// recalcularlo, y para eso está `recargoDesdePrecioUnitario`.

import { redondearA100Arriba } from "./precioDesdeMargen.js";

export const REGLA_MARGEN = "MARGEN_PORCENTUAL";
export const REGLA_RECARGO = "RECARGO_FIJO_UNIDAD";

/** ¿La unidad de venta es un bulto con varias unidades adentro? */
export function tienePack(unidadMedida, factorPack) {
  const f = Number(factorPack);
  return ["pack", "cajon"].includes(unidadMedida) && Number.isFinite(f) && f > 1;
}

/**
 * Factor por el que se divide/multiplica para pasar de bulto a unidad.
 * 1 cuando el producto no es un bulto: ahí unidad y bulto son lo mismo.
 */
export function factorDeUnidad(unidadMedida, factorPack) {
  return tienePack(unidadMedida, factorPack) ? Number(factorPack) : 1;
}

/**
 * Costo UNITARIO a partir del costo almacenado (que para pack está por bulto).
 * Misma regla que muestra la ficha en "Costo unitario ref.": costo ÷ factor, a dos
 * decimales. Se extrae acá para que el backend use exactamente la misma cuenta y no
 * aparezca una segunda fórmula.
 */
export function costoUnitarioDesde(costo, unidadMedida, factorPack) {
  // `Number(null)` es 0: sin este chequeo un costo ausente se leería como costo cero
  // y devolvería un unitario de 0. Mismo cuidado que en precioDesdeMargen.
  if (costo === null || costo === undefined || costo === "") return null;
  const c = Number(costo);
  if (!Number.isFinite(c)) return null;
  const f = factorDeUnidad(unidadMedida, factorPack);
  return Number((c / f).toFixed(2));
}

/** ¿Hay regla automática por recargo? Un recargo de 0 es válido: vender al costo. */
export function hayRecargoConfigurado(recargo) {
  const r = Number(recargo);
  return recargo !== null && recargo !== undefined && recargo !== "" && Number.isFinite(r) && r >= 0;
}

/**
 * Precio de venta desde costo + recargo fijo por unidad.
 *
 * @returns {{aplica, recargoConfigurado, costoUnitario, unitarioBase, unitarioFinal,
 *            precioVenta, recargoEfectivo}}
 *   `precioVenta` es el valor a guardar en ProductoLocal.precio_venta, ya en la
 *   escala en la que el ERP guarda los precios (bulto para pack).
 *   `recargoEfectivo` es lo que el redondeo terminó agregando por unidad: solo
 *   informativo, nunca se persiste.
 */
export function precioDesdeRecargoUnidad({
  costo,
  recargoFijoUnidad,
  unidadMedida,
  factorPack,
  redondeo100 = false,
} = {}) {
  const vacio = {
    aplica: false, recargoConfigurado: null, costoUnitario: null,
    unitarioBase: null, unitarioFinal: null, precioVenta: null, recargoEfectivo: null,
  };

  if (!hayRecargoConfigurado(recargoFijoUnidad)) return vacio;
  const costoUnitario = costoUnitarioDesde(costo, unidadMedida, factorPack);
  if (costoUnitario === null || costoUnitario < 0) return vacio;

  const recargo = Number(recargoFijoUnidad);
  const unitarioBase = Number((costoUnitario + recargo).toFixed(2));
  const unitarioFinal = redondeo100 ? redondearA100Arriba(unitarioBase) : unitarioBase;

  const f = factorDeUnidad(unidadMedida, factorPack);
  const precioVenta = Number((unitarioFinal * f).toFixed(2));

  return {
    aplica: true,
    // Invariante del módulo: entra y sale idéntico, igual que margenConfigurado.
    recargoConfigurado: recargo,
    costoUnitario,
    unitarioBase,
    unitarioFinal,
    precioVenta,
    recargoEfectivo: Number((unitarioFinal - costoUnitario).toFixed(2)),
  };
}

/**
 * Recargo que corresponde a un precio escrito A MANO. Es el único camino por el que
 * el recargo guardado puede cambiar: el usuario fijó un precio y de ahí se deduce
 * cuánto le está sumando a cada unidad.
 *
 * @param precioVenta precio en la escala almacenada (bulto para pack).
 */
export function recargoDesdePrecio({ precioVenta, costo, unidadMedida, factorPack } = {}) {
  const p = Number(precioVenta);
  const costoUnitario = costoUnitarioDesde(costo, unidadMedida, factorPack);
  if (!Number.isFinite(p) || costoUnitario === null) return null;
  const f = factorDeUnidad(unidadMedida, factorPack);
  const unitario = p / f;
  return Number((unitario - costoUnitario).toFixed(2));
}
