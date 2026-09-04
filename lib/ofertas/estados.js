// lib/ofertas/estados.js
//
// ESTADO DE UNA OFERTA — DERIVADO, NO GUARDADO.
//
// El estado funcional que ve la gente (BORRADOR, PROGRAMADA, ACTIVA, REVISAR,
// VENCIDA, FINALIZADA) NO existe como columna. Se calcula acá a partir de
// hechos que sí están guardados y que no se pueden derivar unos de otros:
//
//   publicadaEn    null  → nunca salió del borrador
//   finalizadaEn   fecha → alguien la dio por terminada (con autor y momento)
//   inicioEn/finEn       → la ventana de vigencia que se configuró
//   la línea marcada     → OfertaLinea.revisionPendienteDesde
//
// POR QUÉ NO ES UNA COLUMNA. Es la misma razón por la que `Venta` no tiene un
// booleano `anulada` al lado de `anuladaEn`, escrita en el schema: dos fuentes
// —un estado guardado y las fechas que lo determinan— pueden discrepar, y el día
// que discrepan no hay forma de saber cuál manda. Con el estado derivado, la
// pregunta "¿esta oferta está activa?" tiene una sola respuesta posible, y
// además NO hace falta un proceso que despierte a medianoche a pasar ofertas de
// PROGRAMADA a ACTIVA: una oferta que empieza a las 8 está activa a las 8 porque
// la comparación da eso, no porque alguien la haya actualizado.
//
// VENCIDA no estaba en la lista original de estados y se agregó porque hacía
// falta: sin ella, una oferta cuya fecha final ya pasó y que nadie finalizó se
// vería como ACTIVA —mintiendo, porque ya no se aplica— o desaparecería de la
// vista. Es justo el estado donde la persona tiene que decidir entre renovar,
// modificar o finalizar.

/** Estados funcionales de una oferta. Derivados: ninguno se guarda. */
export const ESTADO_OFERTA = {
  BORRADOR: "BORRADOR",
  PROGRAMADA: "PROGRAMADA",
  ACTIVA: "ACTIVA",
  REVISAR: "REVISAR",
  VENCIDA: "VENCIDA",
  FINALIZADA: "FINALIZADA",
};

/**
 * Estados que pertenecen al trabajo de todos los días. La pantalla principal
 * muestra estos y nada más.
 */
export const ESTADOS_OPERATIVOS = [
  ESTADO_OFERTA.BORRADOR,
  ESTADO_OFERTA.PROGRAMADA,
  ESTADO_OFERTA.ACTIVA,
  ESTADO_OFERTA.REVISAR,
  ESTADO_OFERTA.VENCIDA,
];

/** Estados archivados: fuera de la vista operativa, accesibles aparte. */
export const ESTADOS_ARCHIVADOS = [ESTADO_OFERTA.FINALIZADA];

function aFecha(valor) {
  if (valor == null) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * ¿Alguna línea de la oferta quedó marcada para revisar?
 * Acepta la oferta con sus líneas cargadas o un flag ya calculado por SQL
 * (`tieneRevisionPendiente`), para no obligar a traer todas las líneas.
 */
export function tieneRevisionPendiente(oferta) {
  if (typeof oferta?.tieneRevisionPendiente === "boolean") {
    return oferta.tieneRevisionPendiente;
  }
  const lineas = Array.isArray(oferta?.lineas) ? oferta.lineas : [];
  return lineas.some((l) => aFecha(l?.revisionPendienteDesde) != null);
}

/**
 * Estado funcional de una oferta en un instante dado.
 *
 * El orden de las preguntas ES la regla, y por eso está escrito de arriba abajo
 * en vez de con condiciones sueltas:
 *
 *   1. FINALIZADA  — una decisión humana gana sobre cualquier fecha.
 *   2. BORRADOR    — sin publicar no rige, aunque sus fechas ya hayan pasado.
 *   3. VENCIDA     — pasó el final y nadie la finalizó: hay que decidir.
 *   4. PROGRAMADA  — todavía no empezó.
 *   5. REVISAR     — está rigiendo, PERO cambió un costo y nadie lo miró.
 *   6. ACTIVA      — está rigiendo y nadie tiene nada que mirar.
 *
 * REVISAR va ANTES que ACTIVA a propósito: la oferta marcada sigue aplicándose
 * (eso lo decide `ofertaVigente`, no esto), así que si ACTIVA se preguntara
 * primero, REVISAR sería inalcanzable y el aviso no aparecería nunca.
 *
 * @param {{publicadaEn?, finalizadaEn?, inicioEn, finEn, lineas?, tieneRevisionPendiente?}} oferta
 * @param {Date|string|number} [ahora]
 * @returns {string} uno de ESTADO_OFERTA
 */
export function estadoOferta(oferta, ahora = new Date()) {
  if (!oferta) return ESTADO_OFERTA.BORRADOR;

  const ahoraD = aFecha(ahora) ?? new Date();
  const inicio = aFecha(oferta.inicioEn);
  const fin = aFecha(oferta.finEn);

  if (aFecha(oferta.finalizadaEn) != null) return ESTADO_OFERTA.FINALIZADA;
  if (aFecha(oferta.publicadaEn) == null) return ESTADO_OFERTA.BORRADOR;

  // Una oferta publicada sin ventana es un dato roto. Se la trata como vencida
  // (no rige) en vez de como activa: fallar hacia "no cobra distinto".
  if (!inicio || !fin) return ESTADO_OFERTA.VENCIDA;

  if (ahoraD.getTime() >= fin.getTime()) return ESTADO_OFERTA.VENCIDA;
  if (ahoraD.getTime() < inicio.getTime()) return ESTADO_OFERTA.PROGRAMADA;

  if (tieneRevisionPendiente(oferta)) return ESTADO_OFERTA.REVISAR;
  return ESTADO_OFERTA.ACTIVA;
}

/** ¿El estado corresponde al trabajo diario (vs. archivo)? */
export function esEstadoOperativo(estado) {
  return ESTADOS_OPERATIVOS.includes(estado);
}

/**
 * ¿Faltan `horas` o menos para que la oferta termine? Solo tiene sentido para
 * una oferta que está rigiendo o por regir; una finalizada o ya vencida no
 * "está por vencer".
 */
export function estaPorVencer(oferta, { horas = 24, ahora = new Date() } = {}) {
  const estado = estadoOferta(oferta, ahora);
  if (estado !== ESTADO_OFERTA.ACTIVA && estado !== ESTADO_OFERTA.REVISAR) return false;
  const fin = aFecha(oferta?.finEn);
  const ahoraD = aFecha(ahora) ?? new Date();
  if (!fin) return false;
  const faltanMs = fin.getTime() - ahoraD.getTime();
  return faltanMs > 0 && faltanMs <= horas * 60 * 60 * 1000;
}
