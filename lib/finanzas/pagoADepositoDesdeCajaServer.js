// lib/finanzas/pagoADepositoDesdeCajaServer.js
//
// LO QUE SE LE PAGÓ AL DEPÓSITO CON EFECTIVO DE UNA CAJA DEL LOCAL, en el
// período. Lo escribe "Pagar → Al depósito" del POS: un `CajaMovimiento` RETIRO
// con tipo AL_DEPOSITO. Solo lee.
//
// NO es el número del Pago a depósito. Ése es lo RECIBIDO del depósito y lo
// decide Transferencias (`detalleDePagoADeposito`); esto es la plata que salió
// del cajón para pagarlo, y se muestra al lado, sin sumarla ni restarla de nada.
// Un período puede tener las dos cosas en días distintos.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { TIPO_EGRESO } from "@/lib/caja/tipoEgreso";
import { getRangoArgentina } from "@/lib/fechas/rangoArgentina";

/**
 * @param {object} db
 * @param {{ localId:number, rango:{desde:string, hasta:string} }} args
 * @returns {Promise<{ total:number, items:Array<{id:number, fecha:Date, monto:number, cajaId:number}> }>}
 */
export async function pagadoAlDepositoDesdeCaja(db, { localId, rango }) {
  const { fechaInicio, fechaFin } = getRangoArgentina(rango.desde, rango.hasta);
  const movimientos = await db.cajaMovimiento.findMany({
    where: {
      tipo: "RETIRO",
      tipoEgreso: TIPO_EGRESO.AL_DEPOSITO,
      turno: { localId: Number(localId), anuladoEn: null },
      createdAt: { gte: fechaInicio, lte: fechaFin },
    },
    select: { id: true, monto: true, createdAt: true, turnoId: true },
    orderBy: { createdAt: "asc" },
  });
  return {
    total: desdeCentavos(movimientos.reduce((s, m) => s + aCentavos(m.monto), 0)),
    items: movimientos.map((m) => ({ id: m.id, fecha: m.createdAt, monto: desdeCentavos(aCentavos(m.monto)), cajaId: m.turnoId })),
  };
}
