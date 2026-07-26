// Aislamiento por ubicación de PEDIDOS A PROVEEDOR (compras).
//
// Un pedido "pertenece" a la ubicación que lo creó (`creadoEnLocalId`). Para
// pedidos viejos sin ese dato, se cae a `depositoId` (backfill = depositoId), que
// era su ubicación efectiva. `depositoId` sigue siendo "dónde entra el stock".
export function ownerLocalIdDePedido(pedido) {
  if (!pedido) return null;
  return pedido.creadoEnLocalId != null ? pedido.creadoEnLocalId : pedido.depositoId ?? null;
}

// ¿El pedido está dentro del alcance (grupo + ubicación activa) del usuario?
// Combina GRUPO + UBICACIÓN: mismo grupo Y misma ubicación dueña.
export function pedidoEnAlcance(pedido, { grupoId, localId }) {
  if (!pedido) return false;
  if (Number(pedido.grupoId) !== Number(grupoId)) return false;
  return Number(ownerLocalIdDePedido(pedido)) === Number(localId);
}
