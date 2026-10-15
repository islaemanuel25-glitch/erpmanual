// lib/caja/tipoEgreso.js
//
// QUÉ SE PAGÓ CON UNA SALIDA DE CAJA, Y SI RESTA EN LA GANANCIA. Puro.
//
// ── DOS MIRADAS QUE NO SE MEZCLAN (regla de Emanuel, 2026-10-15) ─────────
//
//   · PLATA — caja, cierre, Tesorería: todo lo que sale del cajón resta igual,
//     sea del tipo que sea. Nada de este archivo entra al efectivo esperado: lo
//     calcula `calcularEfectivoEsperado` sobre los movimientos, sin mirar el tipo.
//   · GANANCIA — el resultado del turno: Sueldo y Gasto RESTAN. Proveedor y Al
//     depósito NO, porque es mercadería y su costo ya entra como costo de lo
//     vendido. El retiro del dueño NO es gasto.
//
// Un egreso SIN tipo (los anteriores a la columna, o un Caja − manual) no
// resta: un retiro no se trata como gasto sin saber qué fue. Se muestra "Sin
// clasificar" y quien tiene Finanzas le asigna el tipo.
//
// ── DE DÓNDE SALE EL TIPO ────────────────────────────────────────────────
//
// La columna `CajaMovimiento.tipoEgreso` manda. Si está vacía y el movimiento
// es de un pago —el vínculo lo dice, no el motivo—, el pago dice qué fue: un
// `PagoProveedor` es Proveedor, un `PagoGasto` es Gasto (o Sueldo si su
// categoría es Sueldos). Eso no es adivinar: es el mismo hecho guardado en la
// otra punta del vínculo. Un movimiento sin tipo y sin vínculo queda sin tipo.

import { CLASE_MOVIMIENTO } from "../finanzas/movimientosDeCaja.js";

export const TIPO_EGRESO = Object.freeze({
  PROVEEDOR: "PROVEEDOR",
  SUELDO: "SUELDO",
  GASTO: "GASTO",
  AL_DEPOSITO: "AL_DEPOSITO",
  RETIRO_DUENO: "RETIRO_DUENO",
});

/** En el orden en que se ofrecen en "Pagar" y al clasificar. */
export const TIPOS_EGRESO = Object.freeze([
  TIPO_EGRESO.PROVEEDOR,
  TIPO_EGRESO.SUELDO,
  TIPO_EGRESO.GASTO,
  TIPO_EGRESO.AL_DEPOSITO,
  TIPO_EGRESO.RETIRO_DUENO,
]);

export const esTipoEgreso = (t) => TIPOS_EGRESO.includes(t);

/** La categoría de gasto que hace de un gasto un sueldo. Viene de la migración de gastos. */
export const CATEGORIA_SUELDOS = "Sueldos";

/** La etiqueta corta, la del chip de la lista. */
export const ETIQUETA_TIPO_EGRESO = Object.freeze({
  [TIPO_EGRESO.PROVEEDOR]: "Proveedor",
  [TIPO_EGRESO.SUELDO]: "Sueldo",
  [TIPO_EGRESO.GASTO]: "Gasto",
  [TIPO_EGRESO.AL_DEPOSITO]: "Al depósito",
  [TIPO_EGRESO.RETIRO_DUENO]: "Retiro del dueño",
});
export const ETIQUETA_SIN_CLASIFICAR = "Sin clasificar";

/** La marca de cada egreso en la ganancia. */
export const MARCA_EGRESO = Object.freeze({
  RESTA: "RESTA",
  MERCADERIA: "MERCADERIA",
  DEL_DUENO: "DEL_DUENO",
  SIN_CLASIFICAR: "SIN_CLASIFICAR",
});

export const TEXTO_MARCA = Object.freeze({
  [MARCA_EGRESO.RESTA]: "Resta",
  [MARCA_EGRESO.MERCADERIA]: "Mercadería",
  [MARCA_EGRESO.DEL_DUENO]: "Del dueño",
  [MARCA_EGRESO.SIN_CLASIFICAR]: ETIQUETA_SIN_CLASIFICAR,
});

/** La marca de un tipo: qué le hace a la ganancia. Sin tipo, sin clasificar. */
export function marcaDeTipo(tipo) {
  switch (tipo) {
    case TIPO_EGRESO.SUELDO:
    case TIPO_EGRESO.GASTO:
      return MARCA_EGRESO.RESTA;
    case TIPO_EGRESO.PROVEEDOR:
    case TIPO_EGRESO.AL_DEPOSITO:
      return MARCA_EGRESO.MERCADERIA;
    case TIPO_EGRESO.RETIRO_DUENO:
      return MARCA_EGRESO.DEL_DUENO;
    default:
      return MARCA_EGRESO.SIN_CLASIFICAR;
  }
}

/** ¿Este tipo resta en la ganancia del turno? Solo sueldo y gasto. */
export const restaEnLaGanancia = (tipo) => marcaDeTipo(tipo) === MARCA_EGRESO.RESTA;

/**
 * EL TIPO DE UN GASTO pagado en efectivo: Sueldo si su categoría es Sueldos,
 * Gasto si no. Lo usa `registrarPagoGasto` al escribir el retiro.
 */
export function tipoDeGasto(categoriaNombre) {
  return String(categoriaNombre || "").trim() === CATEGORIA_SUELDOS ? TIPO_EGRESO.SUELDO : TIPO_EGRESO.GASTO;
}

/**
 * EL TIPO DE UN MOVIMIENTO YA CLASIFICADO (`clasificarMovimientos`): la columna,
 * o el que dice su pago; `null` si no se sabe. Las salidas que no son pagos
 * —arqueo y cierre— no tienen tipo: no son plata que se fue, es la recaudación
 * cambiando de lugar.
 *
 * @param {{tipoEgreso?:string|null, clase?:string, gastoCategoria?:string|null}} m
 * @returns {string|null}
 */
export function tipoDeEgreso(m) {
  if (!m) return null;
  if (m.clase === CLASE_MOVIMIENTO.RECAUDACION || m.clase === CLASE_MOVIMIENTO.CIERRE) return null;
  if (esTipoEgreso(m.tipoEgreso)) return m.tipoEgreso;
  if (m.clase === CLASE_MOVIMIENTO.PAGO_PROVEEDOR) return TIPO_EGRESO.PROVEEDOR;
  if (m.clase === CLASE_MOVIMIENTO.PAGO_GASTO) return tipoDeGasto(m.gastoCategoria);
  return null;
}

/** ¿Es un pago desde la caja? Todo RETIRO que no es arqueo ni cierre. */
export function esPagoDesdeCaja(m) {
  return m?.tipo === "RETIRO" && m.clase !== CLASE_MOVIMIENTO.RECAUDACION && m.clase !== CLASE_MOVIMIENTO.CIERRE;
}

/**
 * ¿Se le puede asignar el tipo a mano? Solo a un pago desde la caja que no
 * vino de un pago de Finanzas: el de un pago ya lo dice su vínculo.
 */
export function sePuedeClasificar(m) {
  return esPagoDesdeCaja(m) && m.clase === CLASE_MOVIMIENTO.MANUAL;
}
