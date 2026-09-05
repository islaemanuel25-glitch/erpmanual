// lib/ofertas/precio.js
//
// PRECIO DE OFERTA — UNA SOLA FUENTE DE VERDAD.
//
// La oferta se puede cargar de dos maneras: escribiendo el precio final ($900)
// o escribiendo el descuento (10 %). Se guarda UNA sola: `precioOferta`. El
// porcentaje se deriva cuando hace falta mostrarlo y NUNCA se persiste.
//
// POR QUÉ EL PRECIO Y NO EL PORCENTAJE. Porque el precio es lo que se cobra. Si
// se guardara el porcentaje, el precio de oferta se movería solo cada vez que
// cambia el precio normal del producto: subir la lista un 10 % correría también
// las ofertas vigentes, sin que nadie lo decida y sin que quede rastro. Al
// revés no pasa: guardado el precio, el porcentaje mostrado se recalcula contra
// `precioNormalReferencia`, que es un snapshot del momento en que se cargó o se
// revisó, y por eso tampoco se mueve solo.
//
// Guardar los dos sería el error que el proyecto ya pagó en otro lado: dos
// columnas que dicen lo mismo no se contradicen el día que se escriben, se
// contradicen el día que una de las dos se actualiza sola.

import { round2 } from "@/lib/pos-ventas/pagos.js";

/** Redondeo de porcentajes a 2 decimales (misma convención que el dinero). */
export function round2Pct(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return NaN;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

/**
 * Descuento equivalente, en %, de un precio de oferta contra el precio normal.
 * Es DERIVADO: se calcula para mostrar, no se guarda.
 * @returns {number|null} null si el precio normal no permite calcularlo.
 */
export function descuentoPctDesdePrecios(precioNormal, precioOferta) {
  const normal = Number(precioNormal);
  const oferta = Number(precioOferta);
  if (!Number.isFinite(normal) || !Number.isFinite(oferta)) return null;
  if (normal <= 0) return null;
  return round2Pct(((normal - oferta) / normal) * 100);
}

/**
 * Precio de oferta a partir de un descuento en %. Es la conversión que hace la
 * pantalla cuando la persona carga "10 %": se convierte ACÁ, al entrar, y lo que
 * se guarda es el precio resultante.
 * @returns {number|null}
 */
export function precioDesdeDescuentoPct(precioNormal, descuentoPct) {
  const normal = Number(precioNormal);
  const pct = Number(descuentoPct);
  if (!Number.isFinite(normal) || !Number.isFinite(pct)) return null;
  if (normal <= 0) return null;
  return round2(normal * (1 - pct / 100));
}

/** Importe descontado por unidad (precio normal − precio de oferta). */
export function descuentoUnitario(precioNormal, precioOferta) {
  const normal = Number(precioNormal);
  const oferta = Number(precioOferta);
  if (!Number.isFinite(normal) || !Number.isFinite(oferta)) return 0;
  return round2(Math.max(0, normal - oferta));
}

/**
 * Margen de la oferta contra un costo. Devuelve importe y porcentaje sobre el
 * precio de venta (misma base que usa el resto del sistema para hablar de
 * margen de una venta).
 * @returns {{importe:number, pct:number|null}}
 */
export function margenOferta(precioOferta, costo) {
  const precio = Number(precioOferta);
  const c = Number(costo);
  if (!Number.isFinite(precio) || !Number.isFinite(c)) {
    return { importe: 0, pct: null };
  }
  const importe = round2(precio - c);
  const pct = precio > 0 ? round2Pct((importe / precio) * 100) : null;
  return { importe, pct };
}

/** Límites de carga. El máximo evita un tipeo de "9000" en el campo de %. */
export const DESCUENTO_PCT_MIN = 0;
export const DESCUENTO_PCT_MAX = 100;

/**
 * Valida un precio de oferta contra el precio normal de referencia.
 *
 * NO rechaza un precio de oferta por debajo del costo: vender bajo costo es una
 * decisión comercial legítima (un líder de pérdida), y bloquearla sería que el
 * sistema opine sobre el negocio. Se informa el margen para que se vea, y se
 * deja pasar.
 *
 * @returns {{valido:true, precioOferta:number} | {valido:false, error:string}}
 */
export function validarPrecioOferta({ precioNormal, precioOferta }) {
  const normal = Number(precioNormal);
  const oferta = Number(precioOferta);

  if (!Number.isFinite(normal) || normal <= 0) {
    return { valido: false, error: "El producto no tiene un precio normal válido para ofertar." };
  }
  if (!Number.isFinite(oferta)) {
    return { valido: false, error: "El precio de oferta no es un número válido." };
  }
  if (oferta <= 0) {
    return { valido: false, error: "El precio de oferta debe ser mayor a 0." };
  }
  if (oferta >= normal) {
    return {
      valido: false,
      error: `El precio de oferta ($${round2(oferta)}) tiene que ser menor al precio normal ($${round2(normal)}).`,
    };
  }
  return { valido: true, precioOferta: round2(oferta) };
}

/**
 * Valida un descuento en % y lo convierte al precio que se va a guardar.
 * @returns {{valido:true, precioOferta:number} | {valido:false, error:string}}
 */
export function validarDescuentoPct({ precioNormal, descuentoPct }) {
  const pct = Number(descuentoPct);
  if (!Number.isFinite(pct)) {
    return { valido: false, error: "El descuento no es un número válido." };
  }
  if (pct <= DESCUENTO_PCT_MIN || pct >= DESCUENTO_PCT_MAX) {
    return {
      valido: false,
      error: `El descuento tiene que estar entre ${DESCUENTO_PCT_MIN} % y ${DESCUENTO_PCT_MAX} %, sin incluirlos.`,
    };
  }
  const precio = precioDesdeDescuentoPct(precioNormal, pct);
  if (precio == null) {
    return { valido: false, error: "El producto no tiene un precio normal válido para ofertar." };
  }
  return validarPrecioOferta({ precioNormal, precioOferta: precio });
}

/**
 * Normaliza la carga de una línea, venga por precio o por porcentaje. La
 * pantalla puede mandar cualquiera de los dos; ACÁ se decide cuál gana y qué se
 * guarda. Si vienen los dos, manda el precio: es la fuente canónica.
 *
 * @param {{precioNormal:number, precioOferta?:number|null, descuentoPct?:number|null}} entrada
 * @returns {{valido:true, precioOferta:number, descuentoPct:number} | {valido:false, error:string}}
 */
export function resolverCargaDeLinea({ precioNormal, precioOferta, descuentoPct }) {
  const tienePrecio = precioOferta != null && precioOferta !== "";
  const tienePct = descuentoPct != null && descuentoPct !== "";

  if (!tienePrecio && !tienePct) {
    return { valido: false, error: "Cargá el precio de oferta o el porcentaje de descuento." };
  }

  const res = tienePrecio
    ? validarPrecioOferta({ precioNormal, precioOferta })
    : validarDescuentoPct({ precioNormal, descuentoPct });

  if (!res.valido) return res;

  return {
    valido: true,
    precioOferta: res.precioOferta,
    descuentoPct: descuentoPctDesdePrecios(precioNormal, res.precioOferta),
  };
}
