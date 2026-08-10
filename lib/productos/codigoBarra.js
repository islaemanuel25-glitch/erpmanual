// lib/productos/codigoBarra.js
//
// EL TOPE DE LARGO DEL CÓDIGO DE BARRA.
//
// ── POR QUÉ 16 Y NO 14 ──────────────────────────────────────────────────────
//
// Un código que un lector pueda leer no pasa de 14 caracteres: EAN-13 son 13,
// UPC-A 12, EAN-8 8, ITF-14 14 —el de la caja— y los de balanza 13 empezando
// con 2. El tope natural sería 14.
//
// Pero medido contra producción hay tres productos con un código de 16 dígitos
// que es legítimo: `0117798091030524`, `0147798397440011` y `0147798397444200`.
// Los tres empiezan con `01`, que en GS1 es el identificador de aplicación de
// GTIN, seguido de un GTIN-14. Es lo que emite un lector al escanear el código
// de un bulto. Dos de esos productos se venden: Rasta Blanco X18 tenía 31
// líneas de venta y la última el mismo día de la medición.
//
// Con 14 rechazaríamos un escaneo real de caja. Con 16 entra la etiqueta de
// bulto y siguen frenados los de 17, 18 y 20, que son los que de verdad son
// basura —nombres de producto escritos en la columna del código—.
//
// ── EL TOPE FRENA AL ESCRIBIR, NO AL GUARDAR ────────────────────────────────
//
// Lo que ya está guardado SE QUEDA. Hay 16 productos con más de 14 caracteres y
// 90 con letras; ninguno se toca. Si alguien abre uno de esos para editar otra
// cosa, el código tiene que verse entero, poder acortarse y volver a guardarse
// igual. Un tope que al abrir la ficha recorta el dato viejo no es un tope: es
// una migración silenciosa disparada por mirar.
//
// Por eso `alEscribirCodigoBarra` acepta cualquier valor que NO CREZCA, aunque
// esté por encima del tope. Un código de 20 se puede seguir editando y borrando;
// lo único que no se puede es hacerlo más largo de lo que ya era.
//
// No hay validación en el servidor a propósito: agregar una del lado de la base
// rechazaría al guardar esos 16 productos que hoy son válidos.
//
// Módulo puro: sin React, sin Prisma.

/** Cuántos caracteres se pueden escribir en un código de barra. */
export const MAX_CODIGO_BARRA = 16;

/**
 * Qué valor queda en el campo cuando alguien intenta dejarlo en `propuesto`
 * partiendo de `actual`.
 *
 * Tres casos, en este orden:
 *
 * 1. Entra dentro del tope → se acepta. Es el caso normal.
 * 2. Se pasa del tope pero NO crece respecto de lo que ya había → se acepta.
 *    Es el que protege los datos viejos: con un código de 20 guardado, borrar
 *    una letra deja 19 y tiene que poder hacerse. También reemplazar un
 *    carácter, que deja el mismo largo.
 * 3. Se pasa del tope Y crece → se rechaza, y el campo queda como estaba.
 *
 * @param {string} propuesto  lo que quedaría en el campo.
 * @param {string} actual     lo que hay hoy en el campo.
 * @returns {string}
 */
export function alEscribirCodigoBarra(propuesto, actual = "") {
  const p = propuesto == null ? "" : String(propuesto);
  const a = actual == null ? "" : String(actual);
  if (p.length <= MAX_CODIGO_BARRA) return p;
  if (p.length <= a.length) return p;
  return a;
}

/**
 * El valor que se le pasa al input para mostrar. Devuelve lo guardado TAL CUAL,
 * sin recortar.
 *
 * Parece de más —es la identidad— y existe por una razón: deja el candado que
 * afirma que abrir un producto viejo no le toca el código. El día que alguien
 * "arregle" el tope recortando también acá, ese candado se pone rojo antes de
 * que el recorte llegue a la base.
 *
 * @param {string} guardado
 * @returns {string}
 */
export function paraMostrarCodigoBarra(guardado) {
  return guardado == null ? "" : String(guardado);
}
