// lib/precios/redondeo.js
//
// EL REDONDEO COMERCIAL A 100. Una sola función, para todo el sistema.
//
// ── POR QUÉ HABÍA DOS ───────────────────────────────────────────────────────
//
// Convivían `redondear100` (acá) y `redondearA100Arriba` (en precioDesdeMargen).
// Las dos redondeaban hacia arriba y parecían la misma, pero diferían en dos
// puntos, y uno de los dos era plata:
//
//   · CON CENTAVOS. `1050 × 1,3` da `1365,0000000000002` en binario, y hay casos
//     peores: un valor ya exacto como 1400 puede llegar como 1400,0000000001 y
//     esta función lo empujaba a 1500. CIEN PESOS DE MÁS, salidos de ruido de
//     coma flotante y no de ninguna regla. `redondearA100Arriba` normalizaba a
//     centavos antes de subir, justamente para eso.
//
//   · CON VALORES ≤ 0. Esta devolvía 0; la otra devolvía el valor tal cual.
//
// El POS usaba ESTA, o sea la que se equivocaba con los centavos: el precio que
// el cliente ve impreso en el ticket salía de la versión defectuosa.
//
// ── QUÉ QUEDÓ ───────────────────────────────────────────────────────────────
//
// Una sola función, con este nombre y en este archivo —que es de donde la
// importa el POS— y con el comportamiento correcto de las dos:
//
//   · se normaliza a centavos antes de subir, así un precio exacto no salta de
//     múltiplo por ruido binario;
//   · un valor ≤ 0 o inválido devuelve 0, que es lo que esperan los mapeos de
//     stock y de búsqueda. Un precio negativo no es un precio.
//
// Por debajo del centavo no hay información, solo ruido: un precio es dinero.

/**
 * Redondeo comercial a 100, siempre hacia arriba. **Nunca `Math.round`.**
 *
 * @param {number|string} valor precio a redondear
 * @returns {number} 0 si es inválido o ≤ 0; si no, el siguiente múltiplo de 100
 */
export function redondear100(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // El paso que faltaba: sin normalizar a centavos, 1400,0000000001 → 1500.
  const centavos = Math.round(n * 100) / 100;
  return Math.ceil(centavos / 100) * 100;
}

// ── EL PRECIO QUE SE COBRA, NO EL QUE ESTÁ GUARDADO ────────────────────────
//
// El catálogo mostraba el precio de la base sin redondear mientras el POS cobra
// el redondeado: dos números distintos para el mismo producto, sin que nada
// estuviera roto. Medido contra producción el 2026-08-18: de 2.592 productos con
// el redondeo prendido, **1.130 mostraban un número distinto del que se cobra**
// —12 en el número grande de la tarjeta y 1.118 en la línea de equivalencia—.
//
// LA REGLA SE ESCRIBE ACÁ Y NO EN LA PANTALLA, que es el pedido explícito: si el
// catálogo redondeara por su cuenta, el día que cambie la regla se separarían
// otra vez. Va en este archivo porque es el que ya se declara "una sola función
// para todo el sistema" — la función estaba compartida, la DECISIÓN no.
//
// ── LO QUE SE MIDIÓ Y NO SE UNIFICA HOY ───────────────────────────────────
//
// Las dos pantallas que ya redondeaban NO usan la misma condición: el POS
// excluye el fiambre de pieza fija y solo en el depósito
// (`pos-ventas/buscar-producto`), y el listado de stock no excluye nada
// (`lib/stock/mapItem.js`). Este helper toma la condición del listado de stock,
// que es la otra LISTA, y no la del POS.
//
// No es una elección a ciegas: **de los 1.130 productos a los que el redondeo
// les cambia el número, CERO son fiambre de pieza fija**, así que hoy las dos
// condiciones dan el mismo resultado para todo el catálogo. Migrar el POS y el
// stock a este helper es una tanda propia y queda anotada; hacerlo de paso
// tocaría el precio que se cobra en el mostrador.

/**
 * El precio UNITARIO que el POS le va a cobrar al cliente.
 *
 * Un pack tiene el precio guardado por bulto, así que el unitario se deriva
 * dividiendo. Y el redondeo se aplica sobre el unitario y no sobre el bulto,
 * que es como lo hacen el POS y el listado de stock.
 *
 * @param {object} p
 * @param {number|string|null} p.precio      el precio guardado, en su escala.
 * @param {number|null} p.factor             unidades por bulto.
 * @param {string|null} p.unidad             `pack`, `cajon`, `kg` o `unidad`.
 * @param {boolean} p.redondeo100            si el producto redondea a 100.
 * @returns {number|null} el unitario, o null si no hay precio.
 */
export function precioUnitarioQueSeCobra({ precio, factor, unidad, redondeo100 = false } = {}) {
  if (precio === null || precio === undefined || precio === "") return null;
  const n = Number(precio);
  if (!Number.isFinite(n)) return null;

  const f = Number(factor);
  const esBulto = ["pack", "cajon"].includes(String(unidad)) && Number.isFinite(f) && f > 1;
  const unitario = esBulto ? n / f : n;

  return redondeo100 ? redondear100(unitario) : unitario;
}

/**
 * El precio que la tarjeta muestra EN GRANDE, en la escala del producto.
 *
 * Para un pack es el del bulto y se muestra tal cual está guardado: el POS no
 * cobra bultos, así que inventar un "bulto redondeado" sería un número que no
 * cobra nadie. El unitario redondeado —el que sí se cobra— va en la línea de
 * equivalencia, debajo.
 *
 * Para todo lo demás la escala YA es la unitaria, así que el número grande es
 * exactamente el que se cobra y va redondeado.
 *
 * @returns {number|null} el precio a mostrar, o null si no hay.
 */
export function precioEnEscalaQueSeCobra({ precio, factor, unidad, redondeo100 = false } = {}) {
  if (precio === null || precio === undefined || precio === "") return null;
  const n = Number(precio);
  if (!Number.isFinite(n)) return null;

  const f = Number(factor);
  const esBulto = ["pack", "cajon"].includes(String(unidad)) && Number.isFinite(f) && f > 1;
  if (esBulto) return n;

  return precioUnitarioQueSeCobra({ precio, factor, unidad, redondeo100 });
}
