// lib/caja/identidadCajaServer.js
//
// QUIÉN ES LA CAJA, RESUELTO DEL LADO DEL SERVIDOR.
//
// La regla vive en `lib/caja/cierreRelevo.js` (`whereCajaPropia`,
// `esCajaPropia`, `whereCajaAccesible`, `puedeActuarSobreCaja`) y es pura. Acá
// solo se arma la IDENTIDAD con lo que ya existía, sin un mecanismo nuevo:
//
//   cuenta          → la sesión (`erpazul_sesion`).
//   operador        → la cookie del PIN, validada contra el local de la
//                     operación por `getOperadorActivoDelLocal`. NUNCA un
//                     `operadorId` que mande el cliente en el cuerpo.
//   intervención    → `puedeOperarSinOperador`: Admin, o DUEÑO_LOCAL en su
//                     propio local. Sirve para MIRAR cajas ajenas y para FORZAR
//                     un cierre (`cierres/iniciar` con `forzado`). Ya no sirve
//                     para OPERAR la caja de otro: ni arquear, ni retirar, ni
//                     mover, ni cerrar sin forzar.
//
// Dos modos, porque operar y mirar no piden lo mismo:
//
//   operar  → pasa por `requireOperadorDeCaja`: el operador del PIN o, sin
//             PIN, la cuenta del dueño o Admin como su operador. Cualquier
//             otra cuenta sin PIN no tiene identidad (428), en cualquier
//             local. Y nunca interviene: se opera la caja propia y ninguna
//             otra.
//   mirar   → no exige PIN. Lo propio se mira con la identidad que haya, y lo
//             ajeno con la intervención o con `turnos.ver_todos`, que es el
//             permiso que ya gobernaba "ver el turno de otro".

import { requireOperadorDeCaja, getOperadorActivoDelLocal, puedeOperarSinOperador } from "@/lib/operador";
import { puedeActuarSobreCaja } from "./cierreRelevo";

/**
 * La identidad con la que esta sesión OPERA una caja en `localId`.
 *
 * @returns {Promise<{ ok:true, identidad:{ usuarioId:number, operadorId:number|null, puedeIntervenir:boolean } }
 *                 | { ok:false, status:number, error:string, needsOperador:true }>}
 */
export async function identidadParaOperar(req, session, { localId }) {
  const gate = await requireOperadorDeCaja(req, session, { localId });
  if (!gate.ok) return gate;
  return {
    ok: true,
    identidad: {
      usuarioId: session.id,
      operadorId: gate.operadorId,
      // Sin PIN, el dueño o el Admin: su cuenta hace de operador y su caja es
      // la de su cuenta (`Turno.operaLaCuenta`), no una de cuenta vieja.
      cuentaOpera: gate.cuentaOpera,
      // Operar es siempre sobre la caja propia. La caja de otro solo se cierra
      // FORZANDO, o se le hace un retiro intervenido: ninguno pasa por acá.
      puedeIntervenir: false,
    },
  };
}

/**
 * Una caja de cuenta VIEJA de esta cuenta, todavía operativa: sin operador y
 * sin la marca `operaLaCuenta`, abierta antes de que toda caja tuviera dueño.
 *
 * No es de nadie que opere hoy —solo se cierra forzando— pero ocupa el lugar
 * de la cuenta en el índice único de cajas sin operador. Si el dueño o el
 * Admin quieren abrir la suya sin PIN, se les dice cuál es y qué hacer, en vez
 * del "ya tenés un turno abierto" del choque con el índice.
 */
export const ERROR_CAJA_DE_CUENTA_VIEJA = (turnoId) =>
  `Esta cuenta tiene abierta la caja #${turnoId}, de antes de que toda caja tuviera operador. ` +
  "Cerrala forzando desde Cierres pendientes, o identificate con tu PIN para abrir la tuya.";

export async function cajaDeCuentaViejaAbierta(tx, { localId, usuarioId }) {
  return tx.turno.findFirst({
    where: {
      localId,
      vendedorId: usuarioId,
      operadorId: null,
      // `NOT { operaLaCuenta: true }` dejaría afuera los NULL, que son
      // justamente las viejas: en SQL, NOT (NULL = true) no es verdadero.
      OR: [{ operaLaCuenta: null }, { operaLaCuenta: false }],
      cierre: null,
      cierreEnPreparacionEn: null,
      anuladoEn: null,
    },
    select: { id: true },
  });
}

/**
 * La identidad con la que esta sesión MIRA una caja en `localId`. No falla:
 * sin PIN válido, el operador es null y lo propio es lo de la cuenta.
 */
export async function identidadParaMirar(req, session, { localId }) {
  const op = await getOperadorActivoDelLocal(req, localId);
  const permisos = Array.isArray(session?.permisos) ? session.permisos : [];
  return {
    usuarioId: session.id,
    operadorId: op?.operadorId ?? null,
    puedeIntervenir: puedeOperarSinOperador(session, { localId }),
    puedeVerAjenas: session?.esAdmin === true || permisos.includes("turnos.ver_todos"),
  };
}

/** ¿Esta identidad puede MIRAR la caja de este turno? */
export function puedeVerCaja(turno, identidad) {
  if (!turno || !identidad) return false;
  if (identidad.puedeVerAjenas === true) return true;
  return puedeActuarSobreCaja(turno, identidad);
}
