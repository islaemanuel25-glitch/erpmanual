"use client";

// ============================================================
// hooks/useMenu.js
//
// Lectura centralizada del menú visible y del contexto de
// navegación actual.
//
// Etapa 3 — modo compatibilidad:
//   El menú devuelto por este hook es EXACTAMENTE el resultado
//   de `buildVisibleMenu(MENU_CONFIG, perfil)` que la UI ya
//   consume hoy. NO se aplica todavía el filtrado comercial por
//   módulos/features contratados (eso queda para una etapa
//   posterior). De ese modo este hook no cambia ni un pixel de
//   lo que se ve actualmente.
//
// Devuelve:
//   - menu          : grupos visibles para el perfil activo.
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
import { MENU_CONFIG, buildVisibleMenu } from "@/lib/menuConfig";
import { getDefaultRoute } from "@/lib/getDefaultRoute";

export function useMenu() {
  const pathname = usePathname() || "";
  const userCtx = useUser();
  const layoutCtx = useLayoutSettings();

  const perfil = userCtx?.perfil ?? null;
  const isLoading = userCtx?.cargando === true;
  const menuMode = layoutCtx?.menuMode ?? null;

  const menu = useMemo(() => {
    if (!perfil) return [];
    return buildVisibleMenu(MENU_CONFIG, perfil);
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
