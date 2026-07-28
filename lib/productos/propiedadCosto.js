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

/**
 * ¿La ubicación puede editar la FICHA MAESTRA (ProductoBase) de este producto?
 * Rige EXACTAMENTE la misma regla de propiedad que el costo: solo el DUEÑO
 * (el depósito para productos de depósito; el local creador para exclusivos).
 * Reutiliza `puedeEditarCosto` para que costo y ficha maestra no puedan divergir.
 */
export function puedeEditarBaseProducto(operandoEnLocalId, creadoEnLocalId, depositoLocalId) {
  return puedeEditarCosto(operandoEnLocalId, creadoEnLocalId, depositoLocalId);
}

/**
 * Alcance de edición de un producto para la ubicación que opera (regla de LOCAL):
 *   'base'     → es el dueño: edita ProductoBase + costo + su override.
 *   'override' → producto de depósito visto desde un local NO dueño: solo su
 *                override permitido de ProductoLocal (precio_venta/margen/activo/…).
 *   'deny'     → producto exclusivo de OTRO local: sin acceso.
 * Fail-closed: localId inválido → 'deny'.
 */
export function alcanceEdicionProducto(operandoEnLocalId, creadoEnLocalId, depositoLocalId) {
  const op = Number(operandoEnLocalId);
  if (!Number.isInteger(op) || op <= 0) return "deny";
  if (puedeEditarBaseProducto(op, creadoEnLocalId, depositoLocalId)) return "base";
  if (esProductoDeDeposito(creadoEnLocalId, depositoLocalId)) return "override";
  return "deny";
}

/**
 * Ruta de edición unificada (la usan tanto la API de edición como la de obtener,
 * para que el flag `puedeEditarBase` del front y el ruteo del backend NUNCA se
 * contradigan → sin "guardado engañoso").
 *
 * El ADMIN conserva el comportamiento vigente por ubicación (edita la base en
 * contexto depósito / sin local; el override en un local), sin la restricción de
 * propiedad entre locales. Un no-admin se rige por `alcanceEdicionProducto`.
 */
export function resolverRutaEdicion({
  esAdmin,
  operandoEnLocalId,
  esDepositoContext,
  creadoEnLocalId,
  depositoLocalId,
}) {
  if (esAdmin) {
    const op = Number(operandoEnLocalId);
    if (!Number.isInteger(op) || op <= 0) return "base"; // sin local → base
    return esDepositoContext ? "base" : "override";
  }
  return alcanceEdicionProducto(operandoEnLocalId, creadoEnLocalId, depositoLocalId);
}

/** Mensaje para acceso denegado: producto exclusivo de otro local. */
export function mensajeProductoAjeno() {
  return "Este producto pertenece a otro local y no podés editarlo.";
}

/** Mensaje para intento de cambiar la ficha maestra desde un local no dueño. */
export function mensajeFichaMaestraNoEditable() {
  return "No podés modificar la ficha maestra de un producto administrado por el depósito. Solo podés editar el precio de venta, el margen y el estado en tu local.";
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
