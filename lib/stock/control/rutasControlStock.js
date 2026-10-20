// lib/stock/control/rutasControlStock.js
//
// Dónde vive la pantalla del Control de stock y con qué permisos. Aparte, como
// `lib/stock/libro/rutasStockDiario.js`: el menú la importa y no tiene por qué
// arrastrar las reglas del control.

export const RUTA_CONTROL_STOCK = "/modulos/stock_locales/control";

/** Abrir y terminar un control. */
export const PERMISO_GESTIONAR_CONTROL = "stock.control.gestionar";
/** Contar, y corregir o borrar lo propio. */
export const PERMISO_CONTAR_CONTROL = "stock.control.contar";

/**
 * Qué le ofrece la pantalla a este perfil (el de `/api/me`).
 *
 * Con un operador activo por PIN se cuenta, pero no se empieza ni se termina:
 * `/api/me` ya le resta `stock.control.gestionar` a la cuenta
 * (`lib/rbac/permisosDelOperador.js`), y al Admin —que conserva el comodín— se
 * lo niega `operadorActivo`, igual que el servidor.
 */
export function permisosDelControl(perfil) {
  const permisos = Array.isArray(perfil?.permisos) ? perfil.permisos : [];
  const esAdmin = permisos.includes("*");
  return {
    puedeGestionar: perfil?.operadorActivo !== true && (esAdmin || permisos.includes(PERMISO_GESTIONAR_CONTROL)),
    puedeContar: esAdmin || permisos.includes(PERMISO_CONTAR_CONTROL),
  };
}
