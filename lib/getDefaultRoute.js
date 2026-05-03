// SHIM DE COMPATIBILIDAD - Etapa 1
// La fuente de verdad migró a `lib/menu/homeRoutes.js`.
// Este archivo se mantiene para no romper imports existentes
// en componentes UI. Será removido en una etapa posterior cuando
// los consumidores migren a importar desde `lib/menu/homeRoutes.js`
// directamente.

export { HOME_ROUTES, getDefaultRoute } from "./menu/homeRoutes.js";
