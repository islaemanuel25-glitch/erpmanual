// SHIM DE COMPATIBILIDAD - Etapa 1
// La fuente de verdad migró a `lib/menu/registry.js`.
// Este archivo se mantiene para no romper imports existentes
// en componentes UI. Será removido en una etapa posterior cuando
// los consumidores migren a importar desde `lib/menu/registry.js`
// directamente.

export { MENU_CONFIG, buildVisibleMenu } from "./menu/registry.js";
