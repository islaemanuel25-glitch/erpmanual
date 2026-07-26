// lib/productos/propiedadCosto.js
//
// Regla CANÓNICA de propiedad del PRECIO DE COSTO, server-authoritative y pura
// (sin imports de servidor: se puede testear con node --test y usar en el front).
//
// Origen del producto = ProductoBase.creadoEnLocalId + el localId del depósito del
// grupo (getDepositoIdDeGrupo). Interpretación:
//   - creadoEnLocalId null  → producto de DEPÓSITO (legacy/huérfano, decisión D2).
//   - creadoEnLocalId === depósito → producto de DEPÓSITO (catálogo compartido).
//   - creadoEnLocalId de un local (es_deposito=false) → producto EXCLUSIVO de ese
//     local, y ese creadoEnLocalId ES el local propietario.
//
// El COSTO (ProductoBase.precio_costo Y el override ProductoLocal.precio_costo)
// solo lo administra el DUEÑO de la ubicación:
//   - producto de depósito  → solo el depósito.
//   - producto exclusivo    → solo el local creador.
//
// Las decisiones se basan SIEMPRE en datos del servidor (creadoEnLocalId real +
// depósito del grupo), nunca en flags del cliente.

/** ¿El producto es del depósito (compartido)? */
export function esProductoDeDeposito(creadoEnLocalId, depositoLocalId) {
  if (creadoEnLocalId == null) return true; // legacy/huérfano → depósito (D2)
  if (depositoLocalId == null) return false; // sin depósito resoluble → no asumir depósito
  return Number(creadoEnLocalId) === Number(depositoLocalId);
}

/** localId dueño del costo: el depósito para productos de depósito; el creador para exclusivos. */
export function localPropietarioDelCosto(creadoEnLocalId, depositoLocalId) {
  if (esProductoDeDeposito(creadoEnLocalId, depositoLocalId)) {
    return depositoLocalId == null ? null : Number(depositoLocalId);
  }
  return Number(creadoEnLocalId);
}

/**
 * ¿La ubicación `operandoEnLocalId` puede modificar el costo de este producto?
 * true solo si es el dueño (depósito para productos de depósito; local creador
 * para exclusivos). Fail-closed: sin dueño resoluble o localId inválido → false.
 */
export function puedeEditarCosto(operandoEnLocalId, creadoEnLocalId, depositoLocalId) {
  const owner = localPropietarioDelCosto(creadoEnLocalId, depositoLocalId);
  const op = Number(operandoEnLocalId);
  if (!Number.isInteger(op) || op <= 0) return false;
  if (owner == null) return false;
  return op === owner;
}

/** Mensaje claro para un intento no permitido de modificar el costo. */
export function mensajeCostoNoEditable(creadoEnLocalId, depositoLocalId) {
  return esProductoDeDeposito(creadoEnLocalId, depositoLocalId)
    ? "El precio de costo de este producto es administrado por el depósito."
    : "Este producto solamente puede ser administrado por el local que lo creó.";
}

/** ¿Dos costos son "el mismo" a nivel moneda (tolerancia 0,005)? null==null → true. */
export function mismoCosto(a, b) {
  const an = a === null || a === undefined || a === "" ? null : Number(a);
  const bn = b === null || b === undefined || b === "" ? null : Number(b);
  if (an === null && bn === null) return true;
  if (an === null || bn === null) return false;
  if (Number.isNaN(an) || Number.isNaN(bn)) return false;
  return Math.abs(an - bn) < 0.005;
}
