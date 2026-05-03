"use client";

// ============================================================
// hooks/usePageTitle.js
//
// Resuelve el título de la página activa con esta prioridad:
//
//   1. `overrides[pathname]` exacto.
//   2. `overrides[key]` por prefijo más largo seguro
//      (`pathname === key` ó `pathname.startsWith(key + "/")`).
//   3. `currentTitle` derivado del menú visible (`useMenu`).
//   4. `fallback` recibido por opciones.
//   5. "Panel" como último recurso.
//
// El parámetro `overrides` se usa para preservar textos legacy
// puntuales al migrar componentes que hoy hardcodean cadenas
// ternarias (ver `lib/menu/legacyTitles.js`).
//
// Etapa 4A:
//   El hook queda preparado pero NO se consume desde la UI
//   todavía. La migración de Header.jsx / LayoutBase.jsx se hace
//   en una etapa posterior.
//
// Uso futuro:
//   import { LEGACY_HEADER_TITLES } from "@/lib/menu/legacyTitles";
//   const titulo = usePageTitle({
//     fallback: "Panel",
//     overrides: LEGACY_HEADER_TITLES,
//   });
// ============================================================

import { usePathname } from "next/navigation";
import { useMenu } from "@/hooks/useMenu";

/**
 * Busca un override válido para `pathname` dentro de `overrides`.
 *
 * Prioridad:
 *   - match exacto
 *   - prefijo más largo seguro (evita matches accidentales por
 *     substring: sólo cuenta como prefijo si es la ruta exacta o
 *     si está seguida por "/").
 *
 * @param {Record<string, string>|undefined} overrides
 * @param {string}                            pathname
 * @returns {string|undefined}
 */
function findOverride(overrides, pathname) {
  if (!overrides || typeof overrides !== "object" || !pathname) {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(overrides, pathname)) {
    return overrides[pathname];
  }

  let best;
  let bestLen = -1;
  for (const key of Object.keys(overrides)) {
    if (typeof key !== "string" || key.length === 0) continue;
    if (pathname === key || pathname.startsWith(key + "/")) {
      if (key.length > bestLen) {
        best = overrides[key];
        bestLen = key.length;
      }
    }
  }
  return best;
}

/**
 * @param {{ overrides?: Record<string, string>, fallback?: string }} [options]
 * @returns {string}
 */
export function usePageTitle({ overrides, fallback = "Panel" } = {}) {
  const pathname = usePathname() || "";
  const { currentTitle } = useMenu();

  const override = findOverride(overrides, pathname);
  if (override) return override;
  if (currentTitle) return currentTitle;
  if (fallback) return fallback;
  return "Panel";
}
