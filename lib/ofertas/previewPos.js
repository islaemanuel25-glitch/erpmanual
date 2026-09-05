// lib/ofertas/previewPos.js
//
// EL TOTAL DE UN CARRITO PARA CADA MEDIO DE PAGO, ANTES DE ELEGIR NINGUNO.
//
// ── POR QUÉ ESTO EXISTE ─────────────────────────────────────────────────────
//
// Con ofertas y recargos el total DEJA DE SER UN NÚMERO. El mismo carrito vale
// $8.100 en efectivo y $9.450 con débito, y el cajero tiene que poder decirlo
// ANTES de tocar el botón, no después. Un panel que dice "Elegí cómo cobrar" con
// un solo número arriba está mintiendo en tres de los cuatro casos.
//
// ── LO QUE ESTE ARCHIVO NO HACE, Y ES LO MÁS IMPORTANTE ─────────────────────
//
// NO CALCULA NADA. No suma, no aplica un porcentaje, no decide si una oferta
// entra. Todo eso lo hace `calcularVentaComercial`, que es el motor comercial
// canónico y el MISMO que corre en `pos-ventas/crear`. Acá solo se lo llama una
// vez por medio y se ordena la salida.
//
// Esa es toda la gracia: una segunda matemática al lado del motor no se rompe el
// día que se escribe, se rompe el día que el motor cambia y ella no. Si mañana
// se agrega un escalón —un descuento nuevo, otra regla de oferta— el preview lo
// hereda sin que nadie se acuerde de venir hasta acá.
//
// ── EL BACKEND SIGUE MANDANDO ───────────────────────────────────────────────
//
// Esto es lo que se MUESTRA. Lo que se COBRA lo resuelve el servidor contra la
// base en el momento de registrar, y si los dos números difieren la venta se
// rechaza con `TOTAL_DESACTUALIZADO` en vez de registrar otro total en silencio.
// El preview puede quedar viejo —una oferta que venció entre que se cargó el
// carrito y se apretó cobrar— y eso está previsto: se refresca y se vuelve a
// confirmar.

import { calcularVentaComercial } from "./motorVenta.js";
import { MEDIOS_CON_RECARGO } from "@/lib/recargos-pago/recargoPago.js";

/**
 * Los medios que el panel de cobro ofrece como botón grande, en el orden en que
 * se dibujan. FIADO no está: no es una forma de cobrar sino una promesa de pago,
 * y su recargo se define recién cuando se cobra de verdad (ver `recargoPago.js`).
 */
export const MEDIOS_PREVIEW = MEDIOS_CON_RECARGO;

/** El medio del POS ("efectivo") al del enum de la base ("EFECTIVO"). */
export function aMedioEnum(medio) {
  return String(medio || "").toUpperCase();
}

/**
 * Una línea del carrito del POS, en la forma que come el motor.
 *
 * El precio normal sale de `item.precio`, que es lo que el POS viene mostrando
 * desde siempre: la lista del cliente, la escala bulto/unidad y el redondeo ya
 * están aplicados ahí por `pos-ventas/buscar-producto`. Este archivo no toca esa
 * cadena y no podría: el precio normal es de otro motor.
 */
function aLineaDelMotor(item) {
  return {
    productoLocalId: item?.productoLocalId ?? null,
    productoBaseId: item?.productoBaseId ?? null,
    nombre: item?.nombre ?? "",
    cantidad: Number(item?.cantidad) || 0,
    precioNormal: Number(item?.precio) || 0,
    esServicio: item?.esServicio === true,
    subtotalFijado: item?.subtotalFijado ?? null,
  };
}

/**
 * El mapa de ofertas que espera el motor, armado desde lo que cada línea del
 * carrito se trajo de la búsqueda.
 *
 * Una línea sin `productoLocalId` no puede tener oferta y se saltea: el motor
 * busca por ese id, y una clave `null` haría que TODAS las líneas sin id
 * compartieran la misma oferta. Es el tipo de error que da un precio equivocado
 * y no una excepción.
 */
export function ofertasDelCarrito(carrito = []) {
  const mapa = {};
  for (const item of Array.isArray(carrito) ? carrito : []) {
    const id = item?.productoLocalId;
    const oferta = item?.oferta;
    if (id == null || !oferta) continue;
    mapa[id] = {
      ofertaId: oferta.ofertaId,
      ofertaNombre: oferta.ofertaNombre,
      precioOferta: Number(oferta.precioOferta),
      condicionPago: oferta.condicionPago,
    };
  }
  return mapa;
}

/**
 * El resultado del motor para UN conjunto de medios.
 *
 * @param {object} args
 * @param {Array} args.carrito           `state.carrito` del POS
 * @param {Record<string,number>} args.recargosPorMedio  recargos del local
 * @param {string[]} args.medios         medios (en cualquier caja: se normalizan)
 * @param {{automaticoPct?:number, manual?:number, porPuntos?:number}} args.descuentos
 * @param {number} args.subtotalServicios
 */
