// lib/pos-ventas/replayOffline.js
//
// A QUÉ CAJA VA UNA VENTA DE LA COLA OFFLINE AL SINCRONIZAR.
//
// Una venta pertenece a la caja donde se cobró. Offline solo significa que
// llega tarde al servidor: no cambia la propiedad del turno ni su vigencia.
//
// La venta se encola con el turno donde se cobró y se sincroniza contra ESE
// turno, nunca contra el de quien sincroniza. El servidor la trata como una
// venta de ahora: PIN activo del dueño de esa caja, caja operativa y del día.
// Si no puede escribirse así —otra persona sincroniza, la caja cerró o venció—
// el servidor la rechaza y queda en la cola, sin mudarse ni borrarse.
//
// Las ventas encoladas antes de la caja por operador no traen turno. No hay
// forma segura de saber en qué caja se cobraron: con el voucher se sabe quién,
// no dónde, y la caja abierta hoy puede no ser la de entonces. Ninguna se
// sincroniza sola: se FRENAN, quedan en la cola, no se mandan y no se borran.
// Mandarlas sería inventarles una caja.

/** Por qué una venta de la cola no se sincroniza sola. */
export const MOTIVO_SIN_CAJA_DEMOSTRABLE =
  "Hay una venta pendiente de antes de la caja por operador que no se puede atribuir a ninguna caja. Quedó en pendientes: revisala con el encargado.";

/** El servidor no escribe a nombre de un operador la venta que cobró otro. */
export const ERROR_VENTA_DE_OTRO_OPERADOR =
  "Esta venta pendiente la cobró otro operador. Quedó en pendientes: tiene que sincronizarla quien la cobró, con su PIN.";

/**
 * @param {{ turnoId?: number|null }} venta  la venta de la cola
 * @returns {{ turnoId: number } | { frenada: true, motivo: string }}
 */
export function turnoDeReplay(venta) {
  const guardado = Number(venta?.turnoId);
  if (venta?.turnoId != null && Number.isInteger(guardado) && guardado > 0) {
    return { turnoId: guardado };
  }
  return { frenada: true, motivo: MOTIVO_SIN_CAJA_DEMOSTRABLE };
}
