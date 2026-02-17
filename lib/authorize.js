import { getUsuarioSession } from "@/lib/auth";

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
