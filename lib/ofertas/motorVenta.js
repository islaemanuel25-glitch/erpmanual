// lib/ofertas/motorVenta.js
//
// MOTOR COMERCIAL CANÓNICO DE UNA VENTA. Función pura, sin base ni red.
//
// Es el ÚNICO lugar donde se decide, en este orden y no en otro:
//
//    1-2. el precio normal de cada línea            → entra ya resuelto
//    3.   si hay oferta vigente para esa línea      → entra ya resuelta
//    4-5. si la condición de pago de la oferta se cumple
//    6.   qué precio se cobra en cada línea
//    7.   subtotal comercial
//    8.   descuentos existentes (cliente / manual / puntos)
//    9-10.recargo comercial del medio de pago (el MAYOR si hay varios)
//    11-12.total final
//
// Los pasos 13, 14 y 15 —tenders, comisión bancaria y persistencia— NO están
// acá y no es un olvido: la comisión bancaria se calcula sobre los tenders ya
// cerrados y es plata que sale del comercio, no del cliente. Mezclarla en este
// motor sería justo el error que el proyecto quiere evitar. Vive donde vivía,
// en `lib/pos-ventas/pagos.js`, y se aplica DESPUÉS de que este motor terminó.
//
// POR QUÉ LOS PRECIOS NORMALES ENTRAN RESUELTOS. Hoy el precio normal de una
// línea lo arma `pos-ventas/buscar-producto` con la lista del cliente, la escala
// bulto/unidad, el redondeo y el fiambre de pieza fija. Ese motor no se tocó en
// esta tanda: mover el cálculo del precio normal es cambiar qué plata se cobra
// en producción, y es una tanda propia. Lo que SÍ se resuelve server-side es la
// OFERTA, que es lo que se estaba pidiendo: el POS ya no puede inventar un
// precio promocional, porque el precio promocional lo pone este motor desde la
// fila de la oferta.

import { round2 } from "@/lib/pos-ventas/pagos.js";
import { cumpleCondicionPago } from "./vigencia.js";
import { recargoDeVenta, importeRecargo } from "@/lib/recargos-pago/recargoPago.js";

/**
 * Motivos por los que una oferta existía para el producto y aun así no se
 * aplicó. Se devuelven para que la pantalla pueda DECIRLO: una oferta que no
 * aplica en silencio es indistinguible de una oferta que no existe.
 */
export const OFERTA_NO_APLICADA = {
  REQUIERE_EFECTIVO: "REQUIERE_EFECTIVO",
  SERVICIO: "SERVICIO",
  LINEA_POR_IMPORTE: "LINEA_POR_IMPORTE",
};

/**
 * Texto de por qué no se aplicó. Vive acá para que el POS, el ticket y el
 * backend digan lo mismo.
 */
export const OFERTA_NO_APLICADA_TEXTO = {
  REQUIERE_EFECTIVO: "La oferta es solo para pago en efectivo.",
  SERVICIO: "Los servicios de importe variable no reciben ofertas.",
  LINEA_POR_IMPORTE: "La línea se cargó por importe y no admite oferta.",
};

function cantidadDe(linea) {
  const c = Number(linea?.cantidad);
  return Number.isFinite(c) && c > 0 ? c : 0;
}

/**
 * Subtotal de una línea. Respeta el importe fijado de las líneas de peso
 * cargadas por importe, igual que `lib/pos-ventas/lineaPorImporte.js`: esas no
 * se re-derivan del peso redondeado porque daría $1.997,50 donde el cajero
 * cobró $2.000.
 */
function subtotalDeLinea(linea, precioAplicado) {
  if (linea?.subtotalFijado != null) return round2(Number(linea.subtotalFijado));
  return round2(precioAplicado * cantidadDe(linea));
}

/**
 * Resuelve el precio de UNA línea contra su oferta.
 * @returns {{precio:number, oferta:object|null, motivo:string|null}}
 */
export function resolverLinea(linea, oferta, mediosUsados) {
  const precioNormal = round2(Number(linea?.precioNormal) || 0);

  if (!oferta) return { precio: precioNormal, oferta: null, motivo: null };

  // Un servicio de importe variable no recibe promociones. Es la regla que ya
  // regía para descuentos y puntos; una oferta no la puede saltear por ser nueva.
  if (linea?.esServicio === true) {
    return { precio: precioNormal, oferta: null, motivo: OFERTA_NO_APLICADA.SERVICIO };
  }

  // Línea de peso cargada por importe: el cajero fijó cuánta PLATA cobra, así
  // que un precio menor no baja el total, aumenta los gramos. El descuento
  // quedaría en cero pesos y el reporte de "descuento por ofertas" mentiría.
  // Para la v1 no se aplica, y se dice por qué en vez de callarlo.
  if (linea?.subtotalFijado != null) {
    return { precio: precioNormal, oferta: null, motivo: OFERTA_NO_APLICADA.LINEA_POR_IMPORTE };
  }

  if (!cumpleCondicionPago(oferta.condicionPago, mediosUsados)) {
    return { precio: precioNormal, oferta: null, motivo: OFERTA_NO_APLICADA.REQUIERE_EFECTIVO };
  }

  const precioOferta = round2(Number(oferta.precioOferta) || 0);
  // Una oferta que no baja el precio no se aplica: no tiene sentido registrar un
  // descuento de cero o negativo, y protege contra una fila mal cargada.
  if (!(precioOferta > 0) || precioOferta >= precioNormal) {
    return { precio: precioNormal, oferta: null, motivo: null };
  }

  return { precio: precioOferta, oferta, motivo: null };
}

