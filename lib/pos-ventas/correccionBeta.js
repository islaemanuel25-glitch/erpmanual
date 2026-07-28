// lib/pos-ventas/correccionBeta.js
//
// FEATURE FLAG TEMPORAL del beta de CORRECCIÓN COMPLETA (Fase B). Habilita la
// corrección completa SOLO para una lista explícita de userIds, leída del env
// `CORRECCION_VENTAS_BETA_USER_IDS` (coma-separada). Fail-closed: si el env no
// está seteado o está vacío → NADIE tiene corrección completa (ni siquiera admin).
//
// Se evalúa en CADA request (no se cachea) para poder desactivar el flag
// cambiando el env + reiniciando el contenedor, sin redeploy de código.
//
// La corrección SIMPLE (Fase A) NO pasa por este flag: se gobierna solo por el
// permiso `ventas.corregir_simple`.
//
// NO hardcodear IDs acá. Este flag es temporal; al graduar el beta se retira el
// gate y queda solo el permiso `ventas.corregir_completa`.

export function usuariosBetaCorreccion() {
  const raw = process.env.CORRECCION_VENTAS_BETA_USER_IDS || "";
  return new Set(
    String(raw)
      .split(",")
      .map((s) => Number(String(s).trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  );
}

/**
 * ¿Este usuario está habilitado para la corrección COMPLETA (beta)?
 * Fail-closed: sin env / userId inválido → false.
 * @param {{ id?: number|null }} session
 */
export function enBetaCorreccionCompleta(session) {
  if (!session || session.id == null) return false;
  const ids = usuariosBetaCorreccion();
  if (ids.size === 0) return false;
  return ids.has(Number(session.id));
}

export const COD_FLAG_OFF = "correccion_completa_no_habilitada";
export const MSG_FLAG_OFF = "La corrección completa no está habilitada para tu usuario.";