export function totalParaMedios({
  carrito = [],
  recargosPorMedio = {},
  medios = [],
  descuentos = {},
  subtotalServicios = 0,
} = {}) {
  return calcularVentaComercial({
    lineas: (Array.isArray(carrito) ? carrito : []).map(aLineaDelMotor),
    ofertasPorProductoLocal: ofertasDelCarrito(carrito),
    mediosUsados: [...new Set(medios.map(aMedioEnum).filter(Boolean))],
    recargosPorMedio,
    descuentos,
    subtotalServicios,
  });
}

/**
 * EL TOTAL DE CADA BOTÓN DEL PANEL DE COBRO.
 *
 * Devuelve un objeto por medio del enum —EFECTIVO, DEBITO, CREDITO,
 * MERCADOPAGO— con lo que el cajero necesita ver, más `__paraMedios` para el
 * panel de "Dividir pago", donde el conjunto de medios lo arma la persona y no
 * se puede saber de antemano.
 *
 * Son cuatro corridas del motor sobre un carrito que en la práctica tiene menos
 * de veinte líneas: no hay nada que memorizar acá, y el día que lo haya, se mide
 * antes de cachear.
 *
 * @returns {Record<string, {medio, total, subtotal, descuentoPromocional,
 *   recargoPagoPct, recargoPagoImporte, hayOfertaSoloEfectivoNoAplicada}>}
 *   más `__paraMedios(medios[]) => resultado del motor`.
 */
export function totalesPorMedio({
  carrito = [],
  recargosPorMedio = {},
  descuentos = {},
  subtotalServicios = 0,
  // Los TIPOS CONTABLES que este local cobra. Desde que los medios son
  // configurables, no siempre son los cuatro: un local puede tener solo efectivo
  // y Mercado Pago, y calcular el total de un botón que no existe es trabajo
  // tirado y un número que alguien podría llegar a mostrar.
  //
  // Por defecto los cuatro de siempre, para que cualquier llamador que todavía
  // no pase la lista siga viendo lo mismo que veía.
  medios = MEDIOS_PREVIEW,
} = {}) {
  const comun = { carrito, recargosPorMedio, descuentos, subtotalServicios };
  const salida = {};

  for (const medio of medios) {
    const r = totalParaMedios({ ...comun, medios: [medio] });
    salida[medio] = {
      medio,
      total: r.total,
      subtotal: r.subtotal,
      subtotalNormal: r.subtotalNormal,
      descuentoPromocional: r.descuentoPromocional,
      descuentoTotal: r.descuentoTotal,
      totalAntesRecargo: r.totalAntesRecargo,
      recargoPagoPct: r.recargoPagoPct,
      recargoPagoImporte: r.recargoPagoImporte,
      hayOfertaSoloEfectivoNoAplicada: r.hayOfertaSoloEfectivoNoAplicada,
    };
  }

  // No enumerable: es una función de servicio para el panel dividido y no tiene
  // que aparecer cuando alguien recorre los medios para dibujar los botones.
  Object.defineProperty(salida, "__paraMedios", {
    value: (medios) => totalParaMedios({ ...comun, medios }),
    enumerable: false,
  });

  return salida;
}

/**
 * ¿HAY ALGUNA OFERTA EN EL CARRITO QUE SOLO VALGA PAGANDO EN EFECTIVO?
 *
 * Se pregunta al carrito y no al resultado del motor porque el aviso de pago
 * combinado tiene que aparecer ANTES de elegir los medios: en ese momento no hay
 * todavía un cálculo del que derivarlo.
 */
export function hayOfertaSoloEfectivoEnCarrito(carrito = []) {
  return (Array.isArray(carrito) ? carrito : []).some(
    (i) => i?.oferta?.condicionPago === "SOLO_EFECTIVO"
  );
}

/**
 * EL RENGLÓN DE LA LÍNEA DEL CARRITO.
 *
 * "Oferta efectivo $900" / "Oferta $900". Devuelve `null` cuando no hay nada que
 * decir, para que la pantalla no tenga que preguntar dos veces.
 *
 * NO reemplaza el precio normal de la línea, y es la decisión que se tomó:
 * mientras no se sepa cómo se va a pagar, el precio promocional es una
 * posibilidad y no un hecho. Prometerle $900 al cliente y cobrarle $1.000 porque
 * sacó la tarjeta es peor que no haberlo mostrado.
 */
export function textoOfertaDeLinea(item) {
  const oferta = item?.oferta;
  if (!oferta) return null;
  const precio = Number(oferta.precioOferta);
  if (!Number.isFinite(precio) || precio <= 0) return null;
  const soloEfectivo = oferta.condicionPago === "SOLO_EFECTIVO";
  return {
    etiqueta: soloEfectivo ? "Oferta efectivo" : "Oferta",
    precio,
    soloEfectivo,
    nombre: oferta.ofertaNombre || null,
  };
}
