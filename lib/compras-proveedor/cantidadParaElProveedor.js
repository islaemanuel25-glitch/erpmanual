// CÓMO SE LE DICE AL PROVEEDOR CUÁNTO SE LE PIDE.
//
// ── EL PROBLEMA ───────────────────────────────────────────────────────────
//
// El texto y el PDF decían "40 BULTO". "Bulto" es vocabulario NUESTRO: adentro
// del ERP significa "la presentación en la que se compra este producto", y esa
// presentación es distinta en cada producto — 12, 24, 30. El proveedor que
// recibe el mensaje no tiene forma de saber cuál, así que el número no alcanza
// para preparar el pedido y hay que llamarlo por teléfono.
//
// La conversión ya está en la ficha del producto, en `factor_pack`. Lo único
// que faltaba era escribirla.
//
// ── EL FORMATO, Y POR QUÉ LLEVA LAS TRES COSAS ────────────────────────────
//
//   con pack:    "40 × 24 = 960 unidades"
//   por unidad:  "62 unidades"
//   por peso:    "12 kg"
//
// En el caso del pack van los tres números y no solo el total: el proveedor
// prepara BULTOS —40 cajas— y controla UNIDADES. Dejar solo "960 unidades" le
// hace dividir a él, y dividir mal es despachar de menos. Dejar solo "40 × 24"
// obliga a multiplicar para controlar. Los tres juntos no se pueden malinterpretar.
//
// ── Y CUANDO NO HAY FACTOR NO SE INVENTA ──────────────────────────────────
//
// Un producto marcado como pack sin `factor_pack` cargado no se puede expresar
// en unidades: no se sabe cuántas trae. Se escribe la cantidad SOLA —"40"— y se
// informa aparte cuántos están así, que es lo que se puede arreglar cargando la
// ficha. Inventar un 1, o asumir 12, sería escribirle al proveedor un número que
// nadie verificó, y del lado de él eso llega como mercadería de más o de menos.
//
// Medido en producción el 2026-09-19: de los 1340 productos marcados pack o
// cajón, UNO no tiene factor útil. Sobre las líneas de pedido ya cargadas hay
// 316 de 2421 en BULTO cuyo producto no tiene factor mayor a 1.
//
// ── EL VOCABULARIO DEL PESO SALE DE TRANSFERENCIAS ────────────────────────
//
// `presentacionDeLinea`, en el detalle de una transferencia, resuelve esto
// mismo con cuatro palabras: Bulto, Unidad, Kg y Pieza. Acá se usa la unidad de
// medida del producto tal cual —`kg`— en vez de traducirla, porque en un
// mensaje a un proveedor "12 kg" se lee y "12 Kg de peso" no agrega nada.
//
// Módulo puro: sin Prisma y sin React, lo comparten el texto que se copia y el
// PDF. Escribirlo dos veces era garantizar que un día dijeran cosas distintas.

/** Las unidades de medida que agrupan varias unidades adentro. */
const AGRUPAN = new Set(["pack", "cajon"]);

/** La que ya viene suelta: un bulto de esto ES una unidad. */
const SUELTA = new Set(["unidad"]);

/** Las que se piden por peso y no por cuenta. */
const POR_PESO = new Set(["kg"]);

/** Formatea un número entero con el punto de miles de es-AR. */
function fmt(n) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(n);
}

/**
 * ¿Esta línea se puede expresar en unidades?
 *
 * Es la pregunta que separa "se escribe la conversión" de "se escribe el número
 * solo", y se exporta porque quien arma el documento necesita CONTAR los que no
 * se pueden, no descubrirlo leyendo el texto ya armado.
 */
export function tieneConversion({ unidad, unidadMedida, factorPack } = {}) {
  if (POR_PESO.has(unidadMedida)) return true;
  if (unidad !== "BULTO") return true;
  if (SUELTA.has(unidadMedida)) return true;
  if (AGRUPAN.has(unidadMedida)) return Number(factorPack) > 1;
  // Unidad de medida desconocida o sin cargar: NO se sabe si el bulto agrupa.
  return false;
}

/**
 * La cantidad, escrita para alguien que no conoce nuestro vocabulario.
 *
 * @param {object} linea
 * @param {number} linea.cantidad      cuánto se pide, en la unidad del pedido.
 * @param {string} linea.unidad        "BULTO" | "UNIDAD", la unidad del pedido.
 * @param {string} linea.unidadMedida  `unidad_medida` de la ficha del producto.
 * @param {number} linea.factorPack    cuántas unidades trae un bulto.
 * @returns {string}
 */
export function cantidadParaElProveedor({
  cantidad,
  unidad,
  unidadMedida,
  factorPack,
} = {}) {
  const cant = Number(cantidad) || 0;

  // Por peso: la unidad de medida ES la unidad, y el factor no aplica.
  if (POR_PESO.has(unidadMedida)) return `${fmt(cant)} ${unidadMedida}`;

  // Pedido por unidad suelta: no hay nada que convertir.
  if (unidad !== "BULTO") return `${fmt(cant)} ${cant === 1 ? "unidad" : "unidades"}`;

  const factor = Number(factorPack) || 0;

  // Pedido por bulto y el producto agrupa: la conversión completa.
  if (AGRUPAN.has(unidadMedida) && factor > 1) {
    const total = cant * factor;
    return `${fmt(cant)} × ${fmt(factor)} = ${fmt(total)} ${
      total === 1 ? "unidad" : "unidades"
    }`;
  }

  // Un producto cuya unidad de medida es "unidad" pedido por bulto se comporta
  // como unidad suelta: el bulto ES la unidad, así que decir "unidades" no
  // miente. Es el caso de 1493 de los 2936 productos.
  if (SUELTA.has(unidadMedida)) {
    return `${fmt(cant)} ${cant === 1 ? "unidad" : "unidades"}`;
  }

  // Agrupa sin factor, o la unidad de medida no está cargada. En los dos casos
  // no se sabe cuántas unidades hay adentro, así que va el número solo.
  //
  // Y el segundo caso NO se trata como "unidad": una ficha sin unidad de medida
  // puede ser un pack igual, y escribir "40 unidades" sobre 40 cajas de 24 es
  // pedir 960 y recibir 40. El silencio se corrige cargando la ficha; el número
  // inventado llega como mercadería.
  return fmt(cant);
}

/**
 * Cuántas líneas del pedido no se pudieron expresar en unidades.
 *
 * Va al pie del documento como una nota para ADENTRO, no para el proveedor: le
 * dice a quien manda el pedido qué fichas hay que completar. Sin esto, el
 * número solo se lee como un descuido del que lo escribió.
 */
export function lineasSinConversion(lineas = []) {
  return (Array.isArray(lineas) ? lineas : []).filter((l) => !tieneConversion(l)).length;
}
