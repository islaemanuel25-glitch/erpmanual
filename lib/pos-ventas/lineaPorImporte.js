// lib/pos-ventas/lineaPorImporte.js
//
// Lógica PURA de las líneas de PESO cargadas POR IMPORTE (el cajero escribe
// "$2.000" en vez de "0,235 kg"). Sin imports de servidor: la usan el POS, el
// carrito, los tickets, el backend de creación y el de corrección.
//
// EL PROBLEMA QUE RESUELVE
// ------------------------
// El peso derivado de un importe casi nunca es exacto: 2000 / 8500 = 0,235294…
// kg. La cantidad se cuantiza a 3 decimales (gramos) —lo hace el POS y lo hace
// la columna `VentaDetalle.cantidad Decimal(12,3)`—, así que reconstruir la
// plata como `precio × cantidad` devuelve 0,235 × 8500 = $1.997,50 y NO los
// $2.000 que tecleó el cajero. La pérdida es estructural: ningún redondeo la
// arregla, porque el importe original ya no está en ningún lado.
//
// LA REGLA
// --------
//   IMPORTE → PESO : manda el IMPORTE. El total de la línea es exactamente lo
//                    que se tecleó; el peso es un DERIVADO que sirve para
//                    descontar stock, mostrar, guardar y auditar.
//   PESO → IMPORTE : manda el PESO. Comportamiento actual intacto.
//
// Las dos se distinguen por un marcador EXPLÍCITO, `subtotalFijado`, no por
// comparar diferencias de pesos. Una línea con `subtotalFijado != null` nació de
// un importe; una sin él nació de un peso (o de una unidad, pack, bulto, etc.).
//
// DÓNDE VIVE EL IMPORTE
// ---------------------
// En vuelo: `subtotalFijado` en la línea del carrito y en el ítem del payload.
// En la base: la columna que YA existe, `VentaDetalle.subtotal`. No hace falta
// una columna nueva — el subtotal persistido ES el importe exacto, siempre que
// nadie lo reconstruya. Por eso este módulo expone `subtotalLinea()`: el único
// lugar donde se decide si el dinero de una línea se lee o se recalcula.

import { round2, aCentavos } from "./pagos.js";

/** Unidad de medida (ProductoBase.unidad_medida) de los productos por peso. */
export const UNIDAD_PESO = "kg";

/** Paso de cuantización de la cantidad: 1 gramo (Decimal(12,3) en la base). */
export const PASO_PESO_KG = 0.001;

/**
 * ¿Este producto se vende POR PESO y por lo tanto admite carga por importe?
 *
 * La unidad de medida del producto es la fuente, nunca su nombre. Excepción
 * deliberada: el fiambre de PIEZA FIJA en depósito tiene `unidad_medida = "kg"`
 * pero se vende y se cuenta por PIEZAS enteras — ahí un importe no define un
 * peso, así que no aplica. Mismo criterio que presentacionLinea().
 *
 * @param {object} base — { unidad_medida | unidadMedida, modoVentaDeposito, pesoReferenciaKg }
 * @param {{ esDeposito?: boolean }} ctx
 * @returns {boolean}
 */
export function esProductoPorPeso(base = {}, { esDeposito = false } = {}) {
  const um = String(base?.unidad_medida ?? base?.unidadMedida ?? "").toLowerCase();
  if (um !== UNIDAD_PESO) return false;
  const vendePorPieza =
    esDeposito === true &&
    String(base?.modoVentaDeposito ?? "") === "PIEZA" &&
    Number(base?.pesoReferenciaKg ?? 0) > 0;
  return !vendePorPieza;
}

/**
 * Peso derivado de un importe, cuantizado al gramo.
 * Devuelve null si no se puede derivar un peso vendible (>= 1 g).
 * @param {any} importe — lo que tecleó el cajero
 * @param {any} precioPorKg
 * @returns {number|null}
 */
export function pesoDesdeImporte(importe, precioPorKg) {
  const imp = Number(importe);
  const p = Number(precioPorKg);
  if (!Number.isFinite(imp) || !Number.isFinite(p)) return null;
  if (imp <= 0 || p <= 0) return null;
  const peso = Math.round((imp / p) * 1000) / 1000;
  return peso >= PASO_PESO_KG ? peso : null;
}

/**
 * Valida el importe tecleado por el cajero para una línea de peso.
 *
 * A diferencia del importe de un SERVICIO, acá se admiten centavos: el precio
 * por kilo puede tenerlos y el cajero podría querer cubrir un saldo exacto.
 * @param {any} raw
 * @returns {{ valido: boolean, importe: number, error: string|null }}
 */
export function validarSubtotalFijado(raw) {
  if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") {
    return { valido: false, importe: NaN, error: "Ingresá el importe." };
  }
  if (typeof raw === "object") {
    return { valido: false, importe: NaN, error: "Importe inválido." };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { valido: false, importe: NaN, error: "El importe debe ser un número válido." };
  }
  if (n <= 0) {
    return { valido: false, importe: NaN, error: "El importe debe ser mayor a cero." };
  }
  // La plata tiene 2 decimales: se normaliza a centavos enteros. El POS ya
  // muestra y envía el valor normalizado, así que lo cobrado, lo mostrado y lo
  // guardado son el mismo número.
  return { valido: true, importe: round2(n), error: null };
}

