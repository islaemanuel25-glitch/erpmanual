// lib/pos-ventas/replayOffline.js
//
// A QUÉ CAJA VA UNA VENTA DE LA COLA OFFLINE AL SINCRONIZAR.
//
// Una venta pertenece a la caja donde se cobró. Offline solo significa que
// llega tarde al servidor: no cambia la propiedad del turno.
//
// Antes, la cola no guardaba el turno: al sincronizar se mandaba
// `turnoActual`, el de quien sincroniza. Con una caja por cuenta daba igual
// —había una sola—; con una caja por operador, eso mudaba la venta de A a la
// caja de B. Ahora la venta se encola con el turno donde se cobró, y se
// sincroniza contra ESE turno. El servidor decide igual que siempre: voucher de
// A, solo caja de A; sin voucher, el PIN activo tiene que ser el de la caja.
//
// Las ventas encoladas antes de este cambio no traen turno. Para ellas:
//
//   · con voucher: el turno actual; el servidor exige que sea del operador del
//     voucher, así que solo entra si quien la cobró está en su caja.
//   · sin voucher, con la caja actual SIN operador: la caja de la cuenta, como
//     fue siempre —había una sola por cuenta—.
//   · sin voucher, con la caja actual de un OPERADOR: no hay forma de saber de
//     quién era. Se FRENA: queda en la cola, no se manda y no se borra. Mandarla
//     sería inventarle una caja.

/** Por qué una venta de la cola no se sincroniza sola. */
export const MOTIVO_SIN_CAJA_DEMOSTRABLE =
  "Hay una venta pendiente de antes de la caja por operador que no se puede atribuir a ninguna caja. Quedó en pendientes: revisala con el encargado.";

/**
 * @param {{ turnoId?: number|null, operadorVoucher?: string|null }} venta  la venta de la cola
 * @param {{ id: number, operadorId?: number|null } | null | undefined} turnoActual
 * @returns {{ turnoId: number } | { frenada: true, motivo: string }}
 */
export function turnoDeReplay(venta, turnoActual) {
  const guardado = Number(venta?.turnoId);
  if (Number.isInteger(guardado) && guardado > 0) return { turnoId: guardado };

  const actual = Number(turnoActual?.id);
  if (!Number.isInteger(actual) || actual <= 0) {
    return { frenada: true, motivo: "Abrí turno para procesar ventas pendientes" };
  }
  if (venta?.operadorVoucher) return { turnoId: actual };
  if (turnoActual.operadorId == null) return { turnoId: actual };
  return { frenada: true, motivo: MOTIVO_SIN_CAJA_DEMOSTRABLE };
}
