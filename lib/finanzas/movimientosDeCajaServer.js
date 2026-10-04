// lib/finanzas/movimientosDeCajaServer.js
//
// LOS VÍNCULOS QUE DECIDEN LA CLASE DE CADA MOVIMIENTO DE CAJA, LEÍDOS DE LA
// BASE EN UN SOLO LUGAR.
//
// `clasificarMovimientos` (movimientosDeCaja.js) es pura y recibe los cuatro
// conjuntos por argumento. Quién los arma estaba escrito adentro del tablero de
// Finanzas; Tesorería necesita exactamente lo mismo, y dos copias de las cuatro
// consultas son dos lugares donde un vínculo nuevo se agrega en uno y se olvida
// en el otro —la regla 1 de CLAUDE.md—. Por eso viven acá y las usan los dos.
//
// Se pregunta por los ids de los MOVIMIENTOS, no por turnos ni por fechas: un
// movimiento leído puede pertenecer a un turno que abrió antes del rango, y
// buscándolo por turno quedaría sin clasificar.
//
// Nunca por el texto del motivo, que es libre.

/**
 * @param {object} db  cliente Prisma o de transacción
 * @param {number[]} idsDeMovimiento
 * @returns {Promise<{idsDeRecaudacion:Set<number>, idsDeCierre:Set<number>,
 *   idsDePagoProveedor:Set<number>, idsDePagoGasto:Set<number>}>}
 *   los cuatro conjuntos en la forma exacta que pide `clasificarMovimientos`.
 */
export async function vinculosDeMovimientos(db, idsDeMovimiento = []) {
  if (!idsDeMovimiento.length) {
    return { idsDeRecaudacion: new Set(), idsDeCierre: new Set(), idsDePagoProveedor: new Set(), idsDePagoGasto: new Set() };
  }
  const [arqueosConRetiro, turnosConRetiroDeCierre, pagosConRetiro, pagosDeGastoConRetiro] = await Promise.all([
    db.arqueoCaja.findMany({
      where: { cajaMovimientoRetiroId: { in: idsDeMovimiento } },
      select: { cajaMovimientoRetiroId: true },
    }),
    db.turno.findMany({
      where: { retiroCierreMovimientoId: { in: idsDeMovimiento } },
      select: { retiroCierreMovimientoId: true },
    }),
    // El pago a proveedor en efectivo se reconoce por `PagoProveedor.cajaMovimientoId`
    // (UNIQUE). Sin esto caería en los retiros manuales, y el día que se sumen los
    // pagos ese mismo peso contaría dos veces.
    db.pagoProveedor.findMany({
      where: { cajaMovimientoId: { in: idsDeMovimiento } },
      select: { cajaMovimientoId: true },
    }),
    // El pago de un gasto en efectivo, igual, por `PagoGasto.cajaMovimientoId`.
    db.pagoGasto.findMany({
      where: { cajaMovimientoId: { in: idsDeMovimiento } },
      select: { cajaMovimientoId: true },
    }),
  ]);
  return {
    idsDeRecaudacion: new Set(arqueosConRetiro.map((a) => a.cajaMovimientoRetiroId)),
    idsDeCierre: new Set(turnosConRetiroDeCierre.map((t) => t.retiroCierreMovimientoId)),
    idsDePagoProveedor: new Set(pagosConRetiro.map((p) => p.cajaMovimientoId)),
    idsDePagoGasto: new Set(pagosDeGastoConRetiro.map((p) => p.cajaMovimientoId)),
  };
}
