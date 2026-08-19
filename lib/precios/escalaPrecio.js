// EN QUÉ ESCALA ESTÁ GUARDADO EL PRECIO DE UN PRODUCTO, DICHO EN PALABRAS.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// `precio_venta` NO está siempre en la misma escala: se guarda en la escala del
// producto. Un pack o un cajón lo tienen por BULTO, los de peso por KILO, y los
// sueltos por unidad. La base no tiene un campo que lo diga: la escala se deduce
// de `unidad_medida`, y por eso cada pantalla que muestra ese número tiene que
// decir de cuál se trata o el número miente.
//
// Y mintió. La tarjeta de producto del catálogo rotulaba "/ un" con un texto
// fijo mientras dividía ese mismo número por el factor para armar la línea de
// equivalencia — o sea que las dos mitades de la misma tarjeta se contradecían.
// Medido contra producción el 2026-08-18: de 2.600 productos, **1.293 son pack o
// cajón con factor mayor a 1**, así que el rótulo era falso en la mitad del
// catálogo, y por 24 veces en el caso que lo destapó.
//
// ── DE DÓNDE SALE ESTE TEXTO, Y POR QUÉ NO SE ESCRIBIÓ DE NUEVO ────────────
//
// Sale de `components/productos/FormProducto.jsx`, que ya rotulaba bien el campo
// de venta —"(por bulto)", "(por kg)", "(por unidad)"— desde antes. No se
// inventó una redacción nueva: se sacó la que ya existía y funciona, y ahora la
// ficha la consume desde acá. Dos pantallas diciendo lo mismo con dos textos
// distintos es exactamente cómo empieza a divergir un dato.
//
// ── EL CRITERIO ES EL DE LA FICHA, A PROPÓSITO ────────────────────────────
//
// Mira SOLO la unidad de medida, sin exigir que el factor sea mayor a 1. Existe
// un predicado más estricto —`tienePack`, en `recargoFijoUnidad.js`— que además
// pide factor mayor a 1, y la tentación es usar ése por ser el más preciso.
//
// No se usa, y el motivo es medible: los dos criterios difieren en los productos
// que son pack o cajón con factor 1, nulo o cero, y **en producción hay
// exactamente UNO**. Usar el predicado estricto le cambiaría la etiqueta a ese
// producto EN LA FICHA, que es la pantalla de la que se sacó esta pieza — y la
// regla del proyecto es que esa pantalla tiene que quedar idéntica. Un producto
// movido es un precio de más que se ve distinto sin que nadie lo haya pedido.
//
// Además, sobre ese único producto los dos textos son igual de ciertos: con
// factor 1 el bulto ES la unidad.

/** Las tres escalas en las que el ERP guarda un precio. */
export const ESCALA = {
  BULTO: "por bulto",
  KILO: "por kg",
  UNIDAD: "por unidad",
};

/**
 * Cómo se llama la escala en la que está guardado el precio de este producto.
 *
 * Devuelve el texto pelado, sin paréntesis: quien lo muestre decide el envoltorio.
 * La ficha lo envuelve —"Venta * (por bulto)"— y la tarjeta del catálogo lo pone
 * al lado del número, sin nada.
 *
 * @param {string|null|undefined} unidadMedida  `unidad`, `pack`, `cajon` o `kg`.
 * @returns {string} `"por bulto"`, `"por kg"` o `"por unidad"`.
 */
export function etiquetaEscalaPrecio(unidadMedida) {
  if (unidadMedida === "kg") return ESCALA.KILO;
  if (["pack", "cajon"].includes(unidadMedida)) return ESCALA.BULTO;
  return ESCALA.UNIDAD;
}

/**
 * La etiqueta cuando la pantalla decide mostrar SIEMPRE el precio unitario.
 *
 * ── POR QUÉ HACE FALTA UNA SEGUNDA FUNCIÓN ────────────────────────────────
 *
 * Un local puede pedir que el número grande sea siempre el unitario, aunque el
 * producto se venda por bulto. En ese caso `etiquetaEscalaPrecio` diría "por
 * bulto" sobre un número que ya NO es el del bulto — exactamente la
 * contradicción que costó la tanda del rótulo "/ un", ahora al revés.
 *
 * ── Y POR QUÉ EL KILO NO CAMBIA ───────────────────────────────────────────
 *
 * Porque para un producto de peso la unidad ES el kilo: `precioUnitarioQueSeCobra`
 * devuelve el precio por kilo. Decir "por unidad" sobre eso sería mentir en la
 * otra dirección.
 *
 * @param {string|null|undefined} unidadMedida
 * @returns {string} `"por kg"` para los de peso, `"por unidad"` para el resto.
 */
export function etiquetaEscalaUnitaria(unidadMedida) {
  return unidadMedida === "kg" ? ESCALA.KILO : ESCALA.UNIDAD;
}
