// lib/pos-ventas/presentacionLinea.js
//
// Presentación comercial de una línea de venta para COMPROBANTES: la etiqueta
// corta que va en la columna "Presentación" y el formato de la cantidad con su
// unidad. Helper ÚNICO: lo usa generarTicketPDF y cualquier otro comprobante.
//
// No infiere nada del nombre del producto ni recalcula importes: se apoya solo en
// el descriptor `deposito` que ya arma el endpoint del detalle
// (lib/reportes-ventas/modoLineaDeposito.js) y en el flag esServicio.
//
// Campos que consume del descriptor:
//   modo          "PACK" | "UNIDAD" | "PIEZA" | null
//   factorPack    entero >= 1
//   unidadMedida  "unidad" | "pack" | "cajon" | "kg" | null   (ProductoBase)
//
// Sin datos suficientes → presentación NEUTRA (etiqueta "—", cantidad sin unidad).
// Nunca se asume "Unidad" cuando podría ser peso.

const UNIDAD_KG = "kg";
const UNIDAD_CAJON = "cajon";
const UNIDAD_PACK = "pack";
const UNIDAD_UNIDAD = "unidad";

/** Factor de pack válido (> 1). Devuelve null si falta o no sirve. */
function factorValido(f) {
  const n = Number(f);
  return Number.isInteger(n) && n > 1 ? n : null;
}

/**
 * Etiqueta de presentación + unidad de cantidad de una línea.
 * @returns {{ etiqueta: string, unidad: "kg"|"pz"|"pack"|"u"|null }}
 */
export function presentacionLinea(linea = {}) {
  if (linea.esServicio) return { etiqueta: "Servicio", unidad: null };

  const dep = linea.deposito || null;
  if (!dep) return { etiqueta: "—", unidad: null };

  const modo = dep.modo || null;
  const um = dep.unidadMedida || null;
  const factor = factorValido(dep.factorPack);

  // PIEZA antes que kg: el fiambre de pieza fija tiene unidad_medida "kg" pero se
  // vende y se cuenta por piezas.
  if (modo === "PIEZA") return { etiqueta: "Pieza", unidad: "pz" };

  // Peso: la unidad de medida del producto es la fuente, no el nombre.
  if (um === UNIDAD_KG) return { etiqueta: "Kg", unidad: "kg" };

  if (modo === "PACK") {
    // "Caja xN" solo cuando el producto realmente es un cajón. No hay campo que
    // distinga "Bulto" de "Pack", así que Pack es el fallback neutral.
    const base = um === UNIDAD_CAJON ? "Caja" : "Pack";
    return { etiqueta: factor ? `${base} x${factor}` : base, unidad: "pack" };
  }

  if (modo === "UNIDAD") return { etiqueta: "Unidad", unidad: "u" };

  // Sin modo (venta que no es de depósito, o producto sin dos modalidades): la
  // unidad de medida alcanza para unidades sueltas.
  if (um === UNIDAD_UNIDAD || um === UNIDAD_PACK) return { etiqueta: "Unidad", unidad: "u" };

  return { etiqueta: "—", unidad: null };
}

/**
 * Formatea una cantidad en es-AR según la unidad de la presentación.
 *
 *   kg   → hasta 3 decimales; entero sin decimales, fraccionario con los 3
 *          ("1 kg", "1,920 kg", "3,285 kg")
 *   pz   → "1 pz", "4 pz"
 *   pack → "1 pack", "3 packs"
 *   u    → "3 u"
 *   null → solo el número, sin unidad (presentación neutra / servicio)
 *
 * Enteros nunca muestran decimales (no "3,000"). Las fracciones legítimas en
 * unidades discretas conservan hasta 3 decimales.
 */
export function formatCantidadPresentacion(cantidad, unidad) {
  const n = Number(cantidad);
  if (!Number.isFinite(n)) return unidad ? `0 ${unidad}` : "0";
  const entero = Number.isInteger(n);

  let num;
  if (unidad === "kg") {
    // Peso: si tiene parte fraccionaria se muestran los 3 decimales (1,920).
    num = entero
      ? n.toLocaleString("es-AR")
      : n.toLocaleString("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  } else {
    num = entero
      ? n.toLocaleString("es-AR")
      : n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
  }

  if (!unidad) return num;
  if (unidad === "pack") return `${num} ${entero && n === 1 ? "pack" : "packs"}`;
  return `${num} ${unidad}`;
}

/** Atajo: presentación + cantidad ya formateada de una línea. */
export function cantidadDeLinea(linea = {}) {
  const { unidad } = presentacionLinea(linea);
  return formatCantidadPresentacion(linea.cantidad, unidad);
}
