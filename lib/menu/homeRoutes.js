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
