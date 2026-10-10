// lib/compras-proveedor/comprobante/impuestos.js
//
// LA ARITMÉTICA DE CENTAVOS DEL COMPROBANTE.
//
// Este archivo tenía la cuenta de formato entera —IVA del pie o del renglón,
// interno por unidad o por renglón, percepciones repartidas— con la que se
// verificaba la factura y se armaba el costo. Desde la lectura interpretada
// (#165) el modelo da el costo final de cada renglón y ninguna regla de formato
// lo decide; la segunda parte de #165 borró esa cuenta (`verificarComprobante`,
// la receta por defecto y sus ayudantes).
//
// Lo que queda es lo que usa el resto del módulo y también el importador de
// pedidos: las tolerancias, el paso a centavos y la división del costo final
// del renglón por la cantidad.
//
// Todo se hace en CENTAVOS ENTEROS. La coma flotante no puede decidir si un
// comprobante cierra al centavo.

/**
 * Cuánto se le permite a una cuenta de renglón no cerrar: un centavo, el
 * redondeo del proveedor. La usa el importador de pedidos desde archivo.
 */
export const TOLERANCIA_CENTAVOS = 1;

/**
 * ── Y CUÁNTO SE LE PERDONA AL TOTAL: UN PESO ──────────────────────────────
 *
 * Decisión de Emanuel, y MEDIDA. El papel de Paty, con su único renglón mal
 * leído ya corregido, cierra a CUATRO CENTAVOS del total impreso: son once
 * renglones con descuento y tres con precio por kilo, y cada uno redondea. Con
 * un centavo de tolerancia ese papel perfecto quedaría MAL_LEIDO para siempre.
 *
 * Un peso sigue siendo dos órdenes de magnitud menos que cualquier dígito mal
 * leído —el del yogur son diez pesos— así que no tapa lo que este control
 * existe para atrapar.
 */
export const TOLERANCIA_TOTAL_CENTAVOS = 100;

export const aCentavos = (pesos) => {
  const n = Number(pesos);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
export const aPesos = (centavos) => Math.round(Number(centavos) || 0) / 100;

/**
 * El costo de UNA unidad a partir del costo del renglón entero.
 *
 * POR RENGLÓN y no por unidad: el costo final del renglón ya trae el descuento
 * y los impuestos adentro, y dividirlo una sola vez redondea una sola vez.
 *
 * @param lineaCentavos  el costo final del renglón (más su parte de los cargos)
 * @param divisor        por cuánto se divide: la cantidad, o los kilos
 * @returns centavos, o `null` si no hay por qué dividir
 */
export function costoUnitarioFinalCentavos({ lineaCentavos, divisor } = {}) {
  const d = Number(divisor);
  if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(lineaCentavos)) return null;
  return Math.round(lineaCentavos / d);
}
