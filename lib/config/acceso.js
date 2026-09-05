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
  "config_local.medios_cobro",
  "listas_precios.ver",
];

/**
 * QUIÉN LLEGA A "CONFIGURACIÓN POS".
 *
 * Son DOS permisos porque adentro hay dos cosas distintas: las reglas de venta
 * las gobierna `config_local.pos` y los medios de cobro `config_local.medios_cobro`.
 * Tener uno solo alcanza para entrar; qué se ve adentro lo decide cada sección.
 *
 * Estaba gateado únicamente por `config_local.pos`, y eso dejaba a alguien con
 * permiso para administrar los medios de cobro —con API y todo— sin ninguna forma
 * de llegar a la pantalla. Un permiso que no tiene camino es un permiso que no
 * existe.
 *
 * Se define acá, una vez, y lo importan el menú y la landing de tarjetas: son los
 * dos lugares donde el mismo gate estaba escrito por separado.
 */
export const PERMISOS_CONFIG_POS = ["config_local.pos", "config_local.medios_cobro"];

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
 * ¿ESTE PERFIL VE ESTA TARJETA/SECCIÓN DE CONFIGURACIÓN?
 *
 * Espeja las reglas del menú (`canAccessMenuItem`, bloque G) para las tres
 * señales que usan las tarjetas de la landing:
 *
 *   adminOnly  → solo admin.
 *   permiso    → hay que tenerlo.
 *   permisos   → alcanza con tener CUALQUIERA (equivale a `requiredAnyPerms`).
 *
 * Vive acá y no adentro de la página para que se pueda ejercer sin montar React.
 * La landing tenía este filtro escrito en línea y por eso no había ningún candado
 * que dijera qué muestra: se veía leyendo el JSX o no se veía.
 *
 * @param {{permisos?:string[]}} perfil
 * @param {{adminOnly?:boolean, permiso?:string, permisos?:string[]}} seccion
 */
export function puedeVerSeccion(perfil, seccion) {
  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  if (permisos.includes("*")) return true;
  if (!seccion) return false;
  if (seccion.adminOnly) return false;
  if (seccion.permiso && !permisos.includes(seccion.permiso)) return false;
  if (Array.isArray(seccion.permisos) && !seccion.permisos.some((p) => permisos.includes(p))) {
    return false;
  }
  return true;
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
