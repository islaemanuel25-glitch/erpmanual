// lib/conversiones/stock.js
// Helpers para conversión entre bultos+sueltas y unidades

/**
 * Convierte cantidad en bultos+sueltas a unidades totales
 * @param {Object} params
 * @param {number} params.cantidad - Cantidad (puede ser bultos o unidades según unidad)
 * @param {string} params.unidad - "BULTO" | "UNIDAD"
 * @param {number} params.factorPack - Factor del pack (ej: 12 para cajón x12)
 * @returns {number} Total en unidades
 */
export function toUnidades({ cantidad, unidad, factorPack = 1 }) {
  if (!cantidad || cantidad <= 0) return 0;
  
  if (unidad === "BULTO" && factorPack > 1) {
    return cantidad * factorPack;
  }
  
  // UNIDAD o factorPack <= 1
  return cantidad;
}

/**
 * Convierte unidades totales a bultos + sueltas
 * @param {Object} params
 * @param {number} params.unidades - Total en unidades
 * @param {number} params.factorPack - Factor del pack (ej: 12)
 * @returns {Object} { bultos: number, sueltas: number, totalUnidades: number }
 */
export function fromUnidades({ unidades, factorPack = 1 }) {
  const total = Number(unidades || 0);
  
  if (factorPack <= 1) {
    return {
      bultos: 0,
      sueltas: total,
      totalUnidades: total,
    };
  }
  
  const bultos = Math.floor(total / factorPack);
  const sueltas = total % factorPack;
  
  return {
    bultos,
    sueltas,
    totalUnidades: total,
  };
}

/**
 * Valida si se puede enviar con la unidad elegida según modo_envio
 * @param {Object} params
 * @param {string} params.modoEnvio - "SOLO_BULTO" | "MIXTO" | "SOLO_UNIDAD"
 * @param {string} params.unidadElegida - "BULTO" | "UNIDAD"
 * @returns {Object} { ok: boolean, error?: string }
 */
export function validarEnvio({ modoEnvio, unidadElegida }) {
  if (!modoEnvio || modoEnvio === "MIXTO") {
    return { ok: true };
  }
  
  if (modoEnvio === "SOLO_BULTO" && unidadElegida !== "BULTO") {
    return {
      ok: false,
      error: "Este producto solo se puede enviar por bulto",
    };
  }
  
  if (modoEnvio === "SOLO_UNIDAD" && unidadElegida !== "UNIDAD") {
    return {
      ok: false,
      error: "Este producto solo se puede enviar por unidad",
    };
  }
  
  return { ok: true };
}

/**
 * Calcula el default de modo_envio según unidad_medida
 * @param {string} unidadMedida - "unidad" | "pack" | "cajon" | "kg"
 * @returns {string} "SOLO_BULTO" | "MIXTO" | "SOLO_UNIDAD"
 */
export function defaultModoEnvio(unidadMedida) {
  if (unidadMedida === "cajon") {
    return "SOLO_BULTO";
  }
  // Para pack, unidad, kg: default MIXTO
  return "MIXTO";
}


