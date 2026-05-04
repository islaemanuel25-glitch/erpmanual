"use client";

// ============================================================
// hooks/useMenu.js
//
// Lectura centralizada del menú visible y del contexto de
// navegación actual.
//
// Etapa 5 del refactor modular/comercial:
//   El menú ya NO se construye con `buildVisibleMenu(MENU_CONFIG, perfil)`.
//   Ahora se itera `MENU_CONFIG` cruzando:
//     - permisos del usuario (RBAC),
//     - capacidades comerciales del grupo (módulos/features/
//       integraciones/scope/multi-sucursal) vía `getGrupoConfig()`,
//     - reglas operativas históricas (localOnly/depositoOnly).
//
//   La fuente comercial es `lib/empresa-config.js`, donde
//   `getGrupoConfig()` devuelve hoy `ACTIVE_GRUPO_CONFIG` =
//   `COMPAT_GRUPO_CONFIG` (Etapa 4.5). Esto deja activas las
//   capacidades necesarias para que el menú visible NO pierda
//   módulos respecto al estado pre-Etapa 5.
//
//   Cuando se decida cortar a la semántica comercial real
//   (single-local), basta con apuntar `ACTIVE_GRUPO_CONFIG` a
//   `DEFAULT_GRUPO_CONFIG`. Este hook no cambia.
//
// API pública preservada (idéntica a Etapas 3/4):
//   - menu          : grupos visibles para el perfil + grupoConfig.
//   - homeRoute     : ruta de inicio según menuMode.
//   - currentGroup  : grupo del menú que matchea el pathname (o null).
//   - currentItem   : sub-item del menú que matchea el pathname (o null).
//   - currentTitle  : etiqueta legible del item/grupo actual (o null).
//   - menuMode      : modo de layout activo (sidebarLeft/topbar/launcher).
//   - isLoading     : si el perfil aún se está resolviendo.
//   - perfil        : perfil activo del UserContext (puede ser null).
// ============================================================

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@/app/context/UserContext";
import { useLayoutSettings } from "@/app/context/LayoutSettingsContext";
import { MENU_CONFIG } from "@/lib/menu/registry";
import { getDefaultRoute } from "@/lib/getDefaultRoute";
import { getGrupoConfig } from "@/lib/empresa-config";
import {
  canAccessMenuGroup,
  canAccessMenuItem,
} from "@/lib/menu/canAccess";

export function useMenu() {
  const pathname = usePathname() || "";
  const userCtx = useUser();
  const layoutCtx = useLayoutSettings();

  const perfil = userCtx?.perfil ?? null;
  const isLoading = userCtx?.cargando === true;
  const menuMode = layoutCtx?.menuMode ?? null;

  const menu = useMemo(() => {
    // Sin perfil no se construye el menú: misma semántica que Etapa 3.
    // La UI ya tolera `[]` durante el loading.
    if (!perfil) return [];

    const grupoConfig = getGrupoConfig();
    const result = [];

    for (const group of MENU_CONFIG) {
      const groupCheck = canAccessMenuGroup(
        perfil,
        grupoConfig,
        group,
        MENU_CONFIG
      );
      if (!groupCheck.visible) continue;

      const items = Array.isArray(group.items) ? group.items : [];
      const visibleItems = items.filter(
        (item) =>
          canAccessMenuItem(perfil, grupoConfig, item, MENU_CONFIG).visible
      );

      // Descartar grupos sin items visibles, salvo los `core`
      // (ej. Inicio) que son siempre alcanzables vía group.href.
      if (visibleItems.length === 0 && group.type !== "core") continue;

      // Copia superficial: no mutamos MENU_CONFIG.
      result.push({ ...group, items: visibleItems });
    }

    return result;
  }, [perfil]);

  const homeRoute = useMemo(() => getDefaultRoute(menuMode), [menuMode]);

  const { currentGroup, currentItem } = useMemo(() => {
    if (!Array.isArray(menu) || menu.length === 0 || !pathname) {
      return { currentGroup: null, currentItem: null };
    }

    // Match por prefijo más largo: garantiza que `/modulos/pos-transferencias`
    // no caiga en `/modulos/pos`. Se evalúan tanto items como group.href.
    let matchedGroup = null;
    let matchedItem = null;
    let bestLen = -1;

    for (const group of menu) {
      if (Array.isArray(group.items)) {
        for (const item of group.items) {
          if (
            item.href &&
            pathname.startsWith(item.href) &&
            item.href.length > bestLen
          ) {
            matchedGroup = group;
            matchedItem = item;
            bestLen = item.href.length;
          }
        }
      }
      if (
        group.href &&
        pathname.startsWith(group.href) &&
        group.href.length > bestLen
      ) {
        matchedGroup = group;
        matchedItem = null;
        bestLen = group.href.length;
      }
    }

    return { currentGroup: matchedGroup, currentItem: matchedItem };
  }, [menu, pathname]);

  const currentTitle = useMemo(() => {
    if (currentItem?.label) return currentItem.label;
    if (currentGroup?.label) return currentGroup.label;
    return null;
  }, [currentGroup, currentItem]);

  return {
    menu,
    homeRoute,
    currentGroup,
    currentItem,
    currentTitle,
    menuMode,
    isLoading,
    perfil,
  };
}
