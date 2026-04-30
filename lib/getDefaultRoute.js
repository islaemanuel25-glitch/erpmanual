export const HOME_ROUTES = {
  launcher: "/modulos/inicio",
  sidebarLeft: "/modulos/dashboard",
  topbar: "/modulos/dashboard",
};

export function getDefaultRoute(menuMode) {
  return HOME_ROUTES[menuMode] || "/modulos/dashboard";
}
