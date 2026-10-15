// lib/compras-proveedor/compraPorCargar.js
//
// LA COMPRA POR CARGAR: un pago a proveedor hecho desde "Pagar" del POS cuya
// mercadería todavía no se recibió en Compras. Puro.
//
// ── NO ES UNA TABLA NUEVA, ES UNA COMPRA DE SIEMPRE ─────────────────────
//
// El pago del POS crea la compra que ya existe para "llegó algo sin pedido"
// —`PedidoProveedor` nacido de factura, en ENVIADO y vacío— y la paga por la
// puerta de Finanzas: `crearCuentaPorPagarDesdeCompra` con su pago inicial en
// efectivo, que pasa por `registrarPagoProveedor` y `resolverSalidaDelPago`.
// El vínculo pago ↔ compra es el que ya existe: `PagoProveedor` → cuenta →
// pedido. Ninguna migración.
//
// "Por cargar" no se guarda: es una compra ENVIADA que ya tiene un pago en
// efectivo de tipo Proveedor. Recibirla la deja RECIBIDA y sale sola de la
// lista; el pago ya hecho queda en su cuenta, así que la caja no se vuelve a
// descontar (ver `recibir/[id]` y `crearCuentaPorPagarDesdeCompra`).

import { aCentavos, desdeCentavos } from "../caja/efectivoEsperado.js";
import { TIPO_EGRESO } from "../caja/tipoEgreso.js";
import { formatearMoneda } from "../moneda.js";

/**
 * Lo que hace de un pedido uno "nacido de factura": ya en ENVIADO, con la marca.
 * Lo comparten "llegó algo sin pedido" (`compras-proveedor/crear`) y "Pagar" del
 * POS, para que las dos compras sean la misma cosa.
 */
export function datosDePedidoNacidoDeFactura(ahora = new Date()) {
  return { estado: "ENVIADO", fechaEnviado: ahora, nacidoDeFactura: true };
}

/** Las compras por cargar de una ubicación, como condición de Prisma. */
export function whereComprasPorCargar({ grupoId, localId }) {
  return {
    grupoId: Number(grupoId),
    creadoEnLocalId: Number(localId),
    estado: "ENVIADO",
    cuentaPorPagar: {
      pagos: { some: { cajaMovimiento: { tipoEgreso: TIPO_EGRESO.PROVEEDOR } } },
    },
  };
}

export const ESTADO_POR_CARGAR = "Pagado · falta cargar";

/**
 * LO QUE YA SE PAGÓ de una cuenta antes de recibir la compra, y cuánto queda.
 * Es la cuenta que dejó el POS; sin cuenta previa, nada.
 *
 * @param {{totalCentavos:number, pagos?:Array<{monto:any}>}} args
 * @returns {{ yaPagadoCentavos:number, saldoCentavos:number, excede:boolean }}
 */
export function loYaPagadoAlRecibir({ totalCentavos, pagos = [] } = {}) {
  const yaPagadoCentavos = (pagos || []).reduce((s, p) => s + aCentavos(p?.monto), 0);
  return {
    yaPagadoCentavos,
    saldoCentavos: Math.max(0, (totalCentavos || 0) - yaPagadoCentavos),
    excede: yaPagadoCentavos > (totalCentavos || 0),
  };
}

export function errorPagadoDeMas({ yaPagadoCentavos, totalCentavos }) {
  return `Desde la caja ya se pagaron ${formatearMoneda(desdeCentavos(yaPagadoCentavos))} y el total de la compra es ${formatearMoneda(desdeCentavos(totalCentavos))}.`;
}
