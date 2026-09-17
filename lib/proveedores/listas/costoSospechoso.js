// lib/proveedores/listas/costoSospechoso.js
//
// ¿EL COSTO DE HOY PARECE CARGADO A MANO?
//
// ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
//
// De mirar la lista de M Y F: varios TOSTEX tenían el costo en $1.000,00 exacto
// y "Caja de 1", y los siete daban el mismo +11,4 %. Un costo de mil pesos
// clavado no sale de una factura; sale de alguien que cargó el producto, no
// tenía el costo a mano y puso un número para salir del paso.
//
// Eso importa porque TODO este módulo compara contra ese número. Un aumento del
// 11,4 % contra un costo inventado no es un aumento del 11,4 %: es una cuenta
// contra nada. Y el rango esperado —que es la defensa principal— tampoco puede
// hacer su trabajo, porque el porcentaje que juzga salió del mismo lugar.
//
// ── POR QUÉ NO BLOQUEA ─────────────────────────────────────────────────────
//
// Porque no se puede saber desde acá si está mal. Un producto puede costar
// $1.000 de verdad. Lo único que se puede afirmar es que tiene la FORMA de un
// costo cargado a mano, y eso alcanza para pedirle a alguien que lo mire.
// Bloquear sobre una sospecha sería frenar la lista entera por una corazonada.
//
// ── LAS DOS CONDICIONES, Y POR QUÉ HACEN FALTA LAS DOS ─────────────────────
//
// Redondo SOLO no alcanza: un producto que costaba $952,38 y aumentó a $1.000,00
// por una lista es redondo y no lo cargó nadie a mano. Lo que separa los casos es
// el HISTORIAL: si alguna lista ya le escribió el costo, ese número tiene origen
// conocido y no es sospechoso por redondo que sea.
//
// Módulo puro: sin BD, sin Next.

/** A partir de acá un redondeo deja de ser casualidad. */
const PISO = 100;

/**
 * ¿Este número tiene forma de "puesto a mano"?
 *
 * Múltiplo de 100 y de al menos 100. El piso está porque abajo de eso los
 * redondos son comunes de verdad: un producto de $50 o de $100 no dice nada.
 */
export function esRedondo(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < PISO) return false;
  // Se compara sobre centavos enteros para no arrastrar el error del binario:
  // `1000.00 % 100` da 0, pero un costo que viene de una división puede llegar
  // como 999.9999999999999 y `% 100` daría 99.99…
  const centavos = Math.round(n * 100);
  return centavos % (PISO * 100) === 0;
}

/**
 * ¿Hay que avisar sobre el costo de hoy de este producto?
 *
 * @param costoActual   el costo maestro de hoy
 * @param vecesAplicado cuántas veces una lista le escribió el costo. Cero
 *                      significa que nadie se lo escribió nunca, o sea que sale
 *                      de la carga del producto.
 */
export function costoParaMirar({ costoActual, vecesAplicado = 0 } = {}) {
  if (Number(vecesAplicado) > 0) return false;
  return esRedondo(costoActual);
}

/**
 * El texto del aviso, con el número adentro.
 *
 * Vive acá y no en el JSX porque lo dicen DOS pantallas —la lista de los que se
 * actualizan y la revisión de a uno— y dos copias de un texto se separan el día
 * que alguien corrige una.
 */
export function textoDelCostoSospechoso(costoActual) {
  const n = Number(costoActual);
  const plata = Number.isFinite(n)
    ? n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
    : "—";
  return `El costo de hoy parece cargado a mano (${plata}). Revisá que sea real.`;
}
