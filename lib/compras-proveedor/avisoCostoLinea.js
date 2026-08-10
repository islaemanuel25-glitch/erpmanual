// lib/compras-proveedor/avisoCostoLinea.js
//
// AVISAR CUANDO EL PRECIO DE UNA LÍNEA NO COINCIDE CON EL COSTO DEL CATÁLOGO.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// Desde que cargar un pedido dejó de arrastrar el costo maestro, el catálogo ya
// no se actualiza solo al comprar. Si el proveedor aumenta y nadie abre el
// producto a cambiarlo, el costo queda viejo hasta que llegue una lista de
// precios o alguien lo edite a mano.
//
// Este aviso es lo único que evita que eso pase sin que nadie se entere. NO
// ESCRIBE NADA: enciende una señal en la línea para que la persona decida si
// abre el lápiz. La decisión sigue siendo de ella.
//
// ── LA COMPARACIÓN TIENE QUE MEDIR LO MISMO DE LOS DOS LADOS ────────────────
//
// El precio de la línea está en la unidad de la línea —por bulto o por unidad—
// y el del catálogo es el costo maestro, que para un producto con pack se guarda
// POR BULTO. Comparar los dos números crudos daría una diferencia enorme y falsa
// en cada línea de pack cargada por unidad.
//
// Por eso el precio de la línea se lleva primero a escala de maestro con
// `costoLineaAMaestro`, que es la MISMA función que usa el camino de recepción
// para escribir el costo. Si esa conversión cambia, el aviso cambia con ella.
//
// ── EL UMBRAL: UN PESO ──────────────────────────────────────────────────────
//
// Medido, no elegido de memoria. Cuando alguien carga una línea de pack por
// unidad, teclea el unitario ya redondeado a centavos: 23.500 / 24 = 979,1666…
// se escribe 979,17, y al volver a bulto da 23.500,08. Ese ruido, sobre los
// precios reales de la base, llega como mucho a 8 centavos.
//
//   catálogo 23.500 · factor 24  → ruido  0,08
//   catálogo  1.480 · factor 18  → ruido −0,04
//   catálogo    999 · factor  7  → ruido −0,03
//
// Un peso deja todo ese ruido apagado y sigue siendo muchísimo más chico que
// cualquier cambio de precio real, que en esta base se mide en cientos o miles.
// Se compara en CENTAVOS ENTEROS para no arrastrar coma flotante.
//
// Módulo puro: sin Prisma, sin React.

import { costoLineaAMaestro } from "./costoMaestro.js";

/** Desde cuánta diferencia se enciende el aviso. Un peso, en centavos. */
export const UMBRAL_CENTAVOS = 100;

const aCentavos = (n) => Math.round((Number(n) || 0) * 100);

/**
 * ¿El precio de esta línea difiere del costo del catálogo?
 *
 * @param {number} precioLinea  precio cargado en la línea, EN SU UNIDAD.
 * @param {string} unidad       "BULTO" | "UNIDAD" — la unidad de la línea.
 * @param {number} costoCatalogo costo maestro vigente del producto.
 * @param {object} base         { factor_pack, modoCompraProveedor, unidad_medida }
 *
 * @returns {{
 *   hayDiferencia: boolean,
 *   costoLinea: number|null,   // el de la línea, ya en escala de maestro
 *   costoCatalogo: number|null,
 *   diferencia: number,        // línea − catálogo, en escala de maestro
 *   sentido: "sube"|"baja"|null,
 * }}
 *
 * `hayDiferencia: false` cuando falta cualquiera de los dos datos: sin costo en
 * la línea o sin costo en el catálogo no hay nada que comparar, y encender el
 * aviso ahí sería ruido en cada producto nuevo.
 */
export function compararCostoLinea({ precioLinea, unidad, costoCatalogo, base } = {}) {
  const vacio = {
    hayDiferencia: false,
    costoLinea: null,
    costoCatalogo: null,
    diferencia: 0,
    sentido: null,
  };

  const cat = Number(costoCatalogo);
  if (!Number.isFinite(cat) || cat <= 0) return vacio;

  // Misma conversión que usa el camino que escribe el costo de verdad.
  const linea = costoLineaAMaestro({
    precioCosto: precioLinea,
    unidad,
    factorPack: base?.factor_pack,
    modoCompraProveedor: base?.modoCompraProveedor,
    unidadMedida: base?.unidad_medida,
  });
  if (linea === null) return vacio;

  const dif = aCentavos(linea) - aCentavos(cat);
  const hay = Math.abs(dif) >= UMBRAL_CENTAVOS;

  return {
    hayDiferencia: hay,
    costoLinea: linea,
    costoCatalogo: cat,
    diferencia: Math.round((linea - cat) * 100) / 100,
    sentido: hay ? (dif > 0 ? "sube" : "baja") : null,
  };
}

/**
 * El texto del aviso. Dice los dos números y qué hacer, no "hay una diferencia".
 *
 * Va en el `title` del indicador: la línea es angosta y el número largo no entra,
 * pero al pasar por encima tiene que quedar claro sin abrir nada.
 */
export function textoAvisoCosto(cmp) {
  if (!cmp?.hayDiferencia) return "";
  const fmt = (n) => `$${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(n)}`;
  const verbo = cmp.sentido === "sube" ? "más caro que" : "más barato que";
  return (
    `Estás pagando ${fmt(cmp.costoLinea)}, ${verbo} el costo del catálogo (${fmt(cmp.costoCatalogo)}). ` +
    `El pedido no cambia el catálogo: si el precio nuevo es el que vale, abrí el producto con el lápiz y actualizalo.`
  );
}
