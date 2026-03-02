import { getUsuarioSession } from "./auth";

/**
 * Standalone: parsea session del request y valida permiso.
 * @returns {{ ok:true, session }} | {{ ok:false, status:number, error:string }}
 */
export function requirePerm(req, perm) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  if (session.esAdmin || session.permisos.includes(perm)) {
    return { ok: true, session };
  }
  return { ok: false, status: 403, error: `Sin permiso: ${perm}` };
}

/**
 * Solo requiere sesión válida (login). Sin permiso granular.
 * @returns {{ ok:true, session }} | {{ ok:false, status:number, error:string }}
 */
export function requireAuth(req) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  return { ok: true, session };
}

/**
 * Requiere sesión válida + admin (permisos incluye "*").
 * @returns {{ ok:true, session }} | {{ ok:false, status:number, error:string }}
 */
export function requireAdmin(req) {
  const session = getUsuarioSession(req);
  if (!session) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  if (!session.esAdmin) {
    return { ok: false, status: 403, error: "Requiere administrador" };
  }
  return { ok: true, session };
}

/**
 * Valida permiso contra una session ya resuelta (ej: de resolveLocalAndGrupo).
 * @returns {{ ok:true }} | {{ ok:false, status:number, error:string }}
 */
export function checkPerm(session, perm) {
  if (!session) {
    return { ok: false, status: 401, error: "No autenticado" };
  }
  if (session.esAdmin || session.permisos.includes(perm)) {
    return { ok: true };
  }
  return { ok: false, status: 403, error: `Sin permiso: ${perm}` };
}
