// lib/stock/escalaFisica.js
//
// EN QUÉ UNIDAD ESTÁ CONTADA UNA FILA DE `StockLocal`, Y QUÉ NÚMERO ADMITE.
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
//
// El modal de ajuste decidía la unidad mirando solo `unidad_medida`, así que un
// producto de peso fijo en el depósito —QUETH CHISITOS 400G, guardado en
// PIEZAS— aparecía como "Stock actual: 6.000 kg" y pedía "Cantidad (kg)". La
// tarjeta y la tabla de Stock, en la misma pantalla, ya decían "6 pzs". El
// número guardado estaba bien: lo que mentía era el rótulo, y un rótulo que
// miente induce a escribir kilos en una fila de piezas.
//
// ── NO AGREGA CRITERIO ──────────────────────────────────────────────────────
//
// La unidad sale de `unidadFisicaDelIngreso`, que es la pregunta con la que el
// cierre de una compra decide si suma unidades, kilos o piezas. Acá la rama de
// peso es "se mide en kilos" —`seMideEnKilos`— y la pieza la decide
// `esFiambreFijoEnUbicacion`, el predicado único. No hay otra condición de pieza
// escrita en este archivo.
//
// Módulo puro: sin Prisma y sin React. Lo usan la pantalla y la ruta.

import { seMideEnKilos } from "../conversiones/stock.js";
import { UNIDAD_FISICA_STOCK, unidadFisicaDelIngreso } from "../compras-proveedor/stockIngresado.js";

export { UNIDAD_FISICA_STOCK };

/**
 * La unidad física de la fila de stock de este producto EN ESTA UBICACIÓN.
 *
 * @param {object}  base       ProductoBase (`unidad_medida`, `modoCompraProveedor`,
 *                             `pesoReferenciaKg`, `modoVentaDeposito`, `pesoEsFijo`)
 * @param {boolean} esDeposito si la ubicación es el depósito
 * @returns {"UNIDAD"|"KG"|"PIEZA"}
 */
export function unidadFisicaDeStock(base, esDeposito) {
  return unidadFisicaDelIngreso({
    vaPorPeso: seMideEnKilos(base),
    base,
    destinoEsDeposito: esDeposito === true,
  });
}

export const TEXTO_PIEZA_FRACCIONADA =
  "Las piezas del depósito no se fraccionan: ingresá un número entero de piezas.";

/**
 * Por qué esta cantidad no se puede escribir en una fila de esa unidad, o null.
 *
 * Solo la PIEZA exige un entero. Los kilos admiten decimales, y las unidades
 * conservan el comportamiento que ya tenían.
 */
export function motivoCantidadNoAdmitida(cantidad, unidadFisica) {
  if (unidadFisica === UNIDAD_FISICA_STOCK.PIEZA && !Number.isInteger(Number(cantidad))) {
    return TEXTO_PIEZA_FRACCIONADA;
  }
  return null;
}
