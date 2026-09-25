// ============================================================
// FUENTE DE VERDAD ACTIVA de las rutas "home" según el modo
// de menú activo (launcher / sidebarLeft / topbar).
//
// La UI consume estas rutas vía el shim `lib/getDefaultRoute.js`.
// ============================================================

export const HOME_ROUTES = {
  launcher: "/modulos/inicio",
  sidebarLeft: "/modulos/dashboard",
  topbar: "/modulos/dashboard",
};

export function getDefaultRoute(menuMode) {
  return HOME_ROUTES[menuMode] || "/modulos/dashboard";
}

/**
 * ¿Esta ruta es el Inicio del sistema en ALGÚN modo de menú?
 *
 * El Inicio no es una ruta sola: el lanzador lo tiene en `/modulos/inicio` y
 * los otros dos modos en `/modulos/dashboard`, y el grupo "Inicio" del menú
 * apunta a la segunda aunque se esté en la primera. Quien necesite reconocer
 * "esto lleva al Inicio" pregunta acá, y no compara contra una ruta escrita.
 *
 * @param {string|null|undefined} ruta
 * @returns {boolean}
 */
export function esRutaDeInicio(ruta) {
  if (!ruta) return false;
  return Object.values(HOME_ROUTES).includes(ruta) || ruta === getDefaultRoute(undefined);
}
