// lib/finanzas/pagoADeposito.js
//
// EL "PAGO A DEPÓSITO" EN EL RESUMEN DE FINANZAS. Puro.
//
// ── QUÉ ES ───────────────────────────────────────────────────────────────
//
// La mercadería que un local recibe del depósito se considera pagada al
// depósito EL DÍA QUE EL LOCAL CONFIRMA LA RECEPCIÓN. Es una convención
// comercial del ERP para explicar el uso de la recaudación, no un movimiento de
// billetes: la entrega física del efectivo, cuando ocurra, es otra cosa y NO
// vuelve a pagar nada.
//
// ── DE DÓNDE SALE EL NÚMERO ──────────────────────────────────────────────
//
// De Transferencias, y de nada más: `resumenDePagoADeposito`
// (`lib/transferencias/cuentaDelPeriodoServer.js`), que es la cuenta del local
// en el criterio de recepción. Este archivo NO valoriza líneas, no consulta
// transferencias y no conoce precios: arma el contrato que viaja al teléfono
// con lo que Transferencias ya calculó, y decide dos cosas que son de Finanzas:
//
//   · si el concepto APLICA —el depósito no se paga a sí mismo—;
//   · y el enlace al detalle, que existe solo para quien puede abrir
//     Transferencias.
//
// ── LO QUE NO ENTRA, Y POR QUÉ ───────────────────────────────────────────
//
// Ni la venta interna del depósito —es otra valorización, y la saca de todo
// `whereVentaComercial`—, ni sus `VentaPago`, ni los movimientos de caja: un
// retiro de recaudación es efectivo cambiando de lugar, y un retiro manual no
// dice qué es. Su motivo es texto libre y no decide nada. Tampoco los Libros
// de Stock y de Costos, que valorizan stock con otra base y no son dinero.

import { CRITERIO_CUENTA } from "@/lib/transferencias/criterioDeCuenta";
import { urlDelTablero, VISTA_PENDIENTES } from "@/lib/transferencias/contextoDelTablero";

/** El criterio con el que Finanzas reconoce el pago. No se elige: es la regla. */
export const CRITERIO_PAGO_A_DEPOSITO = CRITERIO_CUENTA.RECEPCION;

/** El permiso que abre el detalle. Ver el importe es de `finanzas.ver`. */
export const PERMISO_VER_TRANSFERENCIAS = "transferencias.ver";

/**
 * EL ENLACE "VER": la cuenta del local en Transferencias, en el mismo período y
 * con el mismo criterio. Lo arma `urlDelTablero`, la puerta de ese módulo.
 *
 * ── A QUÉ PANTALLA LLEVA ─────────────────────────────────────────────────
 *
 * Quien mira desde el depósito —o un admin en vista global— abre la cuenta de
 * ESE local: `/modulos/transferencias/local/<id>`. Un local que mira lo suyo
 * abre su propia cuenta, `/modulos/transferencias/cuenta`, que el servidor
 * resuelve con su sesión: el enlace no puede apuntar a la cuenta de otro.
 *
 * ── EL DESPLAZAMIENTO VA SIEMPRE ─────────────────────────────────────────
 *
 * Finanzas abre en el período en curso (0) y Transferencias en el cerrado (−1).
 * `urlDelTablero` no escribe el valor por defecto de Transferencias, así que un
 * 0 de Finanzas viaja escrito y uno de −1 viaja como ausencia, que allá es −1.
 * Los dos llegan al mismo período.
 *
 * Sin permiso no hay enlace: `null`, y la pantalla no dibuja el "Ver". El
 * permiso igual lo vuelve a exigir la pantalla de destino y su ruta; esto es
 * para no ofrecer una puerta que da a un cartel de "sin permisos".
 */
export function enlaceDePagoADeposito({
  puedeVerTransferencias = false,
  unidad,
  desplazamiento,
  localDelEnlace = null,
} = {}) {
  if (!puedeVerTransferencias) return null;
  return urlDelTablero({
    unidad,
    desp: desplazamiento,
    local: localDelEnlace,
    criterio: CRITERIO_PAGO_A_DEPOSITO,
  });
}

/**
 * EL ENLACE "VER PENDIENTES": la MISMA cuenta por recepción, el mismo período y
 * el mismo local que el "Ver" de arriba, pero con la vista puesta en SOLO las
 * pendientes —las que salieron hasta el cierre y hoy siguen sin confirmar—.
 *
 * Es la misma puerta (`urlDelTablero`) y el mismo conjunto que Finanzas cuenta:
 * el tablero no recalcula nada, solo lista las pendientes que ya trae esa
 * cuenta. Por eso no puede mostrar otras que las informadas acá.
 *
 * No existe sin permiso —igual que el "Ver"— y la pantalla además solo lo
 * dibuja cuando hay pendientes: un enlace a una lista vacía no lleva a ningún
 * lado. Esa segunda condición la decide quien conoce la cantidad —el endpoint—,
 * no esta función, que solo arma la URL.
 */
export function enlacePendientesDePagoADeposito({
  puedeVerTransferencias = false,
  unidad,
  desplazamiento,
  localDelEnlace = null,
} = {}) {
  if (!puedeVerTransferencias) return null;
  return urlDelTablero({
    unidad,
    desp: desplazamiento,
    local: localDelEnlace,
    criterio: CRITERIO_PAGO_A_DEPOSITO,
    vista: VISTA_PENDIENTES,
  });
}

/**
 * EL CONTRATO QUE VIAJA EN `resumen.pagoADeposito`.
 *
 * Para el depósito `aplica: false` y los números en `null`, no en cero: un cero
 * diría que el depósito no se pagó nada, y lo que pasa es que el concepto no
 * existe para él.
 *
 * @param {object} args
 * @param {boolean} args.esDeposito   la ubicación CONSULTADA es el depósito
 * @param {object|null} args.cuenta   lo que devolvió `resumenDePagoADeposito`
 * @param {string|null} [args.verDetalle]  de `enlaceDePagoADeposito`
 */
export function armarPagoADeposito({
  esDeposito = false,
  cuenta = null,
  verDetalle = null,
  verPendientes = null,
} = {}) {
  if (esDeposito || !cuenta) {
    return {
      aplica: false,
      criterio: CRITERIO_PAGO_A_DEPOSITO,
      total: null,
      cantidadTransferencias: null,
      pendientes: null,
      verDetalle: null,
    };
  }
  const cantidadPendientes = cuenta.pendientes?.cantidadTransferencias ?? 0;
  return {
    aplica: true,
    criterio: CRITERIO_PAGO_A_DEPOSITO,
    total: cuenta.total,
    cantidadTransferencias: cuenta.cantidadTransferencias,
    // Informativas: NO están en `total` y no se descuentan de nada.
    pendientes: {
      total: cuenta.pendientes?.total ?? 0,
      cantidadTransferencias: cantidadPendientes,
      // El enlace a la lista de esas pendientes en Transferencias. Solo si hay
      // alguna: sin pendientes no hay a dónde ir. Sin permiso ya viene en `null`.
      verPendientes: cantidadPendientes > 0 ? verPendientes || null : null,
    },
    verDetalle: verDetalle || null,
  };
}
