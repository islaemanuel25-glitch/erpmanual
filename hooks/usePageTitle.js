"use client";

// ============================================================
// hooks/usePageTitle.js
//
// Resuelve el título de la página activa con esta prioridad:
//
//   0. El título que REGISTRÓ la pantalla activa, si registró alguno.
//   1. `overrides[pathname]` exacto.
//   2. `overrides[key]` por prefijo más largo seguro
//      (`pathname === key` ó `pathname.startsWith(key + "/")`).
//   3. `currentTitle` derivado del menú visible (`useMenu`).
//   4. `fallback` recibido por opciones.
//   5. "Panel" como último recurso.
//
// El escalón 0 es el único que puede decir un DATO —el nombre del medio que se
// está editando— porque los otros cuatro salen de la ruta y ninguna tabla de
// rutas puede contener "Efectivo". Viaja por el slot que ya existía para la
// acción de página: ver `app/context/AccionDePaginaContext.jsx`.
//
// Que esté acá y no en `LayoutBase.jsx` ni en `Header.jsx` es a propósito, y es
// la misma razón por la que los overrides viven en `legacyTitles`: los dos
// shells solo consumen este hook, así que resolverlo acá les da el título nuevo
// a los dos sin tocar ninguno de los dos archivos.
//
// El parámetro `overrides` se usa para preservar textos legacy
// puntuales al migrar componentes que hoy hardcodean cadenas
// ternarias (ver `lib/menu/legacyTitles.js`).
//
// Quiénes lo consumen hoy —el comentario decía que todavía nadie, y hacía dos
// tandas que no era cierto—:
//   components/Header.jsx      con LEGACY_HEADER_TITLES     (el <h1> de escritorio)
//   components/LayoutBase.jsx  con LEGACY_LAYOUTBASE_TITLES (la fila de mobile)
// ============================================================

import { usePathname } from "next/navigation";
import { useMenu } from "@/hooks/useMenu";
import { useTituloDelShell } from "@/app/context/AccionDePaginaContext";
import { resolverTituloDePagina } from "@/lib/menu/tituloDePagina";

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
  const registrado = useTituloDelShell();

  return resolverTituloDePagina({
    registrado,
    override: findOverride(overrides, pathname),
    delMenu: currentTitle,
    fallback,
  });
}
