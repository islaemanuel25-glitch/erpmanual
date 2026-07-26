// lib/operador-exencion.js
//
// Helper PURO y client-safe (sin imports de servidor) para decidir, en el
// FRONTEND, si un perfil está exento del flujo de operario (modal de PIN,
// redirect a /bloqueo-operador, estado "Sin operador").
//
// Debe mantenerse alineado con la regla del backend
// (lib/operador.js → puedeOperarSinOperador):
//   - Admin (permiso "*")           → exento.
//   - DUEÑO_LOCAL (rol de sistema)  → exento en SU local. El frontend siempre
//       opera en el local de la sesión del usuario (perfil.localId), así que el
//       flag esDuenoLocal alcanza; el scope real se revalida en el backend.
//   - CAJERO / ENCARGADO            → NO exentos (siguen el flujo normal)…
//       …SALVO que el LOCAL haya desactivado el operario obligatorio
//       (perfil.exigirOperador === false, ver ConfiguracionLocal). En ese caso
//       nadie del local necesita el flujo de PIN. El backend revalida por local
//       (lib/operador.js → requireOperadorSegunConfig).
//
// NO usa modulos.acceso_sin_operador: ese permiso quedó LEGACY/INCONSISTENTE
// (el backend nunca lo honró — solo "*"), así que dejó de participar del bypass.
//
// Import RELATIVO (no alias @/) a propósito: este módulo es puro/client-safe y se
// corre bajo `node --test`, donde el alias @/ no resuelve. acceso.js también es puro.
import { operarioObligatorio } from "./config/acceso.js";

export function perfilExentoDeOperador(perfil) {
  if (!perfil) return false;
  if (perfil.esAdmin === true) return true;
  if (perfil.esDuenoLocal === true) return true;
  // El local desactivó el operario obligatorio → exento en la UI. Misma semántica
  // canónica que el backend (null=obligatorio, solo false libera).
  if (!operarioObligatorio(perfil.exigirOperador)) return true;
  return false;
}

/**
 * Regla CENTRAL del backend: ¿este usuario puede operar SIN operario activo en
 * esta operación? Pura (sin imports de servidor) para poder testearla y para que
 * lib/operador.js la reutilice sin duplicar la lógica.
 *
 * Devuelve true SOLO cuando:
 *  - session.esAdmin === true (exención histórica del dueño global "*"); o
 *  - session.esDuenoLocal === true (rol de sistema DUEÑO_LOCAL, snapshot del login)
 *    Y session.localId es un entero > 0
 *    Y localId (el local YA autorizado por el scope de la operación) es entero > 0
 *    Y Number(session.localId) === Number(localId).
 *
 * Para DUEÑO_LOCAL sin localId de sesión, con local ajeno o con contexto
 * incompleto → false (cae al flujo normal: exige operario / el scope ya cortó
 * con 403 antes). NO usa modulos.acceso_sin_operador.
 *
 * @param {{ esAdmin?: boolean, esDuenoLocal?: boolean, localId?: number|null }} session
 * @param {{ localId?: number|null }} ctx - local YA resuelto/autorizado por el endpoint
 * @returns {boolean}
 */
export function puedeOperarSinOperador(session, { localId } = {}) {
  if (!session) return false;
  if (session.esAdmin === true) return true;
  if (session.esDuenoLocal === true) {
    const propio = Number(session.localId);
    const objetivo = Number(localId);
    if (!Number.isInteger(propio) || propio <= 0) return false; // sin local asignado
    if (!Number.isInteger(objetivo) || objetivo <= 0) return false; // sin local de operación
    return propio === objetivo; // solo su propio local
  }
  return false;
}
