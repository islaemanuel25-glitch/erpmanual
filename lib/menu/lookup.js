// ============================================================
// lib/menu/lookup.js
//
// Helpers puros para buscar entradas por `href` dentro del menú
// ya filtrado (resultado de `buildVisibleMenu(MENU_CONFIG, perfil)`
// vía `useMenu`).
//
// IMPORTANTE: estos helpers NO aplican permisos. Reciben un
// `menu` que ya pasó por el filtrado y se limitan a localizar
// entradas por href. Si el href no está en el árbol visible,
// se devuelve null/false; eso ya implica que el item no es
// accesible para el perfil activo.
//
// Las funciones son determinísticas, no mutan argumentos y no
// tocan red, BD ni storage.
// ============================================================

/**
 * @typedef {Object} MenuItem
 * @property {string} [href]
 *
 * @typedef {Object} MenuGroup
 * @property {string}     [href]
 * @property {MenuItem[]} [items]
 */

/**
 * Devuelve el primer item visible cuyo `href` coincide exactamente
 * con `href`. Solo busca dentro de `group.items[]`.
 *
 * @param {MenuGroup[]} [menu]
 * @param {string}      href
 * @returns {MenuItem|null}
 */
export function findVisibleItem(menu, href) {
  if (!Array.isArray(menu) || !href) return null;
  for (const group of menu) {
    const items = Array.isArray(group?.items) ? group.items : [];
    for (const item of items) {
      if (item?.href === href) return item;
    }
  }
  return null;
}

/**
 * Devuelve el primer grupo visible cuyo `href` coincide exactamente
 * con `href`. Solo busca a nivel grupo (no en items).
 *
 * @param {MenuGroup[]} [menu]
 * @param {string}      href
 * @returns {MenuGroup|null}
 */
export function findVisibleGroup(menu, href) {
  if (!Array.isArray(menu) || !href) return null;
  for (const group of menu) {
    if (group?.href === href) return group;
  }
  return null;
}

/**
 * True si `href` aparece como `group.href` ó como `item.href` en
 * algún punto del menú filtrado.
 *
 * @param {MenuGroup[]} [menu]
 * @param {string}      href
 * @returns {boolean}
 */
export function isHrefVisible(menu, href) {
  return (
    findVisibleGroup(menu, href) !== null ||
    findVisibleItem(menu, href) !== null
  );
}
