// lib/pedidos/reemplazoDeLinea.js
//
// EL PRODUCTO QUE VA EN LUGAR DEL PEDIDO, COMO LO MANDAN LAS RUTAS (2026-11-03).
//
// "Cambiar por otro" en preparar pedido: el local pidió Poett Verde, el
// depósito no lo tiene y manda Poett Rosa. La línea guarda los dos —lo pedido
// en `productoId`, lo que va en `reemplazoProductoId`— y las rutas del depósito
// (`detalle`, `detalle/editar`) mandan el que va como `reemplazo`, con los
// MISMOS nombres de campo que la línea: así la pantalla dice lo que va con las
// funciones de siempre sobre `{ ...linea, ...linea.reemplazo }`
// (`lineaDeLoQueVa`, `lib/pedidos/preparacionDelPedido.js`).
//
// Los campos del producto no se mapean acá: salen de `lineaDelPdf`, que ya
// arma esos nombres desde un `ProductoLocal` con su base.

import { lineaDelPdf } from "./pdfDelPedido.js";

/** El `include` del producto que va, con su base. */
export const INCLUDE_REEMPLAZO = Object.freeze({ reemplazo: { include: { base: true } } });

/**
 * El reemplazo de una línea de `PosTransferenciaDetalle` leída con
 * `INCLUDE_REEMPLAZO`, o `null` si va lo pedido.
 */
export function reemplazoDeLinea(d) {
  const pl = d?.reemplazo;
  if (!pl) return null;
  const { productoNombre, codigoBarra, unidadMedida, factorPack, esFiambre, modoVentaDeposito, pesoReferenciaKg, seCargaEnKilos } = lineaDelPdf({ producto: pl });
  return {
    productoLocalId: pl.id,
    baseId: pl.baseId,
    productoNombre,
    codigoBarra,
    unidadMedida,
    factorPack,
    esFiambre,
    modoVentaDeposito,
    pesoReferenciaKg,
    seCargaEnKilos,
  };
}
