// lib/compras-proveedor/pagoDelCierre.js
//
// CUÁNTO SE LE DEBE AL PROVEEDOR AL CERRAR LA COMPRA, Y QUÉ SE PAGA AHORA. Puro.
//
// Lo usan la hoja de cierre —para mostrar el total y el saldo— y la ruta
// `recibir/[id]` —para decidir qué escribe—. Es UNA regla con dos lectores: si
// la hoja la calculara por su lado, podría mostrar un total que el servidor no
// va a usar.
//
// Lo que NO hace: registrar el pago, validar el turno o tocar la caja. Todo eso
// es de Finanzas (`crearCuentaPorPagarDesdeCompra` → `registrarPagoProveedor`).
// Acá solo se arma el pedido que se le hace a esa capa.
//
// ── LA DEUDA ES LO QUE FACTURA EL PROVEEDOR ─────────────────────────────
//
// No la suma de los productos, no el costo interno, no `totalFactura` —que es
// una suma calculada del ERP y un control—. El pedido 245 lo muestra: los
// renglones valían $499.581,75 y el papel de Arcor imprime $511.968,28, porque
// abajo lleva la percepción de IVA. Se le debe lo segundo.
//
// Con varias facturas es la SUMA de sus totales impresos. Y si una sola no trae
// total —un remito, un papel SIN_TOTAL, uno sin leer—, el total del cierre no se
// conoce: sumar las que sí lo traen daría una deuda corta, y completar con los
// productos sería inventar el número que el lector ya se negó a inventar. Ahí
// la persona lo tiene que escribir y confirmar.

import { aCentavos, desdeCentavos } from "@/lib/caja/efectivoEsperado";
import {
  ERROR_MEDIO_INVALIDO,
  ESTADO_CUENTA,
  ROTULO_ESTADO_CUENTA,
  esMedioPagoProveedor,
  leerImporte,
  medioTocaLaCaja,
} from "@/lib/finanzas/pagosProveedores";

/** Cómo queda el pago al cerrar. Son los MISMOS tres estados de la cuenta. */
export const ESTADO_PAGO_CIERRE = ESTADO_CUENTA;
export const ESTADOS_PAGO_CIERRE = Object.freeze([
  ESTADO_CUENTA.PAGADA,
  ESTADO_CUENTA.PARCIAL,
  ESTADO_CUENTA.PENDIENTE,
]);
export const ROTULO_ESTADO_PAGO_CIERRE = ROTULO_ESTADO_CUENTA;

/** Solo pendiente no saca plata, y por eso solo pendiente no pide permiso financiero. */
export function estadoSacaPlata(estado) {
  return estado === ESTADO_CUENTA.PARCIAL || estado === ESTADO_CUENTA.PAGADA;
}

export const ERROR_FALTA_TOTAL =
  "Alguna factura de este pedido no trae total impreso: escribí el total a pagar al proveedor y confirmalo.";
export const ERROR_TOTAL_NO_CONFIRMADO = "Confirmá el total a pagar al proveedor antes de cerrar.";
export const ERROR_TOTAL_DISTINTO_DE_LA_FACTURA =
  "El total a pagar no coincide con lo que facturó el proveedor. Recargá la pantalla y volvé a cerrar.";
export const ERROR_ESTADO_PAGO = "Elegí cómo queda el pago: pagada, parcial o pendiente.";
export const ERROR_PARCIAL_FUERA_DE_RANGO =
  "En un pago parcial, lo que se paga ahora tiene que ser mayor a cero y menor al total.";
export const ERROR_PAGADA_NO_CUBRE = "Para dejarla pagada, el pago tiene que cubrir el total completo.";

/**
 * EL TOTAL IMPRESO DE TODAS LAS FACTURAS DEL CIERRE, o que no se conoce.
 *
 * @param {Array<number|string|null>} totales el `totalLeido` de cada comprobante
 *        del pedido que no está anulado, uno por comprobante.
 * @returns {{ completo: boolean, total: number|null, sumaConocida: number|null, cantidad: number }}
 *   `total` solo cuando TODAS lo traen; `sumaConocida` es lo que suman las que
 *   sí, para ayudar a escribirlo, y nunca se usa como deuda.
 */
