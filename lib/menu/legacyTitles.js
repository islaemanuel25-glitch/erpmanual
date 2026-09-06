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
 * TÍTULOS DE PANTALLAS QUE NO SON ITEMS DEL MENÚ.
 *
 * `usePageTitle` cae en `useMenu().currentTitle` cuando no hay override, y ese
 * título sale del item del menú que matchea por PREFIJO MÁS LARGO. Para una
 * pantalla interna eso devuelve el nombre del MÓDULO, no el de la pantalla: en
 * `/modulos/configuracion/pos-ventas/cobros` el prefijo que gana es el item
 * `/modulos/configuracion/pos-ventas`, o sea "Configuración POS". Correcto para
 * marcar qué parte del menú está activa; equivocado como título de la página,
 * porque quien está parado en Cobros lee el nombre de otra pantalla.
 *
 * El mecanismo previsto para esto ya existe y es éste: los overrides. Se resuelve
 * acá y no tocando `Header.jsx` ni `LayoutBase.jsx`, que solo consumen el hook.
 *
 * ── POR QUÉ VA EN LOS DOS MAPAS ────────────────────────────────────────────
 *
 * El título de la pantalla se dibuja en DOS lugares y cada uno lee su propio
 * mapa: el mobile lo pone `LayoutBase` con `LEGACY_LAYOUTBASE_TITLES`, y el de
 * escritorio lo pone el `<h1>` del `Header` con `LEGACY_HEADER_TITLES`. Agregarlo
 * a uno solo dejaría el teléfono diciendo "Cobros" y la computadora
 * "Configuración POS" para la misma pantalla.
 *
 * ── NO SE LISTAN LAS RUTAS HIJAS, Y ES A PROPÓSITO ─────────────────────────
 *
 * `findOverride` matchea la clave exacta o el prefijo seguido de "/", así que
 * `/cobros/nuevo` y `/cobros/<clave>` heredan "Cobros" de esta misma entrada.
 *
 * Y esa herencia dejó de ser lo que se ve: las dos pantallas de formulario
 * REGISTRAN su propio título —"Agregar medio" y el nombre del medio que se está
 * editando— y el registro le gana al override. Ver
 * `lib/menu/tituloDePagina.js`.
 *
 * Escribirlas acá no habría servido igual: el nombre del medio es un dato que
 * llega de la API y no hay ninguna clave de ruta que pueda contener "Efectivo".
 * Lo que la herencia sigue dando es el título de MIENTRAS —el primer cuadro,
 * antes de que la pantalla registre— y el de cualquier ruta hija futura que no
 * registre nada.
 *
 * Y por la misma regla del "/" esta clave NO alcanza a la portada ni a
 * `/reglas` ni a `/integraciones`: ninguna de las tres empieza con
 * `…/pos-ventas/cobros/`.
 *
 * @type {Record<string, string>}
 */
export const TITULOS_POR_RUTA = {
  "/modulos/configuracion/pos-ventas/cobros": "Cobros",
};

/**
 * Overrides legacy para el título principal del Header (desktop).
 *
 * @type {Record<string, string>}
 */
export const LEGACY_HEADER_TITLES = {
  ...TITULOS_POR_RUTA,
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
  ...TITULOS_POR_RUTA,
  "/modulos/dashboard": "Panel",
};