/**
 * ¿Esta línea nació de un IMPORTE? Marcador explícito, no inferencia.
 * @param {object} linea
 * @returns {boolean}
 */
export function esLineaPorImporte(linea) {
  const v = linea?.subtotalFijado;
  return v !== null && v !== undefined && Number.isFinite(Number(v));
}

/**
 * Dinero de una línea. ÚNICO punto de decisión del sistema:
 *   · nació de un importe → se DEVUELVE el importe, tal cual se tecleó;
 *   · nació de un peso/unidad/pack → se calcula precio × cantidad, como siempre.
 *
 * Todo lo que muestre, sume, envíe, guarde o imprima plata de una línea tiene que
 * pasar por acá. Si algún lugar vuelve a hacer `precio * cantidad` por su cuenta,
 * la línea por importe se rompe ahí y en ningún otro lado.
 *
 * @param {object} linea — { subtotalFijado?, precio, cantidad } o VentaDetalle { subtotal, ... }
 * @returns {number}
 */
export function subtotalLinea(linea = {}) {
  if (esLineaPorImporte(linea)) return round2(Number(linea.subtotalFijado));
  return round2(Number(linea?.precio ?? 0) * Number(linea?.cantidad ?? 0));
}

/**
 * Suma el dinero de varias líneas en CENTAVOS enteros (sin acumular floats).
 * @param {Array} lineas
 * @returns {number}
 */
export function sumarSubtotales(lineas) {
  if (!Array.isArray(lineas)) return 0;
  let cent = 0;
  for (const l of lineas) {
    const c = aCentavos(subtotalLinea(l));
    if (Number.isFinite(c)) cent += c;
  }
  return round2(cent / 100);
}

/**
 * Fusión de dos cargas del MISMO producto por peso en una sola línea de carrito.
 *
 * Si ninguna de las dos nació de un importe, la fusionada tampoco: se devuelve
 * null y la línea sigue siendo `precio × cantidad` (regla 6, el peso manda y no
 * se toca su comportamiento). Si alguna nació de un importe, el dinero de la
 * línea pasa a ser la SUMA de lo que mostró cada carga — que es lo que el cajero
 * vio y aceptó las dos veces.
 *
 * @param {object} existente
 * @param {object} agregada
 * @returns {number|null} nuevo subtotalFijado, o null si debe seguir derivándose
 */
export function combinarSubtotalFijado(existente, agregada) {
  if (!esLineaPorImporte(existente) && !esLineaPorImporte(agregada)) return null;
  const cent = aCentavos(subtotalLinea(existente)) + aCentavos(subtotalLinea(agregada));
  return round2(cent / 100);
}

/**
 * CORRECCIÓN de ventas: conserva el dinero de las líneas que el admin NO tocó.
 *
 * El editor de corrección reconstruye cada línea y el motor recalcula su subtotal
 * como precio × cantidad. Para una línea de peso cargada por importe eso volvería
 * a perder los $2.000 originales — corrigiendo el cliente de la venta se movería
 * el total. Acá se cierra: si la línea apunta al mismo VentaDetalle de origen y
 * NI la cantidad NI el precio cambiaron, se arrastra su subtotal guardado.
 *
 * Identidad, no tolerancia: se compara contra el detalle original por id, y solo
 * se preserva ante igualdad exacta. Si el admin edita el peso o el precio, la
 * línea vuelve a derivarse (regla 6: el peso manda) y el importe fijado se cae.
 *
 * Vale para cualquier línea, no solo las de peso: si una unidad quedó guardada
 * con un subtotal propio, corregir OTRA cosa no debe reescribirlo.
 *
 * @param {Array} lineas — líneas resueltas del editor (con origenDetalleId)
 * @param {Array} originales — VentaDetalle de la venta original
 * @returns {Array} las mismas líneas, con subtotalFijado donde corresponde
 */
export function preservarSubtotalOriginal(lineas, originales) {
  if (!Array.isArray(lineas)) return [];
  const porId = new Map();
  for (const o of Array.isArray(originales) ? originales : []) {
    if (o?.id != null) porId.set(Number(o.id), o);
  }
  if (porId.size === 0) return lineas;

  return lineas.map((l) => {
    const orig = l?.origenDetalleId != null ? porId.get(Number(l.origenDetalleId)) : null;
    if (!orig || orig.subtotal == null) return l;
    // Un servicio ya es server-authoritative por su propio importe base.
    if (l?.tipo === "SERVICIO") return l;
    const mismaCantidad =
      Math.round(Number(l?.cantidad) * 1000) === Math.round(Number(orig.cantidad) * 1000);
    const mismoPrecio = aCentavos(l?.precio) === aCentavos(orig.precio);
    if (!mismaCantidad || !mismoPrecio) return l;
    return { ...l, subtotalFijado: round2(Number(orig.subtotal)) };
  });
}
