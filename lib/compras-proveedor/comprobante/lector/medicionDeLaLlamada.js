// lib/compras-proveedor/comprobante/lector/medicionDeLaLlamada.js
//
// DE UNA LLAMADA AL LECTOR A LAS COLUMNAS QUE LA MIDEN EN `LlamadaLector`.
//
// Son dos rutas las que escriben la bitácora —leer y probar la receta—, y la
// medición tiene que salir igual de las dos: si una guardara los tokens y la
// otra no, los números de "cuánto razona Flash" saldrían de la mitad de las
// llamadas sin que nadie se entere. Por eso la traducción vive acá una vez.

const entero = (v) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Math.round(Number(v)) : null);

/**
 * @param i  un intento de la cadena o una llamada de la escalada:
 *           `{ duracionMs, tokens: { salida, razonamiento, total } }`
 * @returns las columnas de medición, vacías cuando no hay dato —una llamada
 *          cortada por la espera no trae tokens, y vacío no es cero—.
 */
export function medicionDeLaLlamada(i) {
  return {
    duracionMs: entero(i?.duracionMs),
    tokensSalida: entero(i?.tokens?.salida),
    tokensRazonamiento: entero(i?.tokens?.razonamiento),
    tokensTotal: entero(i?.tokens?.total),
  };
}
