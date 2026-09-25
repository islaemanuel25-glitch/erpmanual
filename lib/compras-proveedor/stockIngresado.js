// lib/compras-proveedor/stockIngresado.js
//
// EN QUÉ UNIDAD QUEDÓ CONTADO LO QUE UNA LÍNEA DE COMPRA SUMÓ AL STOCK.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// El cierre de una compra (`recibir/[id]`) suma un número a `StockLocal.cantidad`
// y ese número significa cosas distintas según la rama que lo calculó: unidades,
// kilos o piezas. Hasta acá eso vivía un instante adentro del cierre y después
// se perdía; para saber qué entró había que volver a preguntarle al producto de
// HOY, y el producto cambia.
//
// Ahora el cierre congela en la línea el número —`stockIngresado`, que es el
// mismo que pasó al `increment`— y esta unidad. La unidad sale de la MISMA
// pregunta que eligió la rama, con los mismos datos y en el mismo momento: no se
// deduce después del producto.
//
// ── LAS TRES RAMAS, Y SOLO TRES ─────────────────────────────────────────────
//
//   · La rama que NO es de peso suma unidades. Un pack o un cajón ya entran
//     multiplicados por su factor, así que tampoco son una unidad aparte.
//   · La rama de peso suma kilos…
//   · …salvo el fiambre de pieza fija que entra al DEPÓSITO, que suma piezas. Es
//     la misma condición con la que el cierre elige `cantRecibida` en vez de los
//     kilos: `esFiambreFijoEnUbicacion`.
//
// Módulo puro: sin Prisma y sin React.

import { esFiambreFijoEnUbicacion } from "../conversiones/stock.js";

/** Los valores del enum `UnidadFisicaStock` del esquema, y ningún otro. */
export const UNIDAD_FISICA_STOCK = Object.freeze({
  UNIDAD: "UNIDAD",
  KG: "KG",
  PIEZA: "PIEZA",
});

/**
 * La unidad de lo que suma una línea al stock.
 *
 * @param {object}  p
 * @param {boolean} p.vaPorPeso         la condición con la que el cierre entra a
 *                                      la rama de peso — la misma variable, no
 *                                      otra cuenta
 * @param {object}  p.base              el ProductoBase como lo leyó el cierre
 * @param {boolean} p.destinoEsDeposito si el stock entra al depósito
 * @returns {"UNIDAD"|"KG"|"PIEZA"}
 */
export function unidadFisicaDelIngreso({ vaPorPeso, base, destinoEsDeposito } = {}) {
  if (vaPorPeso !== true) return UNIDAD_FISICA_STOCK.UNIDAD;
  return esFiambreFijoEnUbicacion(base, destinoEsDeposito)
    ? UNIDAD_FISICA_STOCK.PIEZA
    : UNIDAD_FISICA_STOCK.KG;
}
