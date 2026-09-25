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
// El descarte va ANTES del tope, así el lugar liberado lo toma el siguiente.
// El menú lateral, la barra y el registry siguen ofreciendo Inicio.
// ============================================================

import { esRutaDeInicio } from "@/lib/menu/homeRoutes";

/** Cuántas tarjetas entran en el Panel, en cualquiera de sus dos superficies. */
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
 * LA REGLA COMÚN: los grupos del menú visible que el Panel ofrece, en orden.
 * Sin los que no llevan a ningún lado ni los que llevan al Inicio, y DESPUÉS
 * como mucho `MAX_ACCESOS`.
 *
 * @param {Array} menu  el menú visible (`useMenu().menu`)
 * @returns {Array} grupos del menú, tal cual, como mucho MAX_ACCESOS
 */
export function gruposDelPanel(menu) {
  return (Array.isArray(menu) ? menu : [])
    .filter((group) => {
      const destino = destinoDelGrupo(group);
      return destino !== null && !esRutaDeInicio(destino);
    })
    .slice(0, MAX_ACCESOS);
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
