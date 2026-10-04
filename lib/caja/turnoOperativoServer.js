// lib/caja/turnoOperativoServer.js
//
// El turno operativo contra la base: el catálogo de un local y la validación de
// la apertura. Las TRES rutas de apertura —abrir, abrir-con-cambio y
// abrir-sin-cambio— pasan por `turnoOperativoDeApertura`, así que la regla está
// una sola vez.

import { hoyArgentinaISO } from "../fechas/rangoArgentina.js";
import {
  CODIGO_TURNO_OPERATIVO,
  fechaOperativaDeApertura,
  fechaOperativaParaGuardar,
  idDeTurnoOperativo,
  turnoValidoParaAbrir,
} from "./turnoOperativo.js";

export const SELECT_TURNO_OPERATIVO = Object.freeze({ id: true, localId: true, nombre: true, orden: true, activo: true });

/** El catálogo de un local, en su orden. Solo de ESE local. */
export function turnosOperativosDelLocal(db, localId, { soloActivos = false } = {}) {
  return db.turnoOperativo.findMany({
    where: { localId, ...(soloActivos ? { activo: true } : {}) },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
    select: SELECT_TURNO_OPERATIVO,
  });
}

/**
 * Lo que una apertura escribe en la caja: el turno elegido —validado contra el
 * local y su estado— y la fecha operativa, que fija el servidor.
 *
 * Corre con el cliente que reciba: dentro de la transacción de la apertura si
 * la hay. El turno se vuelve a leer acá: el cliente solo manda el id.
 *
 * @param {object} db
 * @param {{localId:number, body:object, hoy?:string}} args
 * @returns {Promise<{ok:true, datos:{turnoOperativoId:number, fechaOperativa:Date}, turno:object}
 *                  | {ok:false, status:number, codigo:string, error:string}>}
 */
export async function turnoOperativoDeApertura(db, { localId, body, hoy = hoyArgentinaISO() }) {
  const id = idDeTurnoOperativo(body?.turnoOperativoId);
  if (id == null) {
    const hay = await db.turnoOperativo.count({ where: { localId, activo: true } });
    return hay
      ? { ok: false, status: 400, codigo: CODIGO_TURNO_OPERATIVO.REQUERIDO, error: "Elegí el turno operativo de esta caja (Mañana, Tarde…)." }
      : {
          ok: false,
          status: 409,
          codigo: CODIGO_TURNO_OPERATIVO.SIN_TURNOS,
          error:
            "Este local no tiene turnos operativos activos, y sin turno no se puede abrir caja. Quien tenga permiso de configuración del POS los da de alta en Configuración → POS → Turnos operativos.",
        };
  }

  const fecha = fechaOperativaDeApertura(body?.fechaOperativa, hoy);
  if (!fecha.valida) return { ok: false, status: fecha.status, codigo: fecha.codigo, error: fecha.error };

  const turno = await db.turnoOperativo.findUnique({ where: { id }, select: SELECT_TURNO_OPERATIVO });
  const valido = turnoValidoParaAbrir(turno, localId);
  if (!valido.valido) return { ok: false, status: valido.status, codigo: valido.codigo, error: valido.error };

  return {
    ok: true,
    datos: { turnoOperativoId: turno.id, fechaOperativa: fechaOperativaParaGuardar(fecha.fecha) },
    turno,
  };
}
