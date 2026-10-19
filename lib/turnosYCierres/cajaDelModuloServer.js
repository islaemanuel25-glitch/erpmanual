// lib/turnosYCierres/cajaDelModuloServer.js
//
// ¿PUEDE ESTA SESIÓN VER ESTA CAJA EN TURNOS Y CIERRES? Una sola respuesta para
// las rutas que miran una caja: su detalle y Z (`/api/turnos-y-cierres/cajas/:id`)
// y sus ventas (`…/cajas/:id/ventas`).
//
// Vivía escrito adentro de la ruta del detalle. Cuando apareció la segunda ruta
// se sacó acá, tal cual, en vez de copiarlo: dos copias del alcance no se rompen
// el día que se escriben, se rompen el día que alguien cambia una.
//
// El alcance es el de la lista (`alcanceDeCajas`): una caja de otro local no
// existe para esta sesión (404) aunque se mande su id a mano, y la de otro
// operador, para un cajero, tampoco se muestra (403).

import { getUsuarioSession } from "../auth.js";
import { checkPerm } from "../authorize.js";
import { resolveVistaOperativa } from "../grupos.js";
import { puedeOperarSinOperador } from "../operador.js";
import { identidadParaMirar } from "../caja/identidadCajaServer.js";
import { PERMISO_CAJERO, PERMISOS_VER_TODO, alcanceDeCajas, puedeVerCajaDelModulo } from "./alcance.js";
import { leerDetalleDeCaja } from "./lecturaTurnosYCierresServer.js";

/**
 * Resuelve la caja con su detalle, o el motivo por el que no se la puede ver.
 *
 * @returns {Promise<{ok:true, leida:object, localId:number, session:object}
 *   | {ok:false, status:number, error:string, needsContexto?:boolean}>}
 */
export async function cajaDelModulo(req, db, idCrudo) {
  const session = getUsuarioSession(req);
  if (!session) return { ok: false, status: 401, error: "No autenticado" };

  const perm = checkPerm(session, [PERMISO_CAJERO, ...PERMISOS_VER_TODO]);
  if (!perm.ok) return { ok: false, status: perm.status, error: perm.error };

  const cajaId = Number(idCrudo);
  if (!Number.isInteger(cajaId) || cajaId <= 0) return { ok: false, status: 400, error: "Número de caja inválido." };

  const vista = await resolveVistaOperativa(req);
  if (vista.error) return { ok: false, status: vista.status, error: vista.error, needsContexto: vista.needsContexto };
  if (!vista.localId) return { ok: false, status: 409, error: "Elegí un local para ver sus cajas.", needsContexto: true };
  const localId = vista.localId;

  const alcance = alcanceDeCajas(session, { esDueno: puedeOperarSinOperador(session, { localId }) });
  if (!alcance) return { ok: false, status: 403, error: "Sin permiso para ver cajas." };

  const leida = await leerDetalleDeCaja(db, cajaId);
  if (!leida || leida.caja.localId !== localId) {
    return { ok: false, status: 404, error: `No existe la caja #${cajaId} en este local.` };
  }
  const identidad = await identidadParaMirar(req, session, { localId });
  if (!puedeVerCajaDelModulo(leida.caja, { localId, alcance, identidad })) {
    return { ok: false, status: 403, error: "Esa caja es de otro operador." };
  }
  return { ok: true, leida, localId, session };
}
