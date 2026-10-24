// LOS QUE BAJAN DE PRECIO: ANTES DE APLICAR Y AL REVISAR (Emanuel, 2026-10-24).
//
// Probando Dab: una baja se aplicaba igual que un aumento, en el mismo toque y
// sin que nada la distinguiera. Una lista que trae un costo más bajo que el de
// hoy casi siempre es una columna equivocada, un renglón mal vinculado o una
// presentación distinta — y un costo más bajo arrastra el precio de venta.
//
// Dos usos, una sola regla de qué es "bajar":
//
//   · ANTES DE APLICAR. Si entre lo que «✓ Aplicar» va a escribir hay alguno
//     que baja, se abre "Estos productos bajan de precio" con «Aplicar igual» y
//     «Volver», y no se escribe nada hasta «Aplicar igual». Sin bajas, aplicar
//     es lo de siempre. Lo que se aplica son las tarjetas «Cambian» de los DOS
//     paquetes: es lo que cuenta «Para aplicar» (`seVaAEscribir`).
//   · EN «PARA REVISAR». Una línea con "N bajan · M suben más de lo esperado",
//     y las tarjetas con las que bajan primero y las que suben de más después.
//
// "Bajar" es menos que el costo de hoy y por más de la tolerancia del mismo
// precio (`esMismoPrecio`, 0,1 %): un redondeo del proveedor no es una baja, y
// es la misma regla con la que la tarjeta dice «Mismo precio».
//
// Módulo puro: sin Prisma, sin React y sin red.

import { esMismoPrecio } from "./rangoAumento.js";
import { ESTADO_TU_PRODUCTO } from "./tusProductos.js";

export const TITULO_BAJAS = "Estos productos bajan de precio";
export const TEXTO_APLICAR_IGUAL = "Aplicar igual";

/** Qué abre «✓ Aplicar»: la hoja de las bajas o la confirmación de siempre. */
export const AL_APLICAR = Object.freeze({
  HOJA_BAJAS: "HOJA_BAJAS",
  CONFIRMAR: "CONFIRMAR",
});

/** Qué hace «Aplicar igual»: depende de dónde se abrió la hoja. */
export const DESPUES_DE_LAS_BAJAS = Object.freeze({
  /** Desde «✓ Aplicar» de la barra. */
  APLICAR: "APLICAR",
  /** Desde «✓ Aplicar y terminar» de "Te quedan precios sin aplicar". */
  APLICAR_Y_TERMINAR: "APLICAR_Y_TERMINAR",
});

function numero(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** La variación de una tarjeta: la que trae, o la cuenta entre los dos costos. */
function variacionDe(item) {
  const v = numero(item?.variacionPct);
  if (v !== null) return v;
  const hoy = numero(item?.costoHoy);
  const nuevo = numero(item?.costoNuevo);
  if (hoy === null || nuevo === null || hoy <= 0) return null;
  return ((nuevo - hoy) / hoy) * 100;
}

/** ¿Esta tarjeta baja de precio? Menos que hoy, y por más que un redondeo. */
export function bajaDePrecio(item) {
  if (numero(item?.costoNuevo) === null) return false;
  const v = variacionDe(item);
  return v !== null && v < 0 && !esMismoPrecio(v);
}

/** ¿Sube más de lo esperado para el proveedor? */
export function subeDeMas(item, rango) {
  const v = variacionDe(item);
  const max = numero(rango?.maxPct);
  return v !== null && max !== null && v > max && !esMismoPrecio(v);
}

/**
 * Lo que «✓ Aplicar» va a escribir y baja de precio, de los dos paquetes, de la
 * que más baja a la que menos.
 *
 * @param items  las tarjetas de los dos paquetes (`tusProductos.items` y
 *               `puedenSer.confirmados`)
 */
export function bajasAlAplicar(items) {
  const vistos = new Set();
  const bajas = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (it?.estado !== ESTADO_TU_PRODUCTO.CAMBIA || !bajaDePrecio(it)) continue;
    if (vistos.has(it.productoBaseId)) continue;
    vistos.add(it.productoBaseId);
    bajas.push({
      productoBaseId: it.productoBaseId,
      nombre: it.nombre,
      costoHoy: numero(it.costoHoy),
      costoNuevo: numero(it.costoNuevo),
      variacionPct: variacionDe(it),
    });
  }
  return bajas.sort((a, b) => a.variacionPct - b.variacionPct);
}

export function queAbreAlAplicar(bajas) {
  return Array.isArray(bajas) && bajas.length > 0 ? AL_APLICAR.HOJA_BAJAS : AL_APLICAR.CONFIRMAR;
}

/** Cuántas de «Para revisar» bajan y cuántas suben de más. */
export function resumenParaRevisar(items, rango) {
  let bajan = 0;
  let subenDeMas = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (bajaDePrecio(it)) bajan += 1;
    else if (subeDeMas(it, rango)) subenDeMas += 1;
  }
  return { bajan, subenDeMas };
}

/**
 * «Para revisar», ordenada: las que bajan primero (la que más baja arriba),
 * después las que suben de más (la que más sube arriba), y el resto como venía.
 */
export function ordenarParaRevisar(items, rango) {
  const lista = Array.isArray(items) ? items : [];
  const grupo = (it) => (bajaDePrecio(it) ? 0 : subeDeMas(it, rango) ? 1 : 2);
  return lista
    .map((it, i) => ({ it, i, g: grupo(it), v: variacionDe(it) }))
    .sort((a, b) => {
      if (a.g !== b.g) return a.g - b.g;
      if (a.g === 0) return a.v - b.v;
      if (a.g === 1) return b.v - a.v;
      return a.i - b.i;
    })
    .map((x) => x.it);
}

/** "2 bajan · 3 suben más de lo esperado", en dos partes para pintar la primera. */
export function textoResumenParaRevisar({ bajan = 0, subenDeMas = 0 } = {}) {
  return {
    bajan: `${bajan} ${bajan === 1 ? "baja" : "bajan"}`,
    subenDeMas: `${subenDeMas} ${subenDeMas === 1 ? "sube" : "suben"} más de lo esperado`,
  };
}
