// Filtro Prisma PURO (sin imports de servidor, testeable) que aísla las
// notificaciones por UBICACIÓN ACTIVA además del grupo. Lo reexporta scope.js.
//
// Combina PERMISO + GRUPO + UBICACIÓN ACTIVA + RELACIÓN CON EL RECURSO:
//   - USUARIO:        solo si usuarioId == userId.
//   - GRUPO:          todo el grupo (anuncios; incluye legacy con alcance default).
//   - LOCAL/DEPOSITO: solo si localId == ubicación activa del lector.
//   - PARTICIPANTES:  solo si la ubicación activa es origen o destino.
//   - permisoRequerido: la notif no lo exige, o el lector lo tiene (o es "*").
//
// Fail-closed: sin grupoId (sin contexto) → no matchea nada. Sin localId activo,
// solo se ven USUARIO y GRUPO (nunca notificaciones atadas a una ubicación).
export function whereNotifUsuario(scope) {
  // Compatibilidad: acepta (grupoId, userId) legacy o el objeto scope nuevo.
  const s =
    typeof scope === "object" && scope !== null
      ? scope
      : { grupoId: scope, userId: arguments[1] };

  const grupoId = s.grupoId || null;
  const localId = s.localId || null;
  const userId = s.userId ?? null;
  const permisos = Array.isArray(s.permisos) ? s.permisos : [];

  // Sin contexto de grupo → fail-closed (no matchea ninguna fila).
  if (!grupoId) return { id: -1 };

  const tieneComodin = permisos.includes("*");

  // Alcance según ubicación activa.
  const alcanceOr = [{ alcance: "GRUPO" }];
  if (userId != null) alcanceOr.push({ alcance: "USUARIO", usuarioId: userId });
  if (localId) {
    alcanceOr.push({ alcance: "LOCAL", localId });
    alcanceOr.push({ alcance: "DEPOSITO", localId });
    alcanceOr.push({
      alcance: "PARTICIPANTES",
      OR: [{ origenLocalId: localId }, { destinoLocalId: localId }],
    });
  }

  const and = [{ OR: alcanceOr }];
  // Filtro de permiso (admin "*" ve todo).
  if (!tieneComodin) {
    and.push({
      OR: [{ permisoRequerido: null }, { permisoRequerido: { in: permisos } }],
    });
  }

  return { grupoId, AND: and };
}