/**
 * Motor comercial completo de una venta.
 *
 * @param {object} args
 * @param {Array} args.lineas
 *   [{ productoLocalId, productoBaseId, nombre, cantidad, precioNormal,
 *      esServicio?, subtotalFijado?, costoLinea? }]
 * @param {Record<number, {ofertaId, ofertaNombre, precioOferta, condicionPago}>} args.ofertasPorProductoLocal
 *   Ofertas YA filtradas por vigencia y local. Este motor no consulta nada.
 * @param {string[]} args.mediosUsados medios de la venta (enum MedioPago)
 * @param {Record<string, number>} args.recargosPorMedio
 * @param {{automaticoPct?:number, manual?:number, porPuntos?:number}} args.descuentos
 * @param {number} args.subtotalServicios importe de servicios (no elegible para descuentos)
 */
export function calcularVentaComercial({
  lineas = [],
  ofertasPorProductoLocal = {},
  mediosUsados = [],
  recargosPorMedio = {},
  descuentos = {},
  subtotalServicios = 0,
} = {}) {
  // ── Pasos 3 a 7: oferta por línea y subtotal comercial ────────────────────
  const lineasResueltas = [];
  let subtotalNormal = 0;
  let subtotalComercial = 0;

  for (const linea of lineas) {
    const oferta = ofertasPorProductoLocal?.[linea?.productoLocalId] ?? null;
    const { precio, oferta: aplicada, motivo } = resolverLinea(linea, oferta, mediosUsados);

    const precioNormal = round2(Number(linea?.precioNormal) || 0);
    const subtotal = subtotalDeLinea(linea, precio);
    const subtotalSinOferta = subtotalDeLinea(linea, precioNormal);

    subtotalNormal = round2(subtotalNormal + subtotalSinOferta);
    subtotalComercial = round2(subtotalComercial + subtotal);

    lineasResueltas.push({
      ...linea,
      precioNormal,
      precioAplicado: precio,
      subtotal,
      ofertaAplicada: aplicada != null,
      ofertaId: aplicada ? aplicada.ofertaId : null,
      ofertaNombre: aplicada ? aplicada.ofertaNombre : null,
      // Lo que el cliente dejó de pagar en ESTA línea por la oferta.
      descuentoPromocional: round2(subtotalSinOferta - subtotal),
      ofertaNoAplicada: motivo,
    });
  }

  const descuentoPromocional = round2(subtotalNormal - subtotalComercial);

  // ── Paso 8: descuentos existentes ─────────────────────────────────────────
  //
  // La base elegible sigue siendo mercadería (subtotal SIN servicios), igual que
  // hoy. Lo que cambia es que ahora esa base es la COMERCIAL: si una oferta ya
  // bajó la línea, el descuento del cliente se calcula sobre el precio con
  // oferta. Se apilan. Es lo que dice el orden acordado —la oferta es el paso 6
  // y los descuentos el 8— y significa que un cliente con 10 % sobre una oferta
  // de $900 paga $810, no $900 ni $890.
  const servicios = round2(Number(subtotalServicios) || 0);
  const baseElegibleDescuento = round2(Math.max(0, subtotalComercial - servicios));

  const automaticoPct = Number(descuentos?.automaticoPct) || 0;
  const descuentoAutomatico = round2((baseElegibleDescuento * automaticoPct) / 100);
  const descuentoManual = round2(Number(descuentos?.manual) || 0);
  const descuentoPorPuntos = round2(Number(descuentos?.porPuntos) || 0);
  const descuentoTotal = round2(descuentoAutomatico + descuentoManual + descuentoPorPuntos);

  const excedeDescuento =
    Math.round(descuentoTotal * 100) > Math.round(baseElegibleDescuento * 100) + 1;

  const totalAntesRecargo = round2(subtotalComercial - descuentoTotal);

  // ── Pasos 9 a 12: recargo comercial y total ───────────────────────────────
  const recargo = recargoDeVenta(mediosUsados, recargosPorMedio);
  const recargoPagoImporte = importeRecargo(totalAntesRecargo, recargo.pct);
  const total = round2(totalAntesRecargo + recargoPagoImporte);

  return {
    lineas: lineasResueltas,
    subtotalNormal,
    subtotal: subtotalComercial,
    descuentoPromocional,
    baseElegibleDescuento,
    descuentoAutomatico,
    descuentoManual,
    descuentoPorPuntos,
    descuentoTotal,
    excedeDescuento,
    totalAntesRecargo,
    recargoPagoPct: recargo.pct,
    recargoPagoMedio: recargo.medio,
    recargoPagoImporte,
    total,
    // ¿Había alguna oferta que no se aplicó por el medio de pago? El POS lo usa
    // para el aviso previo a confirmar.
    hayOfertaSoloEfectivoNoAplicada: lineasResueltas.some(
      (l) => l.ofertaNoAplicada === OFERTA_NO_APLICADA.REQUIERE_EFECTIVO
    ),
  };
}
