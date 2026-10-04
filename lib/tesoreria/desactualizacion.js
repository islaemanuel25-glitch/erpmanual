// lib/tesoreria/desactualizacion.js
//
// ¿LA FOTO DE UNA ENTREGA VERIFICADA SIGUE REPRESENTANDO A SU MOVIMIENTO?
//
// Una verificación congela cómo era cada entrega al contarla. Si después el
// movimiento cambia —una corrección le reescribe el importe, o pierde el vínculo
// que lo hacía entrega—, la verificación NO se recalcula ni se anula sola: sigue
// diciendo qué se verificó. Lo que cambia es que la lectura lo AVISA
// (VERIFICACION_DESACTUALIZADA), y quien corresponda decide si anular y volver
// a verificar.
//
// Pura y sin dependencias de Tesorería, para que la usen la lectura y las
// acciones sin importarse entre sí.

import { aCentavos } from "../caja/efectivoEsperado.js";

/** Qué campo de la foto ya no coincide con la fuente. */
export const MOTIVO_DESACTUALIZADA = Object.freeze({
  MONTO: "MONTO",
  CLASE: "CLASE",
  TURNO: "TURNO",
  LOCAL: "LOCAL",
  OPERADOR: "OPERADOR",
  INSTANTE: "INSTANTE",
});

/**
 * Compara la foto con el movimiento de hoy. Devuelve los motivos, vacío si la
 * foto sigue siendo fiel. No toca nada.
 *
 * @param {{montoDeclarado, clase, turnoId, localId, operadorId, instante}} foto
 *   la entrega como la devuelve `formatoDeVerificacion`
 * @param {{monto, clase, turnoId, localId, operadorId, instante}} actual
 *   el movimiento HOY; `clase` es la de la clasificación canónica (puede no ser
 *   una clase de entrega si perdió el vínculo)
 */
export function motivosDeDesactualizacion(foto, actual) {
  const motivos = [];
  if (aCentavos(foto.montoDeclarado) !== aCentavos(actual.monto)) motivos.push(MOTIVO_DESACTUALIZADA.MONTO);
  if (foto.clase !== actual.clase) motivos.push(MOTIVO_DESACTUALIZADA.CLASE);
  if (foto.turnoId !== actual.turnoId) motivos.push(MOTIVO_DESACTUALIZADA.TURNO);
  if (foto.localId !== actual.localId) motivos.push(MOTIVO_DESACTUALIZADA.LOCAL);
  if ((foto.operadorId ?? null) !== (actual.operadorId ?? null)) motivos.push(MOTIVO_DESACTUALIZADA.OPERADOR);
  if (new Date(foto.instante).getTime() !== new Date(actual.instante).getTime()) motivos.push(MOTIVO_DESACTUALIZADA.INSTANTE);
  return motivos;
}
