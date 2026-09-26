// lib/caja/correcciones/permisos.js
//
// Las dos constantes de la corrección histórica que también necesita la
// pantalla. Viven acá, solas, porque `plan.js` usa `node:crypto` y no puede
// viajar al navegador; `plan.js` las reexporta, así que se definen una sola vez.

export const PERMISO_CORREGIR_HISTORICO = "caja.corregir_historico";

/** Un manifiesto PROPUESTO solo se ensaya; uno AUTORIZADO se aplica si la huella coincide. */
export const ESTADO_MANIFIESTO = Object.freeze({ PROPUESTO: "PROPUESTO", AUTORIZADO: "AUTORIZADO" });
