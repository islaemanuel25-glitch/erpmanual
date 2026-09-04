// lib/recargos-pago/recargoPago.js
//
// RECARGO COMERCIAL POR MEDIO DE PAGO — LO QUE EL COMERCIO LE COBRA AL CLIENTE.
//
// ─────────────────────────────────────────────────────────────────────────────
// ESTO NO ES LA COMISIÓN BANCARIA. Son dos números distintos, con dos dueños
// distintos y dos destinos contables distintos, y el día que alguien los mezcle
// los reportes van a mentir en las dos direcciones a la vez.
//
//   RECARGO COMERCIAL (esto)      el comercio se lo cobra AL CLIENTE.
//                                 Sube el total de la venta.
//                                 Vive en `RecargoPagoLocal`, POR LOCAL.
//                                 Se congela en Venta.recargoPagoImporte.
//
//   COMISIÓN BANCARIA (lo otro)   el procesador se la cobra AL COMERCIO.
//                                 NO sube el total: lo baja al neto.
//                                 Vive en `ConfiguracionGrupo.comisionDebito`
//                                 y hermanas, POR GRUPO.
//                                 Se congela en VentaPago.comision.
//
// Un débito con recargo del 5 % y comisión del 7 % sobre una venta de $10.000
// da: el cliente paga $10.500, el banco se queda $735, el comercio recibe
// $9.765. Los tres números son distintos y ninguno se deduce de otro sin saber
// los dos porcentajes.
//
// Por eso este archivo NO importa nada de comisiones, vive en su propio
// directorio y todo lo que exporta dice "recargo" en el nombre. Buscar
// "comision" en el repo no tiene que traer nada de acá.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from "@/lib/pos-ventas/pagos.js";

/**
 * Medios que admiten recargo comercial configurable.
 *
 * FIADO queda AFUERA y no es un olvido: un fiado no es una forma de cobrar sino
 * una promesa de pago, y el recargo se define recién cuando se cobra de verdad.
 * Cobrarlo dos veces —al fiar y al pagar— sería el error obvio. Además FIADO es
 * tender único por regla del sistema, así que su recargo sería el de toda la
 * venta.
 */
export const MEDIOS_CON_RECARGO = ["EFECTIVO", "DEBITO", "CREDITO", "MERCADOPAGO"];

/** Etiquetas para la pantalla de configuración. */
export const MEDIO_RECARGO_LABEL = {
  EFECTIVO: "Efectivo",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  MERCADOPAGO: "Mercado Pago / QR",
};

/** Recargo cuando el local no configuró nada: cero. Nunca se inventa un %. */
export const RECARGO_PCT_DEFAULT = 0;

export const RECARGO_PCT_MIN = 0;
export const RECARGO_PCT_MAX = 100;

/**
 * Convierte las filas de `RecargoPagoLocal` en un mapa medio → %.
 * Los medios sin fila quedan en 0: la ausencia de configuración significa "no se
 * le cobra recargo al cliente", nunca "usá un valor razonable".
 * @param {Array<{medio:string, porcentaje:any}>} filas
 * @returns {Record<string, number>}
 */
export function normalizarRecargos(filas = []) {
  const mapa = {};
  for (const medio of MEDIOS_CON_RECARGO) mapa[medio] = RECARGO_PCT_DEFAULT;
  for (const fila of Array.isArray(filas) ? filas : []) {
    const medio = String(fila?.medio || "").toUpperCase();
    if (!MEDIOS_CON_RECARGO.includes(medio)) continue;
    const pct = Number(fila?.porcentaje);
    mapa[medio] = Number.isFinite(pct) && pct > 0 ? pct : RECARGO_PCT_DEFAULT;
  }
  return mapa;
}

/**
 * Valida un porcentaje de recargo antes de guardarlo.
 * @returns {{valido:true, porcentaje:number} | {valido:false, error:string}}
 */
export function validarRecargoPct(valor) {
  const pct = Number(valor);
  if (!Number.isFinite(pct)) {
    return { valido: false, error: "El recargo no es un número válido." };
  }
  if (pct < RECARGO_PCT_MIN || pct > RECARGO_PCT_MAX) {
    return {
      valido: false,
      error: `El recargo tiene que estar entre ${RECARGO_PCT_MIN} % y ${RECARGO_PCT_MAX} %.`,
    };
  }
  return { valido: true, porcentaje: Math.round(pct * 100) / 100 };
}

/**
 * CONDICIÓN COMERCIAL DE UNA VENTA CON VARIOS MEDIOS.
 *
 * La regla acordada: si la venta usa más de un medio, manda el MAYOR recargo
 * entre los medios usados, y se aplica sobre la venta completa.
 *
 * Se mira la LISTA DE MEDIOS, no los importes. Es deliberado: prorratear el
 * recargo por cuánto se pagó con cada medio daría un número distinto para la
 * misma venta según cómo la parta el cajero, y convertiría el recargo en algo
 * negociable en el mostrador.
 *
 * @param {string[]} mediosUsados medios normalizados (enum MedioPago)
 * @param {Record<string, number>} recargosPorMedio salida de normalizarRecargos
 * @returns {{pct:number, medio:string|null}} medio = el que impuso la condición
 */
export function recargoDeVenta(mediosUsados, recargosPorMedio = {}) {
  const medios = Array.isArray(mediosUsados) ? [...new Set(mediosUsados.filter(Boolean))] : [];
  let pct = 0;
  let medio = null;

  for (const m of medios) {
    // Un medio sin recargo configurable (FIADO) aporta 0 y nunca gana.
    if (!MEDIOS_CON_RECARGO.includes(m)) continue;
    const candidato = Number(recargosPorMedio?.[m]);
    if (!Number.isFinite(candidato) || candidato <= 0) continue;
    if (candidato > pct) {
      pct = candidato;
      medio = m;
    }
  }
  return { pct, medio };
}

/** Importe del recargo sobre una base. Siempre redondeado a 2 decimales. */
export function importeRecargo(base, pct) {
  const b = Number(base);
  const p = Number(pct);
  if (!Number.isFinite(b) || !Number.isFinite(p) || p <= 0 || b <= 0) return 0;
  return round2((b * p) / 100);
}

/**
 * ¿La venta se paga íntegramente en efectivo? Es la condición que exige una
 * oferta SOLO_EFECTIVO, y se contesta con la lista de medios: un solo medio y
 * que sea efectivo.
 */
export function esPagoSoloEfectivo(mediosUsados) {
  const medios = Array.isArray(mediosUsados) ? [...new Set(mediosUsados.filter(Boolean))] : [];
  return medios.length === 1 && medios[0] === "EFECTIVO";
}

/**
 * Texto que el POS muestra ANTES de confirmar un pago combinado. Se arma acá y
 * no en la pantalla para que el backend y el POS digan exactamente lo mismo.
 * @returns {string|null} null si no hay nada que avisar.
 */
export function avisoPagoCombinado({ mediosUsados, recargo, hayOfertaSoloEfectivoEnCarrito }) {
  const medios = Array.isArray(mediosUsados) ? [...new Set(mediosUsados.filter(Boolean))] : [];
  if (medios.length < 2) return null;

  const partes = ["Pago combinado."];
  if (recargo?.pct > 0 && recargo?.medio) {
    partes.push(
      `Se aplicará la condición más alta: ${MEDIO_RECARGO_LABEL[recargo.medio] || recargo.medio} +${recargo.pct} %.`
    );
  }
  if (hayOfertaSoloEfectivoEnCarrito) {
    partes.push("Las ofertas exclusivas de efectivo no aplican.");
  }
  return partes.join("\n");
}
