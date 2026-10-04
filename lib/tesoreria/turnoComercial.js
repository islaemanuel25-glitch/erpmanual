// lib/tesoreria/turnoComercial.js
//
// LA FRONTERA DEL TURNO COMERCIAL. ES PROVISORIA Y ESTÁ AISLADA A PROPÓSITO.
//
// Tesorería agrupa varias cajas bajo un mismo turno comercial —"Turno mañana:
// Caja 1 + Caja 2"—. Hoy ERP Azul NO tiene la configuración de franjas por local
// (mañana, tarde, noche, horarios variables, turnos que cruzan la medianoche):
// ese trabajo está pendiente y fuera de esta tanda.
//
// Por eso todo lo que agrupa pasa por UNA sola función, `turnoComercialDe`, y
// el resto de Tesorería no sabe cómo decide. El día que exista la configuración
// real, se reemplaza esta implementación —con vigencias por local, como la
// Semana Operativa— y nada más cambia.
//
// ── LO QUE ESTA IMPLEMENTACIÓN NO HACE, Y POR QUÉ ────────────────────────
//
// · NO usa `Turno.apertura`. El `Turno` del modelo es una CAJA, no un turno
//   comercial: tomar su apertura como identidad ataría Tesorería para siempre a
//   "la caja abrió tal día = turno de tal día". Se agrupa por el instante del
//   HECHO —la venta, la entrega, el pago—, que es lo que la configuración real
//   también va a mirar.
// · NO persiste nada. La agrupación se recalcula en cada lectura; si mañana
//   cambia el criterio, la historia se reagrupa sola.
// · NO resuelve los turnos que cruzan la medianoche: con este criterio, un turno
//   de 22 a 2 queda partido en dos días. Es la limitación conocida del
//   provisorio y la razón de que exista la frontera.

import { fechaArgentinaISO } from "../fechas/rangoArgentina.js";

/** Nombre del criterio vigente. Viaja en cada grupo para que nadie lo tome por definitivo. */
export const CRITERIO_TURNO_COMERCIAL = "PROVISORIO_DIA_OPERATIVO";

/**
 * El turno comercial al que pertenece un hecho de un local.
 *
 * Provisorio: un grupo por local y día argentino del instante.
 *
 * @param {number} localId
 * @param {Date|string} instante  el instante del HECHO (venta, entrega, pago)
 * @returns {{clave:string, etiqueta:string, dia:string, criterio:string, provisorio:boolean}|null}
 */
export function turnoComercialDe(localId, instante) {
  const dia = fechaArgentinaISO(instante);
  if (dia == null || localId == null) return null;
  return {
    clave: `${localId}:${dia}`,
    etiqueta: dia,
    dia,
    criterio: CRITERIO_TURNO_COMERCIAL,
    provisorio: true,
  };
}
