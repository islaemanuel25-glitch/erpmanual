// QUÉ PRECIO VALE EN UNA UBICACIÓN: EL SUYO O EL DEL DEPÓSITO.
//
// ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
//
// Había DOS criterios distintos para la misma pregunta, y se contradecían:
//
//   · el catálogo usaba un `pick` que solo mira NULO, así que un cero guardado
//     en la fila del local GANABA sobre el precio del depósito y se mostraba
//     $0,00;
//   · el módulo de stock usaba `||`, que con un cero cae a la base.
//
// O sea que las dos pantallas mostraban números distintos para el mismo producto
// sin que nada estuviera roto. Gana el criterio de stock, por decisión de
// Emanuel y con un motivo que se entiende solo: **un cero no es un precio, es
// que no le pusieron uno.**
//
// ── LO QUE ESTE CAMBIO NO ARREGLA, Y HAY QUE SABERLO ──────────────────────
//
// Medido contra producción el 2026-08-18, antes de escribirlo: **a CERO filas
// les cambia el número mostrado**. Hay 17 filas activas con precio de venta en
// cero, pero en las 17 el precio del DEPÓSITO también es cero, así que caer a él
// devuelve lo mismo.
//
// De esas 17, doce son servicios de importe variable —Carga virtual, Carga de
// colectivo, Sube, Virtual—, que guardan cero A PROPÓSITO porque la columna es
// obligatoria y el importe se carga al vender; la tarjeta ya los muestra como
// "Importe variable". Las otras cinco son el MISMO producto, "Aceitunas negras"
// (id 2360), en las cinco ubicaciones, sin precio ni costo en ninguna.
//
// Entonces esto no cambia nada hoy. Se hace igual porque el valor no está en las
// filas que arregla: está en que las dos pantallas dejen de poder contradecirse
// el día que aparezca una fila donde el depósito SÍ tenga precio.
//
// ── UNA CONSECUENCIA QUE NO SE VE LEYENDO ESTE ARCHIVO ────────────────────
//
// `mergeBaseLocalToUi` no lo usa solo el listado: también `obtener`, que es de
// donde la FICHA DE EDICIÓN saca sus valores iniciales. Así que en una fila con
// precio local en cero y depósito con precio, el formulario va a mostrar el del
// depósito, y guardarlo lo escribiría como override del local.
//
// Hoy eso no le pasa a ninguna fila —las 17 tienen el depósito en cero—, pero es
// el caso a mirar si alguna vez aparece. Lo que decide qué se ESCRIBE es
// `splitUiToDb`, que no pasa por acá.

/**
 * El valor que vale en la ubicación: el del local si tiene uno de verdad, y si
 * no el de la ficha del depósito.
 *
 * "De verdad" descarta nulo, indefinido, cadena vacía, lo que no es un número, y
 * el cero. El cero es el que importa y el que motivó esta función.
 *
 * @param {*} deLaFicha  el valor de `ProductoBase`.
 * @param {*} delLocal   el valor de `ProductoLocal`, que puede no estar.
 * @returns {*} el que corresponde mostrar.
 */
export function precioDeLaUbicacion(deLaFicha, delLocal) {
  if (delLocal === null || delLocal === undefined || delLocal === "") return deLaFicha;
  const n = Number(delLocal);
  if (!Number.isFinite(n) || n === 0) return deLaFicha;
  return delLocal;
}
