// lib/stock/libro/rutasStockDiario.js
//
// Dónde vive la pantalla del Stock Diario y con qué permiso. Aparte, como
// `lib/semanaOperativa/rutas.js`: el menú la importa y no tiene por qué
// arrastrar la lógica de la pantalla.
//
// ── ESTÁ EN FINANZAS, PERO SE AUTORIZA COMO STOCK ──────────────────────────
//
// La pantalla se mudó a Finanzas: es la base física de lo que después se va a
// valorizar, y Finanzas es donde se va a mirar eso. Pero DÓNDE se muestra no
// cambia QUIÉN la puede leer: sigue siendo `stock.ver`, el mismo permiso de sus
// rutas de datos —que no se movieron, siguen en `/api/stock_locales/diario/`,
// de solo lectura— y el que tuvo siempre.
//
// NO pide `finanzas.ver`, y es a propósito. Ese permiso abre ventas, margen,
// cobros, caja, deuda a proveedores y gastos; atar Stock Diario a él obligaba a
// elegir entre sacárselo a quien lo usaba —ENCARGADO y DUEÑO_LOCAL tienen
// `stock.ver` y no `finanzas.ver`— o darles toda la información de plata para
// que siguieran viendo cantidades. Ninguna de las dos era lo que se pedía.

export const RUTA_STOCK_DIARIO = "/modulos/finanzas/stock-diario";

/**
 * Donde vivía antes. La ruta se conserva solo para redirigir a la nueva, así
 * un enlace guardado no cae en un 404: no dibuja nada propio.
 */
export const RUTA_STOCK_DIARIO_ANTERIOR = "/modulos/stock_locales/diario";

/** El permiso de la pantalla, de su ítem y de sus rutas: el mismo del stock por local. */
export const PERMISO_STOCK_DIARIO = "stock.ver";
