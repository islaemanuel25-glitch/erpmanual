// lib/pos-ventas/candadoDelLocal.js
//
// EL CANDADO DE VENTAS DE UN LOCAL.
//
// `/api/pos-ventas/crear` lo toma al empezar su transacción: serializa el número
// de venta del local. El registro de cobros offline toma EL MISMO, por la
// misma función, para que registrar y vender nunca se intercalen: o el registro
// ve la venta ya confirmada y la reconcilia, o la venta ve el registro ya
// confirmado y lo sincroniza (lib/pos-ventas/cobroOfflineServidor.js). Un
// segundo candado distinto abriría justo esa ventana.
//
// Es de transacción: se suelta solo al confirmar o revertir.

/** Toma el candado de ventas del local dentro de la transacción `tx`. */
export async function tomarCandadoDelLocal(tx, localId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(localId)})`;
}
