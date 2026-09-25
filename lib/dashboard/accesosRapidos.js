// ============================================================
// lib/dashboard/accesosRapidos.js
//
// LOS ACCESOS RÁPIDOS DEL PANEL, sin React: qué grupos del menú visible se
// ofrecen como tarjeta y a qué ruta lleva cada una. La pieza que los dibuja es
// `components/dashboard/AccesosRapidos.jsx`.
//
// ── UN ACCESO A LA PANTALLA EN LA QUE YA SE ESTÁ NO ES UN ACCESO ──────────
//
// El Panel se abre en la ruta de Inicio, así que la tarjeta "Inicio" llevaba
// a la misma pantalla y ocupaba uno de los ocho lugares. Con los nueve grupos
// de un administrador, el que quedaba afuera era Configuración. Se descarta
// cualquier acceso cuyo destino es la ruta actual: no se nombra a ningún grupo,
// y el menú lateral, la barra y el lanzador siguen ofreciendo Inicio.
// ============================================================

/** Cuántas tarjetas entran en el Panel. */
export const MAX_ACCESOS = 8;

/**
 * Determina la ruta destino para un grupo del menú visible.
 * Devuelve null si no hay ningún item visible al que apuntar.
 *
 * Se prefiere `group.href` cuando coincide con algún item visible (evita
 * linkear a una ruta sin permiso); si no, el primer item visible del grupo.
 *
 * @param {{ href?: string, items?: Array<{ href?: string }> }} group
 * @returns {string|null}
 */
export function destinoDelGrupo(group) {
  const items = Array.isArray(group?.items) ? group.items : [];
  if (group?.href && items.some((it) => it.href === group.href)) {
    return group.href;
  }
  return items[0]?.href ?? null;
}

/**
 * @param {Array}  menu        el menú visible (`useMenu().menu`)
 * @param {string} rutaActual  la ruta en la que se dibuja el Panel
 * @returns {Array<{key, label, href, Icon, color}>} como mucho MAX_ACCESOS
 */
export function accesosDelPanel(menu, rutaActual) {
  return (Array.isArray(menu) ? menu : [])
    .map((group) => {
      const href = destinoDelGrupo(group);
      if (!href || href === rutaActual) return null;
      return {
        key: group.key,
        label: group.label,
        href,
        Icon: group.icon,
        color: group.color || "gray",
      };
    })
    .filter(Boolean)
    .slice(0, MAX_ACCESOS);
}
