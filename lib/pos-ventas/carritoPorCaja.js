// lib/pos-ventas/carritoPorCaja.js
//
// UN CARRITO ES DE LA CAJA DE QUIEN LO ARMÓ.
//
// En el mostrador varios operadores comparten la cuenta del local y el
// navegador; cada uno tiene su cajón. Cambiar de operador con el PIN no recarga
// la pantalla, así que el carrito en memoria sobrevive al cambio, y desde que
// el turno sigue al operador, cobrarlo después del cambio lo cargaría en la
// caja del operador NUEVO: A arma, B hace PIN, B cobra lo de A en su cajón.
//
// La regla: el carrito recuerda el operador con el que se empezó a armar —o
// `null` si se armó sin operador— y no se cobra bajo otro. No se descarta solo:
// la venta puede ser de un cliente que está esperando, y si A vuelve a hacer
// PIN la cobra en su caja. Quien quiera vender en la suya lo vacía con el botón
// de siempre.
//
// Lo que ya existía se conserva: el borrador persistido solo se restauraba en
// el mismo local y la misma cuenta. Ahora además con el mismo operador. Un
// borrador viejo, sin dueño registrado, no se restaura bajo un operador:
// no hay forma de saber de quién era.

/** El texto que ve quien intenta cobrar un carrito ajeno. */
export const ERROR_CARRITO_DE_OTRA_CAJA =
  "Este carrito se armó en la caja de otro operador. Para vender en tu caja, vaciá el carrito.";

function idONulo(valor) {
  const n = Number(valor);
  return valor != null && Number.isInteger(n) && n > 0 ? n : null;
}

/** El operador dueño de un carrito que empieza ahora: el activo, o nadie. */
export function duenoDelCarrito(operadorActivoId) {
  return idONulo(operadorActivoId);
}

/**
 * ¿Este carrito, armado por `duenoOperadorId`, se puede cobrar con el operador
 * activo? Un carrito vacío no es de nadie y siempre se puede.
 */
export function carritoCobrable({ carritoVacio, duenoOperadorId }, operadorActivoId) {
  if (carritoVacio) return true;
  return idONulo(duenoOperadorId) === idONulo(operadorActivoId);
}

/**
 * ¿Este borrador persistido se restaura acá? Mismo local, misma cuenta —lo de
 * siempre— y mismo operador. El borrador sin el campo `operadorId` es anterior
 * a esta regla: se restaura solo si tampoco hay operador activo.
 */
export function borradorRestaurable(borrador, { localId, userId, operadorId }) {
  if (!borrador || typeof borrador !== "object") return false;
  if (borrador.localId !== localId || borrador.userId !== userId) return false;
  const actual = idONulo(operadorId);
  if (!Object.prototype.hasOwnProperty.call(borrador, "operadorId")) return actual === null;
  return idONulo(borrador.operadorId) === actual;
}
