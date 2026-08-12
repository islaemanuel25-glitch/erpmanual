// lib/sunmi/pieDeTabla.js
//
// LA FILA DE TOTALES AL PIE: dónde termina la etiqueta y dónde empiezan los
// números.
//
// ── DE DÓNDE SALE, Y POR QUÉ NO LLEVA UN `colSpan` ─────────────────────────
//
// Las tres filas de totales que existen hoy se escriben igual: una etiqueta que
// abarca las primeras columnas y después una celda por cada número. Lo que
// cambia es cuántos números son —una en compras-proveedor, tres en el editor de
// corrección de ventas, cinco en el detalle de turno— y cuántas columnas quedan
// del lado de la etiqueta.
//
// Las tres lo resuelven hoy escribiendo el `colSpan` a mano, y una lo calcula:
//
//   const baseCols = 5;
//   const extraCols = (esRecepcion ? 1 : 0) + (esRecepcion && tieneFiambre ? 1 : 0) + ...
//
// Ese número tiene que seguir a las columnas condicionales de la tabla, y no hay
// nada que avise cuando deja de seguirlas: se agrega una columna, el pie queda
// corrido y la tabla se ve rota sin que nada falle. Al lado de esa tabla hay un
// comentario que dice, textual, que tocar las columnas obligaría a recalcular
// todos los `colSpan`.
//
// Así que el pie NO recibe un `colSpan`: recibe QUÉ NÚMERO VA EN QUÉ COLUMNA,
// por la clave de la columna, y el span se calcula solo. Cuando una columna
// aparece o desaparece, el pie la sigue sin que nadie lo toque.
//
// ── LO QUE HACE CON UNA CLAVE QUE NO EXISTE ────────────────────────────────
//
// La ignora, y se devuelve aparte en `desconocidas` para que un candado la
// pueda mirar. No lanza a propósito: esto corre dentro del render, y una fila de
// totales mal escrita no puede ser el motivo de que una pantalla entera quede en
// blanco. El costo de esa decisión es que un error de tipeo en la clave sale
// como un número que no aparece, no como una explosión.
//
// Módulo puro: sin React, sin DOM. Por eso se puede ejercer en un candado.

/**
 * @param {Array<{clave: string, align?: string}>} columnas
 * @param {Record<string, any>} valores  qué va en cada columna, por clave.
 * @returns {{span: number, celdas: Array<{clave: string, align?: string, valor: any}>, desconocidas: string[]}}
 */
export function celdasDelPie(columnas, valores) {
  const cols = Array.isArray(columnas) ? columnas : [];
  const v = valores && typeof valores === "object" ? valores : {};

  const claves = new Set(cols.map((c) => c?.clave));
  const desconocidas = Object.keys(v).filter((k) => !claves.has(k));

  // La etiqueta llega hasta la PRIMERA columna que tiene número. De ahí en
  // adelante hay una celda por columna, tenga número o no: la que no tiene queda
  // vacía, que es como se dibuja hoy la columna de acciones al final.
  let primera = cols.findIndex((c) => Object.prototype.hasOwnProperty.call(v, c?.clave));
  if (primera === -1) primera = cols.length;

  return {
    span: primera,
    celdas: cols.slice(primera).map((c) => ({
      clave: c?.clave,
      align: c?.align,
      valor: Object.prototype.hasOwnProperty.call(v, c?.clave) ? v[c.clave] : null,
    })),
    desconocidas,
  };
}
