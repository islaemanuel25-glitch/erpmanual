// lib/stock/libro/rutasStockDiario.js
//
// Dónde vive la pantalla del Stock Diario y con qué permiso. Aparte, como
// `lib/semanaOperativa/rutas.js`: el menú la importa y no tiene por qué
// arrastrar la lógica de la pantalla.

export const RUTA_STOCK_DIARIO = "/modulos/stock_locales/diario";
/** A dónde vuelve: la puerta del grupo Stock del menú. */
export const RUTA_STOCK = "/modulos/stock_locales";
/** El permiso de las rutas del Stock Diario: el mismo del stock por local. */
export const PERMISO_STOCK_DIARIO = "stock.ver";