export function totalDeLasFacturasDelCierre(totales = []) {
  const lista = Array.isArray(totales) ? totales : [];
  const conocidos = lista.filter((v) => v != null && v !== "" && Number.isFinite(Number(v)));
  const sumaC = conocidos.reduce((a, v) => a + aCentavos(v), 0);
  const completo = lista.length > 0 && conocidos.length === lista.length;
  return {
    completo,
    total: completo ? desdeCentavos(sumaC) : null,
    sumaConocida: conocidos.length ? desdeCentavos(sumaC) : null,
    cantidad: lista.length,
  };
}

/**
 * EL TOTAL DE LA DEUDA, o por qué no se puede cerrar todavía.
 *
 *   · Si las facturas lo traen todo, manda la factura. Si además vino un total
 *     confirmado y no coincide, se frena: la pantalla estaba mirando otra cosa.
 *   · Si no, hace falta `totalConfirmado` —escrito por la persona— Y la marca
 *     `confirmado`. Un número sin confirmar no se toma: el campo existe para
 *     que alguien lo mire contra el papel, no para que viaje un valor por
 *     omisión.
 *
 * @returns {{ centavos:number, desdeLaFactura:boolean } | { error:string, pideTotal:boolean }}
 */
export function resolverTotalDelCierre({ totales = [], totalConfirmado = null, confirmado = false } = {}) {
  const facturas = totalDeLasFacturasDelCierre(totales);
  const escrito = totalConfirmado === null || totalConfirmado === undefined || totalConfirmado === ""
    ? null
    : leerImporte(totalConfirmado);

  if (facturas.completo) {
    const deLaFactura = aCentavos(facturas.total);
    if (deLaFactura <= 0) return { error: ERROR_FALTA_TOTAL, pideTotal: true };
    if (escrito && !escrito.error && escrito.centavos !== deLaFactura) {
      return { error: ERROR_TOTAL_DISTINTO_DE_LA_FACTURA, pideTotal: false };
    }
    return { centavos: deLaFactura, desdeLaFactura: true };
  }

  if (!escrito) return { error: ERROR_FALTA_TOTAL, pideTotal: true };
  if (escrito.error) return { error: escrito.error, pideTotal: true };
  if (confirmado !== true) return { error: ERROR_TOTAL_NO_CONFIRMADO, pideTotal: true };
  return { centavos: escrito.centavos, desdeLaFactura: false };
}

/**
 * QUÉ SE LE PIDE A FINANZAS: el pago inicial, o ninguno.
 *
 * El medio, el origen y el turno solo se exigen PRESENTES acá; que el turno esté
 * abierto, que el origen sea del grupo y que el efectivo salga de ese cajón lo
 * decide `registrarPagoProveedor`, que es la única que sabe hacerlo.
 *
 * @param {object} args
 * @param {string} args.estado  PAGADA | PARCIAL | PENDIENTE
 * @param {number} args.totalCentavos  el de `resolverTotalDelCierre`
 * @param {object} [args.pago]  { monto, medio, turnoId }
 * @returns {{ pagoInicial: null | { monto:number, medio:string, turnoId:number|null } } | { error:string }}
 */
