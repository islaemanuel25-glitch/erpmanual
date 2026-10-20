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
