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
 * EL ORDEN TOTAL ENTRE CANDIDATOS A IMPONER EL RECARGO.
 *
 * Primero el porcentaje más alto, que es la regla comercial. Lo que sigue son
 * DESEMPATES, y existen por un motivo concreto: desde que hay modalidades, dos
 * candidatos pueden empatar sin ser el mismo —"Crédito 1 pago" y "Crédito
 * cuotas" pueden estar los dos al 8 %— y la venta tiene que congelar CUÁL de los
 * dos impuso la condición.
 *
 * Antes el desempate era "el primero de la lista", y la lista salía del orden en
 * que el cajero tocó los botones. Eso alcanzaba mientras el ganador se
 * identificaba solo por su tipo contable —dos empatados en DEBITO daban el mismo
 * `medio`, así que daba igual cuál ganara— y deja de alcanzar cuando lo que se
 * congela es una identidad.
 *
 * El orden es sobre datos ESTABLES —porcentaje, tipo contable, id— y no sobre la
 * posición en un array ni sobre el orden en que Postgres devolvió las filas. Por
 * eso preview y backend llegan al mismo ganador aunque hayan leído distinto.
 */
export function compararCondicionesDeRecargo(a, b) {
  const pa = Number(a?.recargoPct) || 0;
  const pb = Number(b?.recargoPct) || 0;
  if (pa !== pb) return pb - pa;

  const ma = String(a?.medio ?? "");
  const mb = String(b?.medio ?? "");
  if (ma !== mb) return ma < mb ? -1 : 1;

  // Los ids son enteros positivos; `0` deja a los candidatos sin identidad
  // —el camino legacy— antes que a los que la tienen, que es el orden natural
  // entre "no se sabe cuál" y "éste".
  const moa = Number(a?.modalidadId) || 0;
  const mob = Number(b?.modalidadId) || 0;
  if (moa !== mob) return moa - mob;

  return (Number(a?.medioCobroLocalId) || 0) - (Number(b?.medioCobroLocalId) || 0);
}

/**
 * CONDICIÓN COMERCIAL DE UNA VENTA CON VARIOS MEDIOS — LA ÚNICA MATEMÁTICA.
 *
 * La regla acordada no cambia: si la venta usa más de un medio, manda el MAYOR
 * recargo entre los usados y se aplica sobre la venta completa.
 *
 * Se mira la LISTA DE CONDICIONES, no los importes. Es deliberado: prorratear el
 * recargo por cuánto se pagó con cada medio daría un número distinto para la
 * misma venta según cómo la parta el cajero, y convertiría el recargo en algo
 * negociable en el mostrador.
 *
 * ── POR QUÉ RECIBE CONDICIONES Y NO MEDIOS ────────────────────────────────
 *
 * Un `MedioPago` ya no alcanza para identificar una condición comercial: "Crédito
 * 1 pago" al 4 % y "Crédito cuotas" al 8 % son los dos `CREDITO`. Un mapa
 * `{CREDITO: pct}` no puede tener las dos, así que el candidato pasó a ser la
 * condición resuelta completa.
 *
 * `recargoDeVenta` sigue existiendo y llama acá: hay UNA sola función que decide
 * el ganador, y el camino legacy es una conversión de entrada, no otro algoritmo.
 *
 * @param {Array<{medio:string, recargoPct:number, medioCobroLocalId?:number|null,
 *   medioNombre?:string|null, modalidadId?:number|null, modalidadNombre?:string|null}>} condiciones
 * @returns {{pct:number, medio:string|null, ganador:object|null}}
 */
export function recargoDeCondiciones(condiciones = []) {
  const candidatos = (Array.isArray(condiciones) ? condiciones : [])
    .filter((c) => {
      // Un medio sin recargo configurable (FIADO) aporta 0 y nunca gana.
      if (!c || !MEDIOS_CON_RECARGO.includes(c.medio)) return false;
      const pct = Number(c.recargoPct);
      return Number.isFinite(pct) && pct > 0;
    })
    .sort(compararCondicionesDeRecargo);

  const ganador = candidatos[0] || null;
  if (!ganador) return { pct: 0, medio: null, ganador: null };
  return { pct: Number(ganador.recargoPct), medio: ganador.medio, ganador };
}

/**
 * EL CAMINO LEGACY: una lista de tipos contables y un mapa de porcentajes.
 *
 * Se conserva la firma y la forma exacta de la respuesta —`{pct, medio}`, sin el
 * ganador— porque tiene consumidores que la comparan entera. Lo único que cambió
 * es que ya no decide: convierte y pregunta.
 *
 * @param {string[]} mediosUsados medios normalizados (enum MedioPago)
 * @param {Record<string, number>} recargosPorMedio salida de normalizarRecargos
 * @returns {{pct:number, medio:string|null}} medio = el que impuso la condición
 */
export function recargoDeVenta(mediosUsados, recargosPorMedio = {}) {
  const medios = Array.isArray(mediosUsados) ? [...new Set(mediosUsados.filter(Boolean))] : [];
  const { pct, medio } = recargoDeCondiciones(
    medios.map((m) => ({ medio: m, recargoPct: Number(recargosPorMedio?.[m]) }))
  );
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
