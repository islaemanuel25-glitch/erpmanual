import { getUsuarioSession } from "@/lib/auth";
import { resolveLocalAndGrupo } from "@/lib/grupos";

// Resuelve el scope de notificaciones del usuario autenticado.
// IMPORTANTE: usa la MISMA resolución de grupo que marcar-enviado
// (resolveLocalAndGrupo, que lee la cookie de contexto-activo del admin),
// para que el grupoId de lectura coincida con el de creación.
// Devuelve { error, status } solo si no hay sesión; si no hay contexto, grupoId = null.
export async function resolverScopeNotif(req) {
  const session = getUsuarioSession(req);
  if (!session) return { error: "No autenticado", status: 401 };

  const ctx = await resolveLocalAndGrupo(req);
  const grupoId = ctx && !ctx.error ? ctx.grupoId : null;
  return { grupoId: grupoId || null, userId: session.id ?? null, session };
}

// Filtro Prisma: notificaciones del grupo dirigidas al usuario o a todo el grupo.
export function whereNotifUsuario(grupoId, userId) {
  return { grupoId, OR: [{ usuarioId: null }, { usuarioId: userId }] };
}
