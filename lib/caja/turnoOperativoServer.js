// lib/caja/turnoOperativoServer.js
//
// El turno operativo contra la base: el catálogo de un local, lo que la
// apertura OFRECE y lo que la apertura ESCRIBE. Las TRES rutas de apertura
// —abrir, abrir-con-cambio y abrir-sin-cambio— pasan por
// `turnoOperativoDeApertura`, así que la regla —turno final validado contra el
// ciclo del local, fecha de su ocurrencia— está una sola vez. La regla misma es
// pura y vive en `turnoOperativo.js` (`cicloDeTurnos`).

import { momentoArgentina } from "../fechas/rangoArgentina.js";
import {
  CODIGO_TURNO_OPERATIVO,
  cicloDeTurnos,
  fechaOperativaParaGuardar,
  idDeTurnoOperativo,
  ocurrenciaDeApertura,
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

// ── LA TRANSICIÓN, POR LOCAL ────────────────────────────────────────────────
//
// Un local que NUNCA tuvo turnos operativos sigue en modo legado: sus cajas
// nuevas abren sin turno (turnoOperativoId y fechaOperativa en NULL), como las
// de antes del despliegue, y se ven como "Sin turno asignado". Desplegar no
// corta ninguna apertura.
//
// En cuanto el local da de alta su primer turno, entró al sistema nuevo y no
// vuelve: toda caja nueva exige turno. "Entró" se mide por las FILAS del
// catálogo, no por las activas, y es fiable porque un turno no se borra —no hay
// DELETE; se desactiva— y nace activo. Por eso desactivar todos los turnos NO
// devuelve el local al legado: deja sus aperturas trabadas hasta que active uno.

const SIN_TURNO = Object.freeze({ turnoOperativoId: null, fechaOperativa: null });

/** Los turnos activos del local y si todavía está en modo legado. */
async function modoDelLocal(db, localId) {
  const [activos, filas] = await Promise.all([
    turnosOperativosDelLocal(db, localId, { soloActivos: true }),
    db.turnoOperativo.count({ where: { localId } }),
  ]);
  return { activos, legado: filas === 0 };
}

const sinActivos = () => ({
  codigo: CODIGO_TURNO_OPERATIVO.SIN_TURNOS,
  error:
    "Este local ya usa turnos operativos y no tiene ninguno activo: desde que los usa, toda caja nueva necesita uno. Quien tenga permiso de configuración del POS activa o carga uno en Configuración → POS → Turnos operativos.",
});

/**
 * Lo que la pantalla de apertura necesita: si el local está en modo legado
 * (`legado`); si no, SOLO los turnos que se pueden abrir a esta hora según el
 * ciclo del local —la ocurrencia actual y la siguiente—, cada uno con la fecha
 * operativa de su ocurrencia; el que propone la ventana; y, si no tiene ningún
 * turno activo, por qué (`bloqueo`). La fecha es informativa: la que se guarda la vuelve a
 * calcular la apertura.
 *
 * @returns {Promise<{legado:boolean, turnos:object[], reconocimiento:object|null, bloqueo:object|null}>}
 */
export async function reconocimientoDeApertura(db, { localId, ahora = new Date() }) {
  const { activos, legado } = await modoDelLocal(db, localId);
  if (legado) return { legado: true, turnos: [], reconocimiento: null, bloqueo: null };
  if (!activos.length) return { legado: false, turnos: [], reconocimiento: null, bloqueo: sinActivos() };
  const { opciones, reconocimiento } = cicloDeTurnos(activos, momentoArgentina(ahora));
  return { legado: false, turnos: opciones, reconocimiento, bloqueo: null };
}

/**
 * Lo que una apertura escribe en la caja: el turno FINAL que eligió quien abre
 * —del local, activo y POSIBLE a esta hora en el ciclo del local— y la fecha
 * operativa de la ocurrencia de ESE turno, calculada acá. Una fecha que mande
 * el cliente se ignora, y un turno que la pantalla no debió ofrecer se
 * rechaza: la autoridad es el servidor. En un local en modo legado, y sin
 * turno pedido, la caja abre sin turno.
 *
 * Corre con el cliente que reciba: dentro de la transacción de la apertura si
 * la hay. El turno se vuelve a leer acá: el cliente solo manda el id.
 *
 * @param {object} db
 * @param {{localId:number, body:object, ahora?:Date}} args
 * @returns {Promise<{ok:true, datos:{turnoOperativoId:number|null, fechaOperativa:Date|null}, turno:object|null, legado:boolean}
 *                  | {ok:false, status:number, codigo:string, error:string}>}
 */
export async function turnoOperativoDeApertura(db, { localId, body, ahora = new Date() }) {
  const id = idDeTurnoOperativo(body?.turnoOperativoId);
  // El ciclo se arma con todos los activos del local, leídos ahora.
  const { activos, legado } = await modoDelLocal(db, localId);
  if (id == null) {
    if (legado) return { ok: true, datos: SIN_TURNO, turno: null, legado: true };
    return activos.length
      ? { ok: false, status: 400, codigo: CODIGO_TURNO_OPERATIVO.REQUERIDO, error: "Elegí el turno operativo de esta caja." }
      : { ok: false, status: 409, ...sinActivos() };
  }

  const turno = await db.turnoOperativo.findUnique({ where: { id }, select: SELECT_TURNO_OPERATIVO });
  const valido = turnoValidoParaAbrir(turno, localId);
  if (!valido.valido) return { ok: false, status: valido.status, codigo: valido.codigo, error: valido.error };

  const ocurrencia = ocurrenciaDeApertura(activos, turno.id, momentoArgentina(ahora));
  if (!ocurrencia.valido) return { ok: false, status: ocurrencia.status, codigo: ocurrencia.codigo, error: ocurrencia.error };
  return {
    ok: true,
    datos: { turnoOperativoId: turno.id, fechaOperativa: fechaOperativaParaGuardar(ocurrencia.fechaOperativa) },
    turno,
    legado: false,
  };
}
