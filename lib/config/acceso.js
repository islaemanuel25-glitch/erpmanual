// lib/config/acceso.js
//
// Helper PURO y client-safe (sin imports de servidor) para decidir, en el
// FRONTEND, si un perfil puede VER la sección de Configuración (la landing de
// tarjetas y el ítem de menú). Espeja el `requiredAnyPerms` del grupo
// "configuracion" en lib/menu/registry.js: alcanza con tener CUALQUIERA de los
// permisos config_local.* (o listas_precios.ver), o ser admin ("*").
//
// El backend revalida cada escritura por su permiso puntual + el scope de la
// ubicación (resolveLocalAndGrupo). Este helper solo controla visibilidad de UI.

// Permisos que habilitan ver "Configuración". Mantener alineado con el
// requiredAnyPerms del grupo `configuracion` (lib/menu/registry.js).
export const PERMISOS_CONFIG_LOCAL = [
  "config_local.apariencia",
  "config_local.stock",
  "config_local.pos",
  "config_local.ticket",
  "config_local.fidelidad",
  "config_local.alertas",
  "listas_precios.ver",
];

/**
 * ¿Este perfil puede ver la sección de Configuración?
 * true si es admin ("*") o tiene al menos un permiso de config local.
 *
 * @param {{ permisos?: string[] }} perfil
 * @returns {boolean}
 */
export function puedeVerConfigLocal(perfil) {
  if (!perfil) return false;
  const permisos = Array.isArray(perfil.permisos) ? perfil.permisos : [];
  if (permisos.includes("*")) return true;
  return PERMISOS_CONFIG_LOCAL.some((p) => permisos.includes(p));
}

/**
 * Semántica CANÓNICA de ConfiguracionLocal.exigirOperador → ¿es obligatorio el
 * operario en esta ubicación? Fuente única de verdad para TODOS los consumidores
 * (getConfigLocalEfectiva, getExigirOperador, /api/me, perfilExentoDeOperador).
 *
 *   - null / undefined → true  (OBLIGATORIO; compatibilidad histórica — nunca se
 *                               interpreta como false)
 *   - true             → true  (OBLIGATORIO)
 *   - false            → false (NO obligatorio)
 *
 * Solo `false` estricto libera. Cualquier otro valor (incluido null y valores
 * inesperados) es fail-safe → obligatorio.
 *
 * @param {boolean|null|undefined} exigirOperador  valor crudo de la fila
 * @returns {boolean}
 */
export function operarioObligatorio(exigirOperador) {
  return exigirOperador !== false;
}
