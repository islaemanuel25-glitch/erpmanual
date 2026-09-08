// lib/transferencias/recepcionServidor.js
//
// LO QUE TODA RUTA DE RECEPCIÓN TIENE QUE PREGUNTAR ANTES DE ESCRIBIR.
//
// Son tres preguntas y siempre las mismas: si la transferencia existe, si esta
// persona puede recibirla, y si su estado admite cambios. Hasta acá vivían
// copiadas en `guardar-recepcion` y en `confirmar-recepcion`, con diferencias
// chicas entre las dos —una devuelve 403 y la otra 400 cuando falta el local—.
// Con dos rutas nuevas encima, esas diferencias se vuelven cuatro versiones de
// la misma regla, y la que se olvide de actualizarse es la que va a dejar entrar
// a alguien.
//
// ── NADA DE ESTO SE DECIDE CON LO QUE MANDA EL CLIENTE ────────────────────
//
// El origen, el destino y el estado salen de la transferencia PERSISTIDA. El
// cliente solo aporta un id. Es la misma razón por la que `guardar-recepcion`
// dejó de leer la cantidad enviada del request: cualquier dato que el navegador
// pueda elegir y el servidor no relea es un dato que alguien va a elegir mal a
// propósito.

/** Estados en los que la recepción todavía se puede editar. */
export const ESTADOS_EDITABLES = ["Enviada", "Recibiendo"];

/** ¿Este estado admite cargar, agregar o borrar líneas de recepción? */
export function esEditableEnRecepcion(estado) {
  return ESTADOS_EDITABLES.includes(String(estado || ""));
}

/**
 * ¿ESTA PERSONA PUEDE RECIBIR ESTA TRANSFERENCIA?
 *
 * Solo el DESTINO, salvo admin. El origen no: quien manda no es quien cuenta lo
 * que llegó, y dejarlo tocar la recepción sería dejarlo cerrar su propia
 * diferencia.
 *
 * @returns {{ok:true} | {ok:false, status:number, error:string}}
 */
export function puedeRecibir(session, transferencia) {
  if (session?.esAdmin) return { ok: true };

  const localId = Number(session?.localId || 0);
  if (!localId) {
    return { ok: false, status: 400, error: "Usuario sin local asignado" };
  }
  if (localId !== Number(transferencia?.destinoId)) {
    return { ok: false, status: 403, error: "No podés recibir esta transferencia" };
  }
  return { ok: true };
}

/**
 * ¿EL ESTADO ADMITE ESCRIBIR?
 *
 * "Recibida" se contesta aparte porque es el caso que la gente vive: se confirmó
 * y alguien vuelve a la pantalla vieja. Merece un mensaje que diga qué pasó, no
 * uno genérico con el nombre del estado adentro.
 *
 * @returns {{ok:true} | {ok:false, status:number, error:string}}
 */
export function estadoAdmiteRecepcion(estado, { accion = "guardar cambios" } = {}) {
  if (String(estado) === "Recibida") {
    return {
      ok: false,
      status: 400,
      error: `Esta transferencia ya fue confirmada. No se pueden ${accion}.`,
    };
  }
  if (!esEditableEnRecepcion(estado)) {
    return {
      ok: false,
      status: 400,
      error: `No se puede editar una transferencia en estado "${estado}"`,
    };
  }
  return { ok: true };
}
