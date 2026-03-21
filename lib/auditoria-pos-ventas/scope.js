import { requirePerm } from "@/lib/authorize";
import { resolveLocalAndGrupo } from "@/lib/grupos";

/**
 * Solo lectura auditoría POS: permiso reportes + local estrictamente desde contexto/sesión (sin override por query).
 */
export async function getAuditoriaScope(req) {
  const perm = requirePerm(req, "reportes.ver");
  if (!perm.ok) {
    return { ok: false, error: perm.error, status: perm.status };
  }
  const scope = await resolveLocalAndGrupo(req);
  if (scope.error) {
    return {
      ok: false,
      error: scope.error,
      status: scope.status,
      needsContexto: scope.needsContexto === true,
    };
  }
  return { ok: true, localId: scope.localId, session: scope.session };
}

export function parseRangoFechas(searchParams) {
  const fechaDesde = searchParams.get("fechaDesde");
  const fechaHasta = searchParams.get("fechaHasta");
  if (!fechaDesde || !fechaHasta) {
    return { error: "fechaDesde y fechaHasta son requeridos" };
  }
  const TZ = "-03:00";
  return {
    fechaDesde,
    fechaHasta,
    fechaInicio: new Date(`${fechaDesde}T00:00:00${TZ}`),
    fechaFin: new Date(`${fechaHasta}T23:59:59.999${TZ}`),
  };
}
