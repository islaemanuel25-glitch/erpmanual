// lib/compras-proveedor/saldoAlRecibir.js
//
// RECIBIR CON DEUDA NO PUEDE PASAR EN SILENCIO. Regla de Emanuel (2026-10-15):
// se pagaron $10.000 desde la caja, se cargó mercadería por $16.000 y se
// recibió sin que nadie se enterara; la diferencia quedó como saldo en Finanzas
// sin que nadie la viera nacer.
//
// Si al recibir algo ya se pagó —desde la caja del POS, o ahora en el cierre—
// y aun así queda saldo, quien recibe lo tiene que CONFIRMAR, con el mismo
// saldo que vio. Sin pago no hay aviso: "queda pendiente" ya es una decisión
// explícita de la hoja. Si lo pagado supera lo cargado, sigue frenado como
// siempre (`errorPagadoDeMas`).
//
// La regla vive acá, pura, y la usan la hoja de cierre (para mostrar el aviso)
// y la ruta de recepción (para exigir la confirmación): lo que la pantalla deja
// confirmar es lo que el servidor acepta.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { formatearMoneda } from "@/lib/moneda";

export const CODIGO_SALDO_SIN_CONFIRMAR = "SALDO_SIN_CONFIRMAR";
export const TIPO_NOTIFICACION_SALDO = "COMPRA_CON_SALDO";

/** La plata con el formateador único del sistema: `$16.000,00`, como el resto de la pantalla. */
const plata = (centavos) => formatearMoneda(desdeCentavos(centavos));

/**
 * ¿Queda deuda después de recibir, habiendo pagado algo?
 *
 * @param {{totalCentavos:number, yaPagadoCentavos?:number, pagoAhoraCentavos?:number}} args
 * @returns {{ totalCentavos:number, pagadoCentavos:number, saldoCentavos:number, pideConfirmacion:boolean }}
 */
export function saldoAlRecibir({ totalCentavos, yaPagadoCentavos = 0, pagoAhoraCentavos = 0 }) {
  const total = Math.max(0, Number(totalCentavos) || 0);
  const pagado = Math.max(0, (Number(yaPagadoCentavos) || 0) + (Number(pagoAhoraCentavos) || 0));
  const saldo = Math.max(0, total - pagado);
  return { totalCentavos: total, pagadoCentavos: pagado, saldoCentavos: saldo, pideConfirmacion: pagado > 0 && saldo > 0 };
}

/**
 * ¿La confirmación que mandó la pantalla es la de ESTE saldo? Tiene que venir
 * el mismo importe que se vio: si el saldo cambió mientras tanto, se vuelve a
 * preguntar.
 */
export function confirmaElSaldo(saldoConfirmado, saldoCentavos) {
  if (saldoConfirmado === undefined || saldoConfirmado === null || saldoConfirmado === "") return false;
  const leido = Math.round(Number(saldoConfirmado) * 100);
  return Number.isFinite(leido) && leido === saldoCentavos;
}

/** "Pedido $16.000 · Pagado $10.000 · Quedan $6.000 a deber a {proveedor}" */
export function textoDelAviso({ proveedor, totalCentavos, pagadoCentavos, saldoCentavos }) {
  return `Pedido ${plata(totalCentavos)} · Pagado ${plata(pagadoCentavos)} · Quedan ${plata(saldoCentavos)} a deber a ${proveedor}`;
}

/** "Recibir y dejar $6.000 a deber" */
export function textoDelBoton(saldoCentavos) {
  return `Recibir y dejar ${plata(saldoCentavos)} a deber`;
}

/** La campanita: "{proveedor}: quedan $6.000 a deber" */
export function textoDeLaNotificacion({ proveedor, saldoCentavos }) {
  return `${proveedor}: quedan ${plata(saldoCentavos)} a deber`;
}

/** Azul Chat: "{proveedor}: pedido $16.000 · pagado $10.000 · quedan $6.000 a deber" */
export function textoDelEvento({ proveedor, totalCentavos, pagadoCentavos, saldoCentavos }) {
  return `${proveedor}: pedido ${plata(totalCentavos)} · pagado ${plata(pagadoCentavos)} · quedan ${plata(saldoCentavos)} a deber`;
}

/**
 * ¿La compra está en "Pago parcial"? La recibió alguien confirmando deuda y su
 * cuenta todavía tiene saldo. Dos hechos: la confirmación y el saldo de hoy.
 */
export function esPagoParcial({ compraConSaldo, cuenta }) {
  if (!compraConSaldo || !cuenta) return false;
  return aCentavos(cuenta.saldo) > 0;
}
