// lib/pos-ventas/idempotenciaVenta.js
//
// CUÁNDO UN PEDIDO DE /api/pos-ventas/crear ES EL REINTENTO DE UNA VENTA QUE YA
// EXISTE.
//
// La idempotencia del POS es `Venta.clientTxnId` (único). Un reintento —la
// respuesta se perdió, la cola offline vuelve a mandar— trae el mismo id y tiene
// que recibir la venta que ya está, sin escribir nada.
//
// Se reconoce en dos momentos, con la MISMA condición:
//
//   · antes de validar el turno, si la venta ya existe (route.js);
//   · después, si dos pedidos con el mismo id pasaron los dos esa consulta y el
//     segundo choca contra el índice único al crear. Su transacción ya se
//     revirtió entera —venta, pagos, stock, movimientos—; falta devolverle la
//     venta del primero en vez de un error de "concurrencia".
//
// La condición es "mismo local y mismo turno" que la venta guardada. Un id que
// apunta a otra caja no se reconoce como reintento: sigue por las validaciones
// de siempre, que deciden con el PIN y la caja propia (DEC-0012).

/**
 * ¿La venta guardada es el destino que pide este pedido?
 * @param {{ localId: number, turnoId: number|null } | null | undefined} venta
 * @param {{ localId: number, turnoId: unknown }} pedido
 */
export function esMismoDestino(venta, { localId, turnoId }) {
  if (!venta) return false;
  const turno = Number(turnoId);
  return venta.localId === localId && Number.isInteger(turno) && venta.turnoId === turno;
}

/**
 * ¿Este error es el choque contra el índice único de `Venta.clientTxnId`, y no
 * otro P2002?
 *
 * La forma, medida contra PostgreSQL con Prisma 6.19:
 *   { code: "P2002", meta: { modelName: "Venta", target: ["clientTxnId"] } }
 * El número de venta da `target: ["localId", "numero"]`, y otras tablas de la
 * misma transacción dan su propio `modelName`: ninguno es un reintento.
 */
export function esChoqueDeClientTxnId(err) {
  if (!err || err.code !== "P2002") return false;
  const meta = err.meta ?? {};
  if (meta.modelName !== "Venta") return false;
  const target = meta.target;
  if (Array.isArray(target)) return target.length === 1 && target[0] === "clientTxnId";
  return target === "Venta_clientTxnId_key";
}
