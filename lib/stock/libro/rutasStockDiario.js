// lib/stock/libro/rutasStockDiario.js
//
// Dónde vive la pantalla del Stock Diario y con qué permisos. Aparte, como
// `lib/semanaOperativa/rutas.js`: el menú la importa y no tiene por qué
// arrastrar la lógica de la pantalla.
//
// ── LA PANTALLA ES DE FINANZAS; LOS DATOS SIGUEN SIENDO DE STOCK ───────────
//
// La pantalla se mudó a Finanzas: es la base física de lo que después se va a
// valorizar, y Finanzas es donde se mira eso. Las rutas de datos NO se mudaron:
// siguen en `/api/stock_locales/diario/`, de solo lectura, con `stock.ver`, y
// devuelven exactamente lo mismo.
//
// Por eso la pantalla pide los DOS permisos: `finanzas.ver` porque es una
// herramienta de Finanzas —el mismo contrato que Pagos a proveedores y
// Gastos—, y `stock.ver` porque sin él sus rutas de datos contestan 403. Pedir
// uno solo dejaría a alguien con `finanzas.ver` y sin `stock.ver` frente a una
// pantalla que no puede cargar nada.

export const RUTA_STOCK_DIARIO = "/modulos/finanzas/stock-diario";

/**
 * Donde vivía antes. La ruta se conserva solo para redirigir a la nueva, así
 * un enlace guardado no cae en un 404: no dibuja nada propio.
 */
export const RUTA_STOCK_DIARIO_ANTERIOR = "/modulos/stock_locales/diario";

/** El permiso de las rutas de datos del Stock Diario: el mismo del stock por local. */
export const PERMISO_STOCK_DIARIO = "stock.ver";

/** Lo que pide la pantalla, y su entrada en el menú de Finanzas: los dos. */
export const PERMISOS_PANTALLA_STOCK_DIARIO = Object.freeze(["finanzas.ver", PERMISO_STOCK_DIARIO]);
