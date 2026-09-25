// ============================================================
// lib/dashboard/accesosRapidos.js
//
// LOS GRUPOS QUE EL PANEL OFRECE COMO TARJETA, sin React. Es UNA regla para las
// DOS superficies de Panel que tiene la app, según el modo de menú:
//
//   · lanzador          → `/modulos/inicio`    → `components/layout/AppLauncher.jsx`
//   · lateral y barra   → `/modulos/dashboard` → `components/dashboard/AccesosRapidos.jsx`
//
// Las rutas salen de `HOME_ROUTES` (`lib/menu/homeRoutes.js`); acá no se
// escribe ninguna.
//
// ── UN ACCESO AL INICIO, ESTANDO EN EL INICIO, NO ES UN ACCESO ─────────────
//
// El grupo "Inicio" lleva al Panel, y ocupaba uno de los ocho lugares. Con los
// nueve grupos de un administrador, el que quedaba afuera era Configuración.
// Se descarta el grupo cuyo destino es una ruta de Inicio de CUALQUIER modo:
// comparar contra la ruta actual no alcanza, porque el grupo apunta a
// `/modulos/dashboard` y el Panel del lanzador vive en `/modulos/inicio` —ése
// fue el defecto de la primera versión, que arregló un Panel y no el otro—.
// El menú lateral, la barra y el registry siguen ofreciendo Inicio.
//
// ── Y NO HAY TOPE ─────────────────────────────────────────────────────────
//
// Hubo uno de ocho, en las dos piezas, y fue la causa de fondo: con nueve
// grupos accesibles el noveno —Configuración— no aparecía en ninguna parte del
// Panel. El Panel muestra TODOS los grupos accesibles menos Inicio, y la
// grilla crece hacia abajo; la página ya se desplaza en vertical. Un módulo
// nuevo aparece solo, sin tocar ningún número.
// ============================================================

import { esRutaDeInicio } from "@/lib/menu/homeRoutes";

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
 * LA REGLA COMÚN: los grupos del menú visible que el Panel ofrece, en orden.
 * Todos, salvo los que no llevan a ningún lado y el que lleva al Inicio.
 *
 * @param {Array} menu  el menú visible (`useMenu().menu`)
 * @returns {Array} grupos del menú, tal cual
 */
export function gruposDelPanel(menu) {
  return (Array.isArray(menu) ? menu : []).filter((group) => {
    const destino = destinoDelGrupo(group);
    return destino !== null && !esRutaDeInicio(destino);
  });
}

/**
 * Las tarjetas de `AccesosRapidos`: los MISMOS grupos de `gruposDelPanel`, con
 * la forma que dibuja esa pieza.
 *
 * @param {Array} menu  el menú visible (`useMenu().menu`)
 * @returns {Array<{key, label, href, Icon, color}>}
 */
export function accesosDelPanel(menu) {
  return gruposDelPanel(menu).map((group) => ({
    key: group.key,
    label: group.label,
    href: destinoDelGrupo(group),
    Icon: group.icon,
    color: group.color || "gray",
  }));
}
