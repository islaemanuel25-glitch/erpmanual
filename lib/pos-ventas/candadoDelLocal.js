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
//
// ── CUÁNTO SE LO PUEDE TENER Y ESPERAR ─────────────────────────────────────
//
// Quien espera este candado espera a quien lo tiene, así que las transacciones
// que lo toman comparten límites: si `crear` puede tenerlo 30 s, una que lo
// espere con el default de Prisma (5 s) vence esperando una venta legítima y
// termina en P2028. Los límites son los de `crear`, con su porqué al lado de
// su `$transaction` (una venta de 151 líneas venció los 5 s en producción).

/** Los límites de toda transacción que toma el candado del local. */
export const LIMITES_TRANSACCION_DEL_LOCAL = Object.freeze({
  maxWait: 10_000,
  timeout: 30_000,
});

/** Toma el candado de ventas del local dentro de la transacción `tx`. */
export async function tomarCandadoDelLocal(tx, localId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${Number(localId)})`;
}
