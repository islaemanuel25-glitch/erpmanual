// lib/caja/turnoOperativoServer.js
//
// El turno operativo contra la base: el catálogo de un local, lo que la
// apertura PROPONE y lo que la apertura ESCRIBE. Las TRES rutas de apertura
// —abrir, abrir-con-cambio y abrir-sin-cambio— pasan por
// `turnoOperativoDeApertura`, así que la regla —turno final validado, fecha
// operativa de su jornada— está una sola vez. La regla misma es pura y vive
// en `turnoOperativo.js`.

import { momentoArgentina } from "../fechas/rangoArgentina.js";
import {
  CODIGO_TURNO_OPERATIVO,
  fechaOperativaDeTurno,
  fechaOperativaParaGuardar,
  idDeTurnoOperativo,
  reconocerTurno,
  turnoValidoParaAbrir,
} from "./turnoOperativo.js";

export const SELECT_TURNO_OPERATIVO = Object.freeze({
  id: true,
  localId: true,
  nombre: true,
  orden: true,
  activo: true,
  horaInicioReconocimiento: true,
  horaFinReconocimiento: true,
});

/** El catálogo de un local, en su orden. Solo de ESE local. */
export function turnosOperativosDelLocal(db, localId, { soloActivos = false } = {}) {
  return db.turnoOperativo.findMany({
    where: { localId, ...(soloActivos ? { activo: true } : {}) },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
    select: SELECT_TURNO_OPERATIVO,
  });
}

/**
 * Lo que la pantalla de apertura necesita para ofrecer el turno: los ACTIVOS
 * del local, el reconocimiento por la hora del servidor y, para cada turno, la
 * fecha operativa que tendría la caja si se abriera ahora con él. La fecha es
 * informativa: la que se guarda la vuelve a calcular la apertura.
 *
 * @returns {Promise<{turnos:object[], reconocimiento:{estado:string, sugeridoId:number|null, candidatosIds:number[]}}>}
 */
export async function reconocimientoDeApertura(db, { localId, ahora = new Date() }) {
  const momento = momentoArgentina(ahora);
  const activos = await turnosOperativosDelLocal(db, localId, { soloActivos: true });
  return {
    turnos: activos.map((t) => ({ ...t, fechaOperativa: fechaOperativaDeTurno(t, momento) })),
    reconocimiento: reconocerTurno(activos, momento.minuto),
  };
}

/**
 * Lo que una apertura escribe en la caja: el turno FINAL que eligió quien abre
 * —validado contra el local y su estado; su ventana de reconocimiento no lo
 * limita— y la fecha operativa de la jornada de ESE turno, calculada acá. Una
 * fecha que mande el cliente se ignora: la autoridad es el servidor.
 *
 * Corre con el cliente que reciba: dentro de la transacción de la apertura si
 * la hay. El turno se vuelve a leer acá: el cliente solo manda el id.
 *
 * @param {object} db
 * @param {{localId:number, body:object, ahora?:Date}} args
 * @returns {Promise<{ok:true, datos:{turnoOperativoId:number, fechaOperativa:Date}, turno:object}
 *                  | {ok:false, status:number, codigo:string, error:string}>}
 */
export async function turnoOperativoDeApertura(db, { localId, body, ahora = new Date() }) {
  const id = idDeTurnoOperativo(body?.turnoOperativoId);
  if (id == null) {
    const hay = await db.turnoOperativo.count({ where: { localId, activo: true } });
    return hay
      ? { ok: false, status: 400, codigo: CODIGO_TURNO_OPERATIVO.REQUERIDO, error: "Elegí el turno operativo de esta caja." }
      : {
          ok: false,
          status: 409,
          codigo: CODIGO_TURNO_OPERATIVO.SIN_TURNOS,
          error:
            "Este local no tiene turnos operativos activos, y sin turno no se puede abrir caja. Quien tenga permiso de configuración del POS los da de alta en Configuración → POS → Turnos operativos.",
        };
  }

  const turno = await db.turnoOperativo.findUnique({ where: { id }, select: SELECT_TURNO_OPERATIVO });
  const valido = turnoValidoParaAbrir(turno, localId);
  if (!valido.valido) return { ok: false, status: valido.status, codigo: valido.codigo, error: valido.error };

  const fecha = fechaOperativaDeTurno(turno, momentoArgentina(ahora));
  return {
    ok: true,
    datos: { turnoOperativoId: turno.id, fechaOperativa: fechaOperativaParaGuardar(fecha) },
    turno,
  };
}
