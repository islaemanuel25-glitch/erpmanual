// lib/productos/presentacionDeProducto.js
//
// UNA SOLA DEFINICIÓN DE EN QUÉ SE CUENTA UN PRODUCTO.
//
// ── POR QUÉ ESTO ES UN MÓDULO Y NO UNA FUNCIÓN ADENTRO DE UNA PANTALLA ────
//
// La pregunta "¿esto se cuenta en unidades, packs, cajones, kilos o piezas?" la
// hacen hoy al menos tres dominios: los comprobantes del POS, la transferencia
// entre locales y la recepción física. Cada uno la contestaba por su cuenta, y
// dos de esas respuestas eran distintas:
//
//   · `lib/pos-ventas/presentacionLinea.js` ya tenía la regla COMPLETA y bien:
//     PIEZA antes que kg, kg por `unidad_medida`, cajón distinguido de pack.
//   · `FichaProductoRecepcion.presentacionDelEnvio` tenía una versión pobre:
//     BULTO → "PACK xN", todo lo demás → "UNIDAD". Con eso un cajón se veía como
//     pack y un kilo como unidad.
//
// Así que la decisión se extrae acá y los dos la consumen. Cada uno conserva su
// VOCABULARIO —el ticket dice "Caja x8", la recepción dice "CAJÓN x8"— porque
// son públicos distintos, pero la decisión de QUÉ es, es una sola.
//
// ── EL ORDEN DE LAS PREGUNTAS NO ES ARBITRARIO ───────────────────────────
//
// PIEZA va ANTES que kg, y esto es lo que más veces se hace mal: el fiambre de
// pieza fija tiene `unidad_medida = "kg"` y aun así se cuenta y se despacha por
// PIEZAS. Preguntar por el kilo primero lo convertiría en un producto a granel y
// haría que "2 PIEZA" se mostrara como "2 KG", que son cosas distintas.
//
// ── LO QUE ACÁ NO SE HACE ────────────────────────────────────────────────
//
// Adivinar por el nombre del producto, por la categoría o por el local. La
// fuente es el dominio: `unidad_medida`, `factor_pack` y `modoVentaDeposito`.

/** Las cinco formas en que este ERP cuenta mercadería. */
export const PRESENTACION = Object.freeze({
  UNIDAD: "UNIDAD",
  PACK: "PACK",
  CAJON: "CAJON",
  KG: "KG",
  PIEZA: "PIEZA",
});

/** Un factor de agrupación sirve solo si es entero y mayor que uno. */
export function factorAgrupacion(f) {
  const n = Number(f);
  return Number.isInteger(n) && n > 1 ? n : null;
}

/** ¿Esta presentación junta varias unidades en un bulto? */
export function agrupa(presentacion) {
  return presentacion === PRESENTACION.PACK || presentacion === PRESENTACION.CAJON;
}

/**
 * EN QUÉ SE CUENTA ESTE PRODUCTO.
 *
 * @param {object} p
 * @param {string} p.unidadMedida        `ProductoBase.unidad_medida`: unidad|pack|cajon|kg
 * @param {number} p.factorPack          `ProductoBase.factor_pack`
 * @param {string} p.modoVentaDeposito   `ProductoBase.modoVentaDeposito`: PIEZA|PESO
 * @param {number} p.pesoReferenciaKg    `ProductoBase.pesoReferenciaKg`
 * @param {string} [p.contadoEn]         Cómo se contó ESTA operación, si se sabe:
 *   "BULTO" o "UNIDAD". Un producto que agrupa igual puede despacharse suelto, y
 *   en ese caso la presentación de la operación es UNIDAD aunque el producto sea
 *   un pack. Sin este dato manda lo que el producto es.
 *
 * @returns {{ presentacion: string, factor: number|null, pesoPiezaKg: number|null }}
 */
export function presentacionDeProducto({
  unidadMedida = null,
  factorPack = null,
  modoVentaDeposito = null,
  pesoReferenciaKg = null,
  contadoEn = null,
} = {}) {
  const um = String(unidadMedida ?? "").toLowerCase();
  const factor = factorAgrupacion(factorPack);
  const peso = Number(pesoReferenciaKg);

  // ── PIEZA PRIMERO. Ver el encabezado: el fiambre de pieza fija dice "kg" y se
  //    cuenta por piezas. Exige un peso de referencia porque sin él no se puede
  //    convertir a la escala del destino, y entonces no es una pieza fija.
  if (modoVentaDeposito === "PIEZA" && Number.isFinite(peso) && peso > 0) {
    return { presentacion: PRESENTACION.PIEZA, factor: null, pesoPiezaKg: peso };
  }

  // ── PESO. La unidad de medida manda; el nombre no se mira nunca.
  if (um === "kg") {
    return { presentacion: PRESENTACION.KG, factor: null, pesoPiezaKg: null };
  }

  // ── AGRUPADOS ───────────────────────────────────────────────────────────
  //
  // Hay DOS formas de saber que una salida agrupó, y las dos valen:
  //
  //   · el catálogo dice que el producto es un pack o un cajón;
  //   · la OPERACIÓN dice que se contó en bultos (`contadoEn === "BULTO"`).
  //
  // La segunda no es redundante: es lo único que tiene una línea vieja cuyo
  // producto ya no declara `unidad_medida`, o cuyo tipo cambió después. Ignorarla
  // convertía en "UNIDAD" a remitos que se habían contado en bultos, que es
  // justo la compatibilidad que hay que conservar.
  //
  // Y al revés: un cajón despachado POR UNIDADES es una salida en UNIDAD, no un
  // cajón fraccionado. Por eso `contadoEn === "UNIDAD"` gana sobre el catálogo.
  if (contadoEn === "UNIDAD") {
    return { presentacion: PRESENTACION.UNIDAD, factor: null, pesoPiezaKg: null };
  }

  const esAgrupado = um === "pack" || um === "cajon" || contadoEn === "BULTO";
  if (esAgrupado) {
    if (!factor) {
      // Agrupa, pero no se sabe con cuánto. No se inventa un factor: se afirma
      // lo único que se puede afirmar, que es una unidad.
      return { presentacion: PRESENTACION.UNIDAD, factor: null, pesoPiezaKg: null };
    }
    // El TIPO lo dice el catálogo. Sin catálogo, "pack" es el nombre neutro para
    // un bulto — es el mismo criterio que ya usa `presentacionLinea` del POS.
    const presentacion = um === "cajon" ? PRESENTACION.CAJON : PRESENTACION.PACK;
    return { presentacion, factor, pesoPiezaKg: null };
  }

  return { presentacion: PRESENTACION.UNIDAD, factor: null, pesoPiezaKg: null };
}