export function planDelPagoInicial({ estado, totalCentavos, pago = null } = {}) {
  if (!ESTADOS_PAGO_CIERRE.includes(estado)) return { error: ERROR_ESTADO_PAGO };
  if (estado === ESTADO_CUENTA.PENDIENTE) return { pagoInicial: null };

  if (!esMedioPagoProveedor(pago?.medio)) return { error: ERROR_MEDIO_INVALIDO };

  let centavos;
  if (estado === ESTADO_CUENTA.PAGADA) {
    // Pagada es el total: si la pantalla manda un monto, tiene que ser ése.
    if (pago?.monto !== undefined && pago?.monto !== null && pago?.monto !== "") {
      const leido = leerImporte(pago.monto);
      if (leido.error || leido.centavos !== totalCentavos) return { error: ERROR_PAGADA_NO_CUBRE };
    }
    centavos = totalCentavos;
  } else {
    const leido = leerImporte(pago?.monto);
    if (leido.error || leido.centavos >= totalCentavos) return { error: ERROR_PARCIAL_FUERA_DE_RANGO };
    centavos = leido.centavos;
  }

  const turno = pago?.turnoId === null || pago?.turnoId === undefined || pago?.turnoId === ""
    ? null
    : Number(pago.turnoId);

  return { pagoInicial: { monto: desdeCentavos(centavos), medio: pago.medio, turnoId: turno } };
}

/** El saldo que queda después del pago de ahora, para mostrarlo antes de cerrar. */
export function saldoDespuesDelCierre({ totalCentavos, pagoCentavos = 0 } = {}) {
  return desdeCentavos(Math.max(0, (totalCentavos || 0) - (pagoCentavos || 0)));
}

// El origen no se elige —es la ubicación dueña del pedido—: esto solo aparece
// si la pantalla no la recibió.
export const ERROR_FALTA_ORIGEN =
  "No se pudo determinar la ubicación que paga. Recargá la pantalla y volvé a intentar.";
export const ERROR_FALTA_TURNO = "Elegí el turno de caja del que sale el efectivo.";

/**
 * ¿LA HOJA PUEDE CONFIRMAR? Y si puede, qué muestra y qué manda.
 *
 * Pasa por `resolverTotalDelCierre` y `planDelPagoInicial`, las dos que usa el
 * servidor, así que lo que la hoja deja confirmar es lo que el servidor acepta.
 * Agrega solo lo que el servidor resuelve de otro modo: que haya un origen
 * elegido y, en efectivo, un turno.
 *
 * @returns {{ listo:boolean, error:string|null, totalCentavos:number|null,
 *            total:number|null, saldo:number|null, pideTotal:boolean }}
 */
export function pagoDelCierreEnPantalla({
  totales = [],
  totalEscrito = "",
  totalConfirmado = false,
  estado = null,
  pago = {},
} = {}) {
  const deuda = resolverTotalDelCierre({
    totales,
    totalConfirmado: totalEscrito,
    confirmado: totalConfirmado,
  });
  const pideTotal = !totalDeLasFacturasDelCierre(totales).completo;
  if (deuda.error) {
    // Un total escrito pero sin confirmar igual se muestra: la persona tiene que
    // ver lo que está por confirmar.
    const escrito = pideTotal ? leerImporte(totalEscrito) : { error: true };
    const total = escrito.error ? null : desdeCentavos(escrito.centavos);
    return { listo: false, error: deuda.error, totalCentavos: null, total, saldo: total, pideTotal };
  }

  const total = desdeCentavos(deuda.centavos);
  const plan = planDelPagoInicial({ estado, totalCentavos: deuda.centavos, pago });
  if (plan.error) {
    return { listo: false, error: plan.error, totalCentavos: deuda.centavos, total, saldo: null, pideTotal };
  }

  const pagoCentavos = plan.pagoInicial ? aCentavos(plan.pagoInicial.monto) : 0;
  const saldo = saldoDespuesDelCierre({ totalCentavos: deuda.centavos, pagoCentavos });
  if (plan.pagoInicial) {
    if (!pago?.localOrigenId) {
      return { listo: false, error: ERROR_FALTA_ORIGEN, totalCentavos: deuda.centavos, total, saldo, pideTotal };
    }
    if (medioTocaLaCaja(plan.pagoInicial.medio) && !plan.pagoInicial.turnoId) {
      return { listo: false, error: ERROR_FALTA_TURNO, totalCentavos: deuda.centavos, total, saldo, pideTotal };
    }
  }
  return { listo: true, error: null, totalCentavos: deuda.centavos, total, saldo, pideTotal };
}
