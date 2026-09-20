// EL ESTADO DE UNA LÍNEA DE FACTURA CONTRA LA LÍNEA DEL PEDIDO.
//
// ── DE DÓNDE SALE ─────────────────────────────────────────────────────────
//
// De `lib/transferencias/controlFisico.js`, que hace lo mismo para la recepción
// de una transferencia: estados derivados de comparar lo esperado contra lo que
// llegó, y un predicado por filtro. Ese módulo es lógica pura sobre un par de
// números y por eso se pudo adaptar en vez de escribir uno nuevo.
//
// Lo que cambia son dos cosas, y las dos importan:
//
//   1. EL VOCABULARIO. Allá el universo es "el remito" y acá es "la factura".
//      Un remito interno lo escribe el depósito y nunca trae un producto que no
//      se pidió; una factura sí, y seguido.
//
//   2. EL EJE DEL PRECIO. Una transferencia se mueve entre dos locales del
//      mismo grupo y el precio ya está fijado: su recepción solo cuenta bultos.
//      Una factura puede traer el mismo producto a otro precio, y eso es una
//      diferencia tan revisable como que falte una caja. Por eso acá una línea
//      puede estar para revisar SIN que la cantidad difiera.
//
// ── POR QUÉ NO HAY "PENDIENTE" NI "REVISADO" ──────────────────────────────
//
// En transferencias los hay porque existe `revisadoEnRecepcion`: una columna que
// alguien marca al contar. En compras no existe esa marca y esta tanda no la
// agrega — agregarla sería decidir que recibir un pedido es un control físico
// línea por línea, que es justamente lo que la tanda siguiente va a discutir
// cuando toque las validaciones del cierre.
//
// Así que los estados salen ENTEROS de comparar, y son los cuatro casos que el
// diseño nombra: coincide, cambió el precio, vino menos, no estaba en el pedido.
//
// Módulo puro: sin React y sin Prisma.

/** Los estados de una línea. De acá salen la caja de la derecha y los filtros. */
export const ESTADO_LINEA = Object.freeze({
  /** Cantidad y precio coinciden con lo pedido. */
  COINCIDE: "coincide",
  /** La cantidad coincide pero el precio cambió. */
  PRECIO_DISTINTO: "precioDistinto",
  /** Vino menos de lo pedido. */
  FALTA: "falta",
  /** Vino más de lo pedido. */
  SOBRA: "sobra",
  /** El proveedor facturó algo que no estaba en el pedido. */
  NO_PEDIDO: "noPedido",
});

/** Los filtros de la pantalla. Cada uno es un predicado sobre el estado. */
export const FILTRO = Object.freeze({
  TODOS: "todos",
  REVISAR: "revisar",
  COINCIDEN: "coinciden",
  NO_PEDIDOS: "noPedidos",
});

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * ¿El precio de la factura difiere del que tenía el pedido?
 *
 * Se compara contra el costo de la LÍNEA DEL PEDIDO y no contra el del
 * catálogo: es el precio al que se pidió, que es lo que alguien acordó. El del
 * catálogo pudo moverse por otra compra entre medio.
 *
 * La tolerancia es de un centavo y no cero: los dos números pasan por
 * conversiones de escala —de bulto a unidad y al revés— y una diferencia de
 * redondeo no es un precio nuevo.
 */
export function precioCambio(fila) {
  const factura = num(fila?.costoFactura);
  const pedido = num(fila?.costoCatalogo);
  if (factura === null || pedido === null) return false;
  return Math.abs(factura - pedido) > 0.01;
}

/** Cuánto cambió, en porcentaje. `null` cuando no hay con qué comparar. */
export function porcentajeDelPrecio(fila) {
  const factura = num(fila?.costoFactura);
  const pedido = num(fila?.costoCatalogo);
  if (factura === null || pedido === null || pedido === 0) return null;
  return ((factura - pedido) / pedido) * 100;
}

/** Cuántas unidades faltan respecto de lo pedido. Negativo = sobran. */
export function diferenciaDeCantidad(fila) {
  const facturada = num(fila?.cantidad);
  const pedida = num(fila?.cantidadPedida);
  if (facturada === null || pedida === null) return null;
  return pedida - facturada;
}

/**
 * EL ESTADO DE UNA LÍNEA. De acá salen la caja de la derecha Y el filtro.
 *
 * El orden de las preguntas importa, igual que en transferencias: primero la
 * PROCEDENCIA. Una línea que no estaba en el pedido no es "un sobrante" — no
 * hay nada con qué compararla, así que no pertenece a ninguna de las otras
 * categorías y va aparte.
 */
export function estadoDeLinea(fila = {}) {
  if (fila?.pedidoDetalleId == null) return ESTADO_LINEA.NO_PEDIDO;

  const dif = diferenciaDeCantidad(fila);
  if (dif !== null && dif > 0) return ESTADO_LINEA.FALTA;
  if (dif !== null && dif < 0) return ESTADO_LINEA.SOBRA;

  // La cantidad coincide. Queda el otro eje, que en transferencias no existe.
  if (precioCambio(fila)) return ESTADO_LINEA.PRECIO_DISTINTO;

  return ESTADO_LINEA.COINCIDE;
}

/** ¿Esta línea pide que alguien la mire? */
export function pideRevision(fila) {
  return estadoDeLinea(fila) !== ESTADO_LINEA.COINCIDE;
}

/** El rótulo de la caja de la derecha: son dos y nada más. */
export function rotuloDeEstado(fila) {
  return pideRevision(fila) ? "Revisar" : "Coincide";
}

export function pasaFiltro(fila, filtro) {
  const estado = estadoDeLinea(fila);
  switch (filtro) {
    case FILTRO.REVISAR:
      return estado !== ESTADO_LINEA.COINCIDE && estado !== ESTADO_LINEA.NO_PEDIDO;
    case FILTRO.COINCIDEN:
      return estado === ESTADO_LINEA.COINCIDE;
    case FILTRO.NO_PEDIDOS:
      return estado === ESTADO_LINEA.NO_PEDIDO;
    case FILTRO.TODOS:
    default:
      // ── "TODOS" SON TODAS LAS LÍNEAS DE LA FACTURA ─────────────────────
      //
      // Las no pedidas incluidas. Es el mismo defecto que transferencias ya
      // tuvo y dejó anotado: excluirlas hacía que alguien informara un producto
      // que llegó de más y lo viera desaparecer de los cuatro filtros —existía
      // en la base y en ninguna vista—.
      return true;
  }
}

/** Los cuatro filtros con su conteo, listos para `SunmiFiltroEstado`. */
export function opcionesDeFiltro(filas = []) {
  const lista = Array.isArray(filas) ? filas : [];
  return [
    { clave: FILTRO.TODOS, texto: "Todas", cantidad: lista.length },
    {
      clave: FILTRO.REVISAR,
      texto: "Revisar",
      cantidad: lista.filter((f) => pasaFiltro(f, FILTRO.REVISAR)).length,
    },
    {
      clave: FILTRO.COINCIDEN,
      texto: "Coinciden",
      cantidad: lista.filter((f) => pasaFiltro(f, FILTRO.COINCIDEN)).length,
    },
    {
      clave: FILTRO.NO_PEDIDOS,
      texto: "No pedidas",
      cantidad: lista.filter((f) => pasaFiltro(f, FILTRO.NO_PEDIDOS)).length,
    },
  ];
}
