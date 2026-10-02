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
//                     propio local. Es la misma capacidad que ya les permitía
//                     operar sin PIN; con ella pueden arquear, retirar, mover o
//                     cerrar la caja de un operador, y la autoría sigue siendo
//                     la suya en las columnas de siempre (`realizadoPorId`,
//                     `cerradoPorId`, `usuarioId`, `iniciadoPor*`).
//
// Dos modos, porque operar y mirar no piden lo mismo:
//
//   operar  → pasa por `requireOperadorSegunConfig`: donde el local exige
//             operario, sin PIN válido no hay identidad (428), igual que hoy.
//   mirar   → no exige PIN. Lo propio se mira con la identidad que haya, y lo
//             ajeno con la intervención o con `turnos.ver_todos`, que es el
//             permiso que ya gobernaba "ver el turno de otro".

import { requireOperadorSegunConfig, getOperadorActivoDelLocal, puedeOperarSinOperador } from "@/lib/operador";
import { puedeActuarSobreCaja } from "./cierreRelevo";

/**
 * La identidad con la que esta sesión OPERA una caja en `localId`.
 *
 * @returns {Promise<{ ok:true, identidad:{ usuarioId:number, operadorId:number|null, puedeIntervenir:boolean } }
 *                 | { ok:false, status:number, error:string, needsOperador:true }>}
 */
export async function identidadParaOperar(req, session, { localId }) {
  const gate = await requireOperadorSegunConfig(req, session, { localId });
  if (!gate.ok) return gate;
  return {
    ok: true,
    identidad: {
      usuarioId: session.id,
      operadorId: gate.operadorId ?? null,
      puedeIntervenir: puedeOperarSinOperador(session, { localId }),
    },
  };
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
