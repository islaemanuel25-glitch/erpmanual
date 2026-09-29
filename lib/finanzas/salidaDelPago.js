// lib/finanzas/salidaDelPago.js
//
// DE DÓNDE Y CUÁNDO SALE LA PLATA DE UN PAGO. Una sola vez para todos los pagos.
//
// La usan `registrarPagoProveedor` y `registrarPagoGasto`. Estaba escrita
// adentro de la primera; se sacó acá cuando llegó la segunda, para que el
// efectivo de un gasto y el de un proveedor salgan del cajón con la MISMA regla
// —el mismo lock del turno, la misma condición de turno operativo, el mismo
// RETIRO— y no con dos parecidas que un día dejen de coincidir.
//
// ── EFECTIVO ────────────────────────────────────────────────────────────
//
// Sale de un turno: tiene que venir, ser de la ubicación de origen y estar
// operando —`WHERE_TURNO_OPERATIVO`, la misma condición que usa el POS para
// vender—, y no estar anulado. Se toma el lock del turno, el mismo que toman el
// retiro y el cierre, y se crea UN `CajaMovimiento` RETIRO. Como es un RETIRO
// común, el efectivo esperado del turno lo descuenta por el camino de siempre y
// una sola vez. Quien llama deja su pago apuntando a él: ese vínculo, con
// UNIQUE, es lo único que dice de qué pago es el retiro. El `motivo` es texto
// para una persona y no decide nada.
//
// ── LOS DEMÁS MEDIOS ────────────────────────────────────────────────────
//
// No tocan la caja: sin turno y sin movimiento. Registran el día del pago —hoy
// o uno anterior, nunca uno futuro— y nada más. Todavía no existen cuentas
// financieras de origen; cuando existan, se eligen acá.
//
// Recibe `tx` y no abre transacción: quien llama decide la unidad, y un rechazo
// de acá, lanzado antes de escribir, no deja nada a medias.

import { WHERE_TURNO_OPERATIVO } from "@/lib/caja/cierreRelevo";
import { bloquearTurno } from "@/lib/caja/cierreRelevoServer";
import { hoyArgentinaISO, inicioDiaArgentina } from "@/lib/fechas/rangoArgentina";

import { leerDiaDePago } from "./pagosProveedores";

export const ERROR_FALTA_TURNO = "Un pago en efectivo tiene que salir de un turno abierto.";
export const ERROR_TURNO_NO_OPERATIVO =
  "Ese turno no está abierto en la ubicación de origen. El efectivo sale de un cajón que está operando.";
export const ERROR_TURNO_SIN_EFECTIVO = "Solo un pago en efectivo sale de un turno de caja.";
export const ERROR_TURNO_DE_OTRA_UBICACION =
  "Ese turno es de otra ubicación. El efectivo sale del cajón de la ubicación que debe.";

/** El único medio que sale de un cajón. Los dos enums de pago lo escriben igual. */
export const MEDIO_EFECTIVO = "EFECTIVO";

/**
 * RESUELVE LA SALIDA DEL DINERO de un pago ya validado.
 *
 * @param {object} tx cliente de transacción
 * @param {object} args
 * @param {string} args.medio  el medio del pago; solo "EFECTIVO" toca la caja
 * @param {number|string|null} [args.turnoId]  solo en efectivo
 * @param {string|null} [args.fecha]  "AAAA-MM-DD", solo fuera de efectivo
 * @param {number} args.localOrigenId  la ubicación de la que sale la plata
 * @param {number} args.usuarioId
 * @param {string} args.monto  el importe ya validado, en pesos (`desdeCentavos`)
 * @param {string} args.motivo  el texto del RETIRO, solo para leer
 * @param {(mensaje:string, status:number) => Error} args.crearError  el error
 *        de quien llama, para que la ruta lo reconozca como suyo
 * @returns {Promise<{ turnoId:number|null, cajaMovimientoId:number|null, fecha:Date }>}
 */
export async function resolverSalidaDelPago(tx, args = {}) {
  const { crearError } = args;
  const turnoPedido = args.turnoId === null || args.turnoId === undefined || args.turnoId === ""
    ? null
    : Number(args.turnoId);

  if (args.medio !== MEDIO_EFECTIVO) {
    if (turnoPedido !== null) throw crearError(ERROR_TURNO_SIN_EFECTIVO, 400);
    const hoy = hoyArgentinaISO();
    const dia = leerDiaDePago(args.fecha, hoy);
    if (dia.error) throw crearError(dia.error, 400);
    // Hoy es el instante; un día anterior es el comienzo de ese día argentino.
    return {
      turnoId: null,
      cajaMovimientoId: null,
      fecha: dia.valor === hoy ? new Date() : inicioDiaArgentina(dia.valor),
    };
  }

  const localOrigenId = Number(args.localOrigenId);
  if (!Number.isInteger(turnoPedido) || turnoPedido <= 0) throw crearError(ERROR_FALTA_TURNO, 400);

  // El lock del turno es el mismo que toman el retiro y el cierre: un corte que
  // se está tomando en este instante no puede quedarse sin ver este retiro, ni
  // este retiro caer después de su frontera.
  await bloquearTurno(tx, turnoPedido);
  // Un turno de OTRA ubicación es la caja de otro: 403, como el origen. Que sea
  // de la ubicación y no esté operando es otra cosa —el cajón existe pero
  // cerró— y sigue siendo 409.
  const delTurno = await tx.turno.findUnique({ where: { id: turnoPedido }, select: { localId: true } });
  if (delTurno && delTurno.localId !== localOrigenId) throw crearError(ERROR_TURNO_DE_OTRA_UBICACION, 403);
  const turno = await tx.turno.findFirst({
    where: { id: turnoPedido, localId: localOrigenId, anuladoEn: null, ...WHERE_TURNO_OPERATIVO },
    select: { id: true },
  });
  if (!turno) throw crearError(ERROR_TURNO_NO_OPERATIVO, 409);

  const movimiento = await tx.cajaMovimiento.create({
    data: {
      turnoId: turno.id,
      usuarioId: args.usuarioId,
      tipo: "RETIRO",
      monto: args.monto,
      motivo: args.motivo,
    },
    select: { id: true, createdAt: true },
  });
  // La fecha del pago es la del movimiento: la plata salió del cajón AHORA, y
  // un pago en efectivo fechado distinto de su retiro no cerraría con el turno.
  return { turnoId: turno.id, cajaMovimientoId: movimiento.id, fecha: movimiento.createdAt };
}
