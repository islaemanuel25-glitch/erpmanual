/**
 * Redondeo a 100 hacia arriba (siempre a 100, siempre hacia arriba).
 * Regla: Math.ceil(valor / 100) * 100
 * Usado por stock_locales/listar y pos-ventas/buscar-producto.
 *
 * @param {number|string} valor - Precio a redondear
 * @returns {number} - 0 si valor es inválido o <= 0; si no, valor redondeado a 100 hacia arriba
 */
export function redondear100(valor) {
  const n = Number(valor);
  if (typeof n !== "number" || Number.isNaN(n) || n <= 0) {
    return 0;
  }
  return Math.ceil(n / 100) * 100;
}
