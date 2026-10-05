// lib/tesoreria/turnoComercial.js
//
// A QUÉ GRUPO DE TESORERÍA PERTENECE UN HECHO. Toda la agrupación pasa por acá.
//
// LA OPERACIÓN REAL ES POR TURNO OPERATIVO: un turno del local → sus
// cajas → sus entregas → se cuenta → se verifica ESE turno. El grupo es
//
//     LOCAL + FECHA OPERATIVA DE LA CAJA + TURNO OPERATIVO DE LA CAJA
//
// y los dos datos de la caja los fijó su apertura —migración
// 20261004200000_turno_operativo—. Un hecho de una caja —venta, entrega, pago
// desde caja— hereda el grupo DE SU CAJA, no el de su hora: una caja que cruza
// la medianoche no se parte. Acá no se mira la hora ni se recalcula la fecha:
// la fecha operativa de la jornada la decidió la apertura con el turno final.
//
// LAS CAJAS ANTERIORES NO TIENEN TURNO, y no se les inventa uno: van a un grupo
// "Sin turno asignado" por día del hecho —el criterio que tenían antes—, aparte
// de los turnos. Nunca se mezclan con un turno.
//
// Lo que no es de ninguna caja —un pago a proveedor por transferencia, un
// gasto, una venta sin caja— no es de ningún turno: va al resumen del período y
// a ningún grupo.
//
// La ESTRUCTURA de las diferencias no cambia: agrupar cajas bajo un turno sirve
// para recibir y verificar su efectivo, no convierte sus diferencias en una
// neta. Cada caja conserva la suya.

import { fechaArgentinaISO } from "../fechas/rangoArgentina.js";
import { ROTULO_SIN_TURNO, fechaOperativaISO } from "../caja/turnoOperativo.js";

/** El grupo es un turno operativo de una fecha operativa. */
export const CRITERIO_TURNO_OPERATIVO = "TURNO_OPERATIVO";
/** Cajas sin turno —anteriores al turno operativo—: un grupo aparte por día. */
export const CRITERIO_SIN_TURNO = "SIN_TURNO_ASIGNADO";

export { ROTULO_SIN_TURNO };

/**
 * El grupo de un hecho de un local.
 *
 * @param {number} localId
 * @param {{caja?:object|null, instante?:Date|string}} hecho
 *   `caja`: la de su caja, con `turnoOperativoId`, `fechaOperativa`,
 *   `turnoOperativoNombre` y `turnoOperativoOrden`; null si no es de una caja.
 * @returns {object|null} null si el hecho no es de ningún turno
 */
export function grupoDeTesoreria(localId, { caja = null, instante = null } = {}) {
  if (localId == null || !caja) return null;
  const fecha = fechaOperativaISO(caja.fechaOperativa);
  if (caja.turnoOperativoId != null && fecha) {
    return {
      clave: `${localId}:${fecha}:t${caja.turnoOperativoId}`,
      etiqueta: caja.turnoOperativoNombre || `Turno #${caja.turnoOperativoId}`,
      dia: fecha,
      orden: Number.isFinite(caja.turnoOperativoOrden) ? caja.turnoOperativoOrden : 0,
      criterio: CRITERIO_TURNO_OPERATIVO,
      turnoOperativoId: caja.turnoOperativoId,
      fechaOperativa: fecha,
      sinTurno: false,
    };
  }
  const dia = fechaArgentinaISO(instante);
  if (dia == null) return null;
  return {
    clave: `${localId}:${dia}:sin-turno`,
    etiqueta: ROTULO_SIN_TURNO,
    dia,
    orden: Number.MAX_SAFE_INTEGER,
    criterio: CRITERIO_SIN_TURNO,
    turnoOperativoId: null,
    fechaOperativa: null,
    sinTurno: true,
  };
}

/** Orden de los grupos: por día, y dentro del día por el orden del catálogo; "Sin turno" al final del día. */
export function compararGrupos(a, b) {
  if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
  if (a.sinTurno !== b.sinTurno) return a.sinTurno ? 1 : -1;
  if (a.orden !== b.orden) return a.orden - b.orden;
  return String(a.etiqueta).localeCompare(String(b.etiqueta), "es");
}
