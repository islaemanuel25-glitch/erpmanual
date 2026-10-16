// lib/caja/topeDeEfectivo.js
//
// NO SE PAGA MÁS DE LO QUE HAY EN LA CAJA. Regla de Emanuel (2026-10-16): un
// pago de "Pagar" del POS sale del efectivo de la caja abierta, y no puede
// superarlo. El efectivo es el que espera el cierre —`calcularEfectivoEsperado`
// sobre lo vendido y lo movido hasta ahora—: no hay otro número de "lo que hay".
//
// Pura: la usan la pantalla, para apagar el botón, y el servidor, para
// rechazar con 409 dentro de la transacción que crea el egreso. Lo que una deja
// pagar es lo que el otro acepta. Igual a lo que hay, alcanza.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import { formatearMoneda } from "@/lib/moneda";

export const TEXTO_NO_ALCANZA = "No alcanza el efectivo de la caja";

/** ¿El importe supera el efectivo de la caja? Sin efectivo conocido, no se decide acá. */
export function superaElEfectivo({ montoCentavos, efectivo }) {
  if (efectivo === null || efectivo === undefined || montoCentavos === null || montoCentavos === undefined) return false;
  return Number(montoCentavos) > aCentavos(efectivo);
}

/** El rechazo del servidor, con lo que hay. */
export function errorNoAlcanza(efectivo) {
  return `${TEXTO_NO_ALCANZA}: hay ${formatearMoneda(desdeCentavos(aCentavos(efectivo)))}.`;
}
