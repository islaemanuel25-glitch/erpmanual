// ============================================================
// lib/menu/legacyTitles.js
//
// Mapas de OVERRIDES de títulos legacy para preservar texto
// visible existente al migrar `components/Header.jsx` y
// `components/LayoutBase.jsx` a `usePageTitle`.
//
// Política (Etapa 4A, opción B):
//   - El registry pasa a ser la fuente principal de títulos.
//   - Sólo se incluyen overrides para rutas donde el texto legacy
//     ERA DISTINTO del label que devuelve `useMenu().currentTitle`.
//   - NO se preservan bugs: rutas que hoy caen en "Panel" o que
//     matchean por substring incorrecto NO entran al mapa.
//   - Las rutas que ya coincidían entre legacy y registry tampoco
//     entran (queda implícito por el fallback al currentTitle).
//
// Diferencias detectadas y preservadas (auditoría Etapa 4A):
//
//   Header.jsx
//     /modulos/auditoria-pos-ventas
//       legacy: "Auditoría POS Ventas"   registry: "Auditoría POS"
//     /modulos/pos-ventas
//       legacy: "POS"                    registry: "POS Ventas"
//     /modulos/dashboard
//       legacy: "Panel"                  registry: "Dashboard"
//
//   LayoutBase.jsx (mobile)
//     /modulos/dashboard
//       legacy: "Panel"                  registry: "Dashboard"
//
// Bugs pre-existentes que NO se preservan:
//   - LayoutBase mostraba "Transferencias" en /modulos/pos-transferencias
//     (orden incorrecto de la cadena ternaria).
//   - 17+ rutas mostraban "Panel" por no estar listadas en la cadena
//     ternaria. Al migrar pasarán a mostrar el label real del registry.
// ============================================================

/**
 * Overrides legacy para el título principal del Header (desktop).
 *
 * @type {Record<string, string>}
 */
export const LEGACY_HEADER_TITLES = {
  "/modulos/auditoria-pos-ventas": "Auditoría POS Ventas",
  "/modulos/pos-ventas": "POS",
  "/modulos/dashboard": "Panel",
};

/**
 * Overrides legacy para el título mobile que se renderiza
 * dentro de `LayoutBase.jsx`.
 *
 * @type {Record<string, string>}
 */
export const LEGACY_LAYOUTBASE_TITLES = {
  "/modulos/dashboard": "Panel",
};
