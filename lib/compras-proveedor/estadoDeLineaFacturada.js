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
/**
 * LA CANTIDAD DE LA FACTURA, EN LA ESCALA EN QUE SE PIDIÓ.
 *
 * ── EL DEFECTO QUE LA TRAJO ───────────────────────────────────────────────
 *
 * El papel de Mauro dice "80 · PHILIPS MORRIS 10 · $3.360". Los 80 son
 * UNIDADES: son 8 packs de 10, que es exactamente lo que se pidió. La pantalla
 * comparaba 80 contra 8 y decía "sobra 72".
 *
 * El PRECIO ya se comparaba bien —`precioDeLinea` deduce la escala y convierte
 * antes—, y por eso el síntoma era confuso: el precio decía −2,9 % (una baja
 * real del precio del pack) mientras la cantidad decía que sobraban 72.
 *
 * ── Y EL NÚMERO YA ESTABA CALCULADO ───────────────────────────────────────
 *
 * `deducirUnidad` no solo decide la escala: deja las dos lecturas posibles con
 * sus números hechos, y la elegida ya trae `bultos`. O sea que no hay nada que
 * dividir acá: se lee el resultado de la deducción que ya corrió, que es la
 * misma del módulo de listas con su umbral del 35 % y su zona ambigua.
 *
 * Con la zona ambigua —`requiereDecision`— NO se convierte: la escala está en
 * duda y elegir una sería adivinar. La línea se muestra como está y la pantalla
 * pide la decisión, igual que hace listas.
 */
export function cantidadEnEscalaDelPedido(fila) {
  const cruda = Number(fila?.cantidad);
  const u = fila?.unidad;
  if (!u || u.requiereDecision) return Number.isFinite(cruda) ? cruda : null;
  const elegida = u.unidad;
  const bultos = Number(u?.lecturas?.[elegida === "POR_UNIDAD" ? "porUnidad" : "porBulto"]?.bultos);
  if (Number.isFinite(bultos)) return bultos;
  return Number.isFinite(cruda) ? cruda : null;
}

/** ¿La cantidad que se muestra salió de convertir la escala? */
export function cantidadFueConvertida(fila) {
  const cruda = Number(fila?.cantidad);
  const enEscala = cantidadEnEscalaDelPedido(fila);
  return Number.isFinite(cruda) && Number.isFinite(enEscala) && cruda !== enEscala;
}

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
  /**
   * Todavía no se sabe QUÉ producto es.
   *
   * No es lo mismo que "no estaba en el pedido" y mezclarlos es un defecto
   * medido: sobre el comprobante 5, ONCE de quince líneas salían rotuladas "no
   * lo pediste" cuando lo que pasaba es que el vínculo no estaba resuelto. El
   * endpoint ya lo distingue —dice "Todavía no se sabe qué producto es"— y acá
   * se lo ignoraba. Una acusa al proveedor de facturar de más; la otra pide un
   * toque para elegir el producto.
   */
  SIN_VINCULAR: "sinVincular",
});

/** Los filtros de la pantalla. Cada uno es un predicado sobre el estado. */
export const FILTRO = Object.freeze({
  TODOS: "todos",
  REVISAR: "revisar",
  COINCIDEN: "coinciden",
  SIN_VINCULAR: "sinVincular",
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
  // EN LA ESCALA DEL PEDIDO, no cruda. Comparar 80 unidades contra 8 bultos es
  // lo que decía "sobra 72" sobre una línea que coincidía exactamente.
  const facturada = num(cantidadEnEscalaDelPedido(fila));
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
  // Primero: ¿se sabe qué producto es? Sin eso no hay nada con qué comparar, y
  // rotularlo "no lo pediste" acusa al proveedor de algo que no hizo.
  if (fila?.productoLocalId == null && fila?.pedidoDetalleId == null) {
    return ESTADO_LINEA.SIN_VINCULAR;
  }
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

/** Qué le falta a esta línea, en dos palabras. */
export function rotuloDelEstado(fila) {
  switch (estadoDeLinea(fila)) {
    case ESTADO_LINEA.COINCIDE:
      return "Coincide";
    case ESTADO_LINEA.SIN_VINCULAR:
      return "Elegí el producto";
    case ESTADO_LINEA.NO_PEDIDO:
      return "No lo pediste";
    default:
      return "Revisar";
  }
}



export function pasaFiltro(fila, filtro) {
  const estado = estadoDeLinea(fila);
  switch (filtro) {
    case FILTRO.REVISAR:
      return (
        estado !== ESTADO_LINEA.COINCIDE &&
        estado !== ESTADO_LINEA.NO_PEDIDO &&
        estado !== ESTADO_LINEA.SIN_VINCULAR
      );
    case FILTRO.COINCIDEN:
      return estado === ESTADO_LINEA.COINCIDE;
    case FILTRO.NO_PEDIDOS:
      return estado === ESTADO_LINEA.NO_PEDIDO;
    case FILTRO.SIN_VINCULAR:
      return estado === ESTADO_LINEA.SIN_VINCULAR;
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
      // "Sin vincular" y no "No pedidas": con un papel recién leído la mayoría
      // cae acá, y decirle "no pedidas" a lo que falta identificar manda a
      // discutir con el proveedor en vez de a tocar la línea.
      clave: FILTRO.SIN_VINCULAR,
      texto: "Sin vincular",
      cantidad: lista.filter((f) => pasaFiltro(f, FILTRO.SIN_VINCULAR)).length,
    },
  ];
}
