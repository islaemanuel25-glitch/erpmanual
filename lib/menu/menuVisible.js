// ============================================================
// lib/menu/menuVisible.js
//
// EL MENÚ VISIBLE PARA UN PERFIL, sin React. Es el bucle que vivía adentro de
// `hooks/useMenu.js`, sacado tal cual para que los candados ejerciten el MISMO
// cálculo que dibuja la app —el menú lateral, la barra, el lanzador y los
// accesos rápidos del Panel— en vez de una copia escrita al lado.
// ============================================================

import { MENU_CONFIG } from "./registry.js";
import { canAccessMenuGroup, canAccessMenuItem } from "./canAccess.js";

/**
 * @param {object|null} perfil       el del UserContext; sin perfil, menú vacío
 * @param {object}      grupoConfig  capacidades comerciales (`getGrupoConfig()`)
 * @param {Array}       [menuConfig] por defecto, `MENU_CONFIG`
 * @returns {Array} grupos visibles, cada uno con solo sus ítems visibles
 */
export function construirMenuVisible(perfil, grupoConfig, menuConfig = MENU_CONFIG) {
  // Sin perfil no se construye el menú: misma semántica que Etapa 3.
  // La UI ya tolera `[]` durante el loading.
  if (!perfil) return [];

  const result = [];

  for (const group of menuConfig) {
    const groupCheck = canAccessMenuGroup(perfil, grupoConfig, group, menuConfig);
    if (!groupCheck.visible) continue;

    const items = Array.isArray(group.items) ? group.items : [];
    const visibleItems = items.filter(
      (item) => canAccessMenuItem(perfil, grupoConfig, item, menuConfig).visible
    );

    // Descartar grupos sin items visibles, salvo los `core`
    // (ej. Inicio) que son siempre alcanzables vía group.href.
    if (visibleItems.length === 0 && group.type !== "core") continue;

    // Copia superficial: no mutamos MENU_CONFIG.
    result.push({ ...group, items: visibleItems });
  }

  return result;
}
