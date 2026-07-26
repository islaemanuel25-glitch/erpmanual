import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";
import { whereNotifUsuario } from "@/lib/notificaciones/whereNotif";

// Re-export: la regla de filtrado vive en el módulo puro whereNotif.js (testeable).
export { whereNotifUsuario };

// Resuelve el scope de notificaciones del usuario autenticado, INCLUYENDO la
// ubicación activa (local/depósito) y sus permisos. Usa la misma resolución de
// contexto que el resto del sistema (resolveLocalAndGrupo): no-admin acotado a su
// local; admin acotado a su contexto activo. Si no hay contexto → grupoId/localId
// null (fail-closed: la campanita no muestra notificaciones de ninguna ubicación).
export async function resolverScopeNotif(req) {
  const session = getUsuarioSession(req);
  if (!session) return { error: "No autenticado", status: 401 };

  const ctx = await resolveLocalAndGrupo(req);
  const ok = ctx && !ctx.error;
  const grupoId = ok ? ctx.grupoId : null;
  const localId = ok ? ctx.localId : null;
  const permisos = Array.isArray(session.permisos) ? session.permisos : [];

  return {
    grupoId: grupoId || null,
    localId: localId || null,
    userId: session.id ?? null,
    permisos,
    esAdmin: session.esAdmin === true,
    session,
  };
}

