// lib/precios/redondeo.js
//
// EL REDONDEO COMERCIAL A 100. Una sola función, para todo el sistema.
//
// ── POR QUÉ HABÍA DOS ───────────────────────────────────────────────────────
//
// Convivían `redondear100` (acá) y `redondearA100Arriba` (en precioDesdeMargen).
// Las dos redondeaban hacia arriba y parecían la misma, pero diferían en dos
// puntos, y uno de los dos era plata:
//
//   · CON CENTAVOS. `1050 × 1,3` da `1365,0000000000002` en binario, y hay casos
//     peores: un valor ya exacto como 1400 puede llegar como 1400,0000000001 y
//     esta función lo empujaba a 1500. CIEN PESOS DE MÁS, salidos de ruido de
//     coma flotante y no de ninguna regla. `redondearA100Arriba` normalizaba a
//     centavos antes de subir, justamente para eso.
//
//   · CON VALORES ≤ 0. Esta devolvía 0; la otra devolvía el valor tal cual.
//
// El POS usaba ESTA, o sea la que se equivocaba con los centavos: el precio que
// el cliente ve impreso en el ticket salía de la versión defectuosa.
//
// ── QUÉ QUEDÓ ───────────────────────────────────────────────────────────────
//
// Una sola función, con este nombre y en este archivo —que es de donde la
// importa el POS— y con el comportamiento correcto de las dos:
//
//   · se normaliza a centavos antes de subir, así un precio exacto no salta de
//     múltiplo por ruido binario;
//   · un valor ≤ 0 o inválido devuelve 0, que es lo que esperan los mapeos de
//     stock y de búsqueda. Un precio negativo no es un precio.
//
// Por debajo del centavo no hay información, solo ruido: un precio es dinero.

/**
 * Redondeo comercial a 100, siempre hacia arriba. **Nunca `Math.round`.**
 *
 * @param {number|string} valor precio a redondear
 * @returns {number} 0 si es inválido o ≤ 0; si no, el siguiente múltiplo de 100
 */
export function redondear100(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // El paso que faltaba: sin normalizar a centavos, 1400,0000000001 → 1500.
  const centavos = Math.round(n * 100) / 100;
  return Math.ceil(centavos / 100) * 100;
}
