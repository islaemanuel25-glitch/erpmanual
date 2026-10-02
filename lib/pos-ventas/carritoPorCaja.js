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
// La regla: el carrito en pantalla es el de UNA identidad de caja, y no se
// cobra bajo otra. Al cambiar de PIN, la pantalla guarda el de A en la clave de
// A y carga el de B; cuando A vuelve, encuentra el suyo. La guarda de cobro
// (`carritoCobrable`) ataja el instante intermedio y el carrito cuya caja
// todavía no se sabe. Nada se descarta solo.
//
// ── UN BORRADOR POR IDENTIDAD, NO UNO POR NAVEGADOR ──────────────────────
//
// El borrador persistido era UNO por navegador (`posVentasCarritoEnCurso_v1`).
// Con el turno siguiendo al operador, eso perdía carritos en silencio: la
// persistencia corre en cada render y escribía el carrito vacío de B encima del
// de A —al recargar con B activo, o durante la carga asíncrona del operador,
// antes de que la restauración decidiera—. Ahora cada identidad de caja
// (local + cuenta + operador, o la cuenta sola sin operador) tiene SU clave:
// el carrito de A queda en la de A mientras B trabaja, y cuando A vuelve lo
// encuentra. Nada escribe en una clave hasta saber de quién es el carrito que
// está en pantalla.
//
// El borrador viejo, el de la clave única, no dice de qué operador era. Se
// restaura —y se muda a su clave— solo para quien opera SIN operador, que es
// para quien se escribió; bajo un PIN no se carga ni se borra: no hay forma de
// saber de quién era, y cobrarlo en una caja de operador sería adivinar.

/** La clave única de antes. Sigue siendo el prefijo de las nuevas. */
export const CLAVE_BORRADOR_LEGADO = "posVentasCarritoEnCurso_v1";

/** La clave del borrador de una identidad de caja. */
export function claveBorrador({ localId, userId, operadorId }) {
  return `${CLAVE_BORRADOR_LEGADO}:${localId}:${userId}:${idONulo(operadorId) ?? "cuenta"}`;
}

function leerJson(storage, clave) {
  try {
    const raw = storage.getItem(clave);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Dato corrupto: se trata como ausente, igual que antes.
    return null;
  }
}

/**
 * EL CARRITO DE UNA IDENTIDAD: su clave, su operador y su borrador si lo hay.
 *
 * Muda el borrador viejo a su clave cuando corresponde —escribe primero la
 * clave nueva y recién después borra la vieja, así un cierre del navegador en
 * el medio no lo pierde—. No toca ninguna otra clave.
 *
 * @param {{ getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem(k:string):void }} storage
 * @returns {{ clave:string, operadorId:number|null, borrador:object|null }}
 */
export function cargarCarritoDeIdentidad(storage, { localId, userId, operadorId }) {
  const identidad = { localId, userId, operadorId: idONulo(operadorId) };
  const clave = claveBorrador(identidad);
  const propio = leerJson(storage, clave);
  if (propio && borradorRestaurable(propio, identidad)) {
    return { clave, operadorId: identidad.operadorId, borrador: propio };
  }
  const viejo = leerJson(storage, CLAVE_BORRADOR_LEGADO);
  if (viejo && borradorRestaurable(viejo, identidad)) {
    const mudado = { ...viejo, operadorId: identidad.operadorId };
    storage.setItem(clave, JSON.stringify(mudado));
    storage.removeItem(CLAVE_BORRADOR_LEGADO);
    return { clave, operadorId: identidad.operadorId, borrador: mudado };
  }
  return { clave, operadorId: identidad.operadorId, borrador: null };
}

/**
 * Guarda el carrito en pantalla en la clave de SU caja. Vacío, la borra: no
 * hay nada que recuperar, y un borrador vacío no puede pisar a nadie porque
 * cada caja tiene la suya.
 */
export function guardarCarritoDeCaja(storage, caja, contenido) {
  if (!caja?.clave) return;
  if (!Array.isArray(contenido?.carrito) || contenido.carrito.length === 0) {
    storage.removeItem(caja.clave);
    return;
  }
  storage.setItem(caja.clave, JSON.stringify({ ...contenido, operadorId: caja.operadorId ?? null }));
}

/** El texto que ve quien intenta cobrar un carrito ajeno. */
export const ERROR_CARRITO_DE_OTRA_CAJA =
  "Este carrito se armó en la caja de otro operador. Para vender en tu caja, vaciá el carrito.";

function idONulo(valor) {
  const n = Number(valor);
  return valor != null && Number.isInteger(n) && n > 0 ? n : null;
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
