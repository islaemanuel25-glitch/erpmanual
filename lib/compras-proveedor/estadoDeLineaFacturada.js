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

import { decisionVigente, mismoPrecio } from "@/lib/compras-proveedor/decisionDePrecio";
import { decisionDeCostoSugerida, VARIACION_POR_DEFECTO } from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import { lecturaElegida } from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";

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
  // La lectura elegida, con la MISMA función que decide el precio: con un pack
  // intermedio —8 packs de 6 en una plancha de 24— son 2 bultos, no 8.
  const bultos = Number(lecturaElegida(u)?.bultos);
  if (Number.isFinite(bultos)) return bultos;
  return Number.isFinite(cruda) ? cruda : null;
}

/**
 * ¿LA CANTIDAD QUEDÓ CONTADA EN BULTOS?
 *
 * Los DOS rótulos de la tarjeta cuelgan de esta pregunta —el de la cantidad y
 * el de los precios— y tienen que contestarla igual o la tarjeta se contradice
 * sola. Medido en el #242: la manteca llegó a decir "1 u" arriba y
 * "$90.481,20 / pack" abajo, sobre el mismo renglón.
 *
 * Espeja las ramas de `cantidadEnEscalaDelPedido`, que es quien convirtió el
 * número: si hay un veredicto de la factura y no requiere decisión, esa función
 * devuelve BULTOS; si no, deja la cantidad cruda, que está en la unidad de la
 * línea del pedido.
 */
export function quedoEnBultos(fila) {
  const veredicto = fila?.unidad;
  if (veredicto && !veredicto.requiereDecision) {
    if (num(lecturaElegida(veredicto)?.bultos) !== null) return true;
  }
  return fila?.unidadPedido === "BULTO";
}

/**
 * LO QUE DICE LA FACTURA, EN UNIDADES FÍSICAS.
 *
 * La cantidad en la escala del pedido —ya convertida por la lectura del
 * precio— por el factor del bulto cuando quedó en bultos. El Gancia de DYSSA:
 * 8 packs de 6 son 2 bultos de 24, o sea 48. Es la misma cuenta que hace la
 * franja "Entra al stock" de la hoja con lo que ofrece.
 */
export function unidadesFisicasDeLaFactura(fila) {
  // El fiambre de peso variable que viene en kilos: lo que dice la factura,
  // contado en piezas, es una ESTIMACIÓN —kilos ÷ peso por pieza—.
  if (fila?.cantidadEnKilos === true) return piezasEstimadasDeLaFactura(fila);
  const enEscala = num(cantidadEnEscalaDelPedido(fila));
  if (enEscala === null) return null;
  const factor = num(fila?.factorPack);
  return quedoEnBultos(fila) && factor !== null && factor > 1 ? enEscala * factor : enEscala;
}

/**
 * LO QUE SE ESPERABA RECIBIR, EN UNIDADES FÍSICAS. Una sola cuenta.
 *
 * ── EL DEFECTO QUE LA TRAJO ───────────────────────────────────────────────
 *
 * Recepción de DYSSA #253, un pedido que nació de la factura. El Gancia se
 * sembró con la cantidad cruda del papel —8, en UNIDAD— antes de que la
 * deducción supiera leer el pack de 6. La hoja comparaba esas 8 contra las 48
 * que entran y pedía "Motivo de la diferencia" sobre un renglón exacto, y la
 * tarjeta comparaba 2 bultos contra 8 sin mirar la unidad del pedido: eran DOS
 * cuentas distintas de lo esperado, y ninguna pasaba por la conversión.
 *
 * Ahora las dos preguntan acá:
 *
 *   · en un pedido que NACIÓ DE LA FACTURA no hubo un pedido de una persona:
 *     lo esperado es lo que el papel dice, convertido igual que lo que entra.
 *     Por eso la #253 se ve bien tal como quedó en la base, sin rehacer nada;
 *   · en uno normal, lo pedido, en su unidad: bultos por el factor, o sueltas.
 */
export function unidadesFisicasEsperadas(fila) {
  if (fila?.nacidoDeFactura === true && fila?.sinPapel !== true) {
    const deLaFactura = unidadesFisicasDeLaFactura(fila);
    if (deLaFactura !== null) return deLaFactura;
  }
  const pedida = num(fila?.cantidadPedida);
  if (pedida === null) return null;
  const factor = num(fila?.factorPack);
  const enBultos = (fila?.unidadPedido ?? "BULTO") === "BULTO" && factor !== null && factor > 1;
  return enBultos ? pedida * factor : pedida;
}

/**
 * ── EL FIAMBRE DE PESO VARIABLE: SE PIDE POR PIEZA Y SE FACTURA POR KILO ──
 *
 * Regla de Emanuel (Das #255, 2026-10-10): la boleta trae los kilos que pesó
 * el proveedor, no cuántas piezas entraron. Contra lo pedido —en piezas— se
 * compara con una ESTIMACIÓN: kilos ÷ peso por pieza. El Salame Fela: 10,94 kg
 * ÷ 1,8 kg ≈ 6 piezas.
 *
 * Es una estimación y se dice como tal: con un peso que varía por definición,
 * una diferencia chica contra lo pedido no es una diferencia. Solo cuenta si se
 * aleja más que la variación normal del proveedor.
 *
 * Sin peso por pieza no hay estimación: null, y la línea no se compara en
 * cantidad. No se inventa.
 */
export function piezasEstimadasDeLaFactura(fila) {
  if (fila?.cantidadEnKilos !== true) return null;
  const kilos = num(fila?.peso);
  const porPieza = num(fila?.pesoPorPiezaKg);
  if (kilos === null || porPieza === null || porPieza <= 0) return null;
  return Math.round((kilos / porPieza) * 100) / 100;
}

/**
 * LAS PIEZAS QUE ALGUIEN CONTÓ, en el fiambre que viene en kilos. O null.
 *
 * Un `cantidadRecibida` IGUAL a los kilos del papel no es un conteo: es la
 * cantidad del papel copiada como si fueran piezas, que es como quedó la #255
 * antes de este arreglo —"10,94" en un salame que se cuenta por pieza—. Leerlo
 * como 10,94 piezas diría "sobran 5" sobre un renglón que llegó bien.
 */
export function piezasContadasDeLaFila(fila) {
  if (fila?.cantidadEnKilos !== true) return num(fila?.cantidadRecibida);
  const contadas = num(fila?.cantidadRecibida);
  if (contadas === null || contadas <= 0) return null;
  if (contadas === num(fila?.peso) || contadas === num(fila?.cantidad)) return null;
  return contadas;
}

/**
 * ¿LAS PIEZAS QUE LLEGARON DIFIEREN DE LAS PEDIDAS?
 *
 * Con piezas CONTADAS —alguien las cargó— la comparación es exacta, como en
 * cualquier renglón. Sin contar, en el fiambre que viene en kilos, se compara
 * la estimación con la tolerancia de la variación normal del proveedor.
 *
 * @param piezasContadas lo que alguien cargó en el campo, o null
 * @returns `{ difiere, diferencia }` — `diferencia` en piezas, esperadas menos
 *          llegadas; 0 cuando la estimación cae adentro de la tolerancia.
 */
export function difiereDeLoPedido(fila, { piezasContadas = null } = {}) {
  const esperadas = unidadesFisicasEsperadas(fila);
  const contadas = num(piezasContadas);
  if (esperadas === null) return { difiere: false, diferencia: null };
  if (contadas !== null) {
    return { difiere: esperadas !== contadas, diferencia: esperadas - contadas };
  }
  if (fila?.cantidadEnKilos !== true) return { difiere: false, diferencia: null };
  const estimadas = piezasEstimadasDeLaFactura(fila);
  if (estimadas === null) return { difiere: false, diferencia: null };
  const variacion = num(fila?.variacionNormalPct) ?? VARIACION_POR_DEFECTO;
  const desvio = esperadas === 0 ? Infinity : Math.abs(estimadas - esperadas) / esperadas;
  if (desvio * 100 <= variacion) return { difiere: false, diferencia: 0 };
  return { difiere: true, diferencia: Math.round((esperadas - estimadas) * 100) / 100 };
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
  /**
   * Un envase a precio simbólico —las botellas de cambio de Secco a $0,025—.
   * Suma al papel y no es un producto: no se vincula, no entra al stock y no
   * tiene precio que decidir. Ver `comprobante/envase.js`.
   */
  ENVASE: "envase",
});

/** ¿Esta fila es un renglón de envase? La pantalla los muestra aparte. */
export function esFilaDeEnvase(fila) {
  return fila?.envase === true;
}

/** Los filtros de la pantalla. Cada uno es un predicado sobre el estado. */
export const FILTRO = Object.freeze({
  TODOS: "todos",
  REVISAR: "revisar",
  COINCIDEN: "coinciden",
  SIN_VINCULAR: "sinVincular",
  NO_PEDIDOS: "noPedidos",
});

/**
 * UN NÚMERO QUE FALTA NO ES UN CERO.
 *
 * `Number(null)` da **0**, y es finito, así que la versión anterior convertía
 * "no hay precio" en "el precio es cero". Con eso, una línea sin costo del
 * pedido comparaba 22.500 contra 0 y decía que el precio había cambiado —y la
 * hoja preguntaba por un precio ofreciendo "Tenías $0,00"— cuando lo que pasaba
 * es que no había nada con qué comparar.
 *
 * Lo encontró el candado de esta tanda, y es la misma familia que el defecto
 * que la trajo: un dato ausente haciéndose pasar por un dato.
 */
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
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
 * redondeo no es un precio nuevo. Vive en `decisionDePrecio` y se importa: la
 * decisión guardada tiene que usar EXACTAMENTE la misma, o la tarjeta diría "no
 * cambió" mientras la decisión dice "cambió".
 */
export function precioCambio(fila) {
  const factura = num(fila?.costoFactura);
  const pedido = num(fila?.costoCatalogo);
  if (factura === null || pedido === null) return false;
  return !mismoPrecio(factura, pedido);
}

/**
 * ¿HAY DOS PRECIOS PARA COMPARAR? Y SI NO, CUÁL FALTA.
 *
 * ── EL DEFECTO QUE LA TRAJO ───────────────────────────────────────────────
 *
 * La hoja mostraba "El precio bajó 15,0 % · Tenías $26.460,00 · la factura trae
 * $22.500,00" con sus dos opciones, y abajo, en rojo: "El producto vinculado no
 * tiene costo ni bulto cargados, así que no hay con qué comparar". Las dos
 * cosas no pueden ser ciertas a la vez.
 *
 * El cartel era del servidor y miraba OTRA COSA que la pantalla: la columna
 * `productoLocalId` de la línea, que estaba vacía, mientras la comparación se
 * había hecho con el producto que resolvió el alias del proveedor. Medido sobre
 * la línea 112 del comprobante 5: `productoLocalId` en null, y el producto que
 * la pantalla usó —Philips 20 red común— con costo 26.460 y bulto de 10
 * cargados. El cartel no solo contradecía a la hoja: nombraba una causa falsa.
 *
 * Por eso esta pregunta vive acá, en una sola función, y la contestan los dos
 * lados sobre LOS MISMOS DOS NÚMEROS: el que la factura deja comparable y el
 * costo de la línea del pedido. Si los dos están, la hoja compara y la decisión
 * se puede guardar; si falta alguno, no hay opciones que ofrecer y se dice cuál
 * falta.
 */
export function motivoSinComparacion(fila) {
  const factura = num(fila?.costoFactura);
  const propio = num(fila?.costoCatalogo);
  if (factura === null && propio === null) {
    return "Todavía no se sabe qué producto es ni a qué línea del pedido va: no hay dos precios para comparar.";
  }
  if (factura === null) {
    return "Falta saber qué producto es, así que la factura no deja un precio comparable.";
  }
  if (propio === null) {
    return fila?.pedidoDetalleId == null
      ? "Esta línea no está en el pedido, así que no hay costo tuyo contra el cual compararla."
      : "La línea del pedido no tiene precio cargado, así que no hay contra qué comparar.";
  }
  return null;
}

/** ¿Se puede comparar el precio de esta línea? */
export function sePuedeCompararElPrecio(fila) {
  return motivoSinComparacion(fila) === null;
}

/**
 * ¿HAY QUE PREGUNTAR POR EL PRECIO?
 *
 * Que el precio sea distinto es un HECHO; que haya que preguntarlo es otra
 * cosa, y son dos preguntas separadas a propósito. La diferencia entre lo que
 * factura el proveedor y el costo interno es la ganancia del depósito: es
 * estable, esperada, y vuelve igual en cada recepción. Una vez decidida, sigue
 * siendo una diferencia —la tarjeta la muestra— pero deja de ser algo a
 * resolver.
 */
export function hayQueDecidirElPrecio(fila) {
  return hayDiferenciaDePrecio(fila) && decisionVigente(fila) == null;
}

/**
 * ¿EL CATÁLOGO SE MOVIÓ DESPUÉS DEL PEDIDO, AUNQUE EL PAPEL COINCIDA CON LA
 * LÍNEA?
 *
 * La hoja compara el papel contra el costo de la línea del pedido, y el cierre
 * de la recepción, contra el costo maestro de HOY. Casi siempre son el mismo
 * número; cuando el catálogo cambió entre el pedido y la recepción —una lista
 * del proveedor, una corrección con el lápiz— no. Con papel y línea en 1.000 y
 * el catálogo en 1.300, la hoja decía "el precio es el mismo" y el cierre
 * frenaba: nadie tenía qué elegir para destrabarlo.
 *
 * Contesta con LA MISMA regla con la que frena el cierre —`decisionDeCostoSugerida`
 * con la variación del proveedor—, así que pregunta exactamente cuando el
 * cierre frenaría y no antes: dentro de la variación no hay nada que decidir.
 *
 * `costoMaestroHoy` llega en la misma unidad que `costoCatalogo`: los dos pasan
 * por `costoDelCatalogoEnLaUnidadDelDeposito` al armar la fila.
 */
export function elCatalogoSeMovio(fila, { variacionPct } = {}) {
  if (precioCambio(fila)) return false;
  const factura = num(fila?.costoFactura);
  const maestro = num(fila?.costoMaestroHoy);
  if (factura === null || maestro === null) return false;
  return decisionDeCostoSugerida({
    papel: factura,
    tuyo: maestro,
    variacionPct,
    factorPack: fila?.factorPack,
  }).exigeElegir;
}

/**
 * ¿HAY UNA DIFERENCIA DE PRECIO QUE DECIDIR? La de siempre —el papel contra la
 * línea del pedido— o la del catálogo que se movió, que la conciliación marca
 * en la fila con `catalogoMovido`.
 */
export function hayDiferenciaDePrecio(fila) {
  return precioCambio(fila) || fila?.catalogoMovido === true;
}

/**
 * CONTRA QUÉ COSTO PROPIO SE DECIDE, para mostrarlo y compararlo.
 *
 * El de la línea del pedido, salvo cuando la diferencia es la del catálogo
 * movido: ahí "tu precio" es el costo maestro de hoy, que es lo que el cierre
 * va a comparar. La decisión se GUARDA igual contra la línea —lo hace
 * `aceptar-precio`— y por eso `decisionVigente` la sigue reconociendo.
 */
export function costoPropioParaDecidir(fila) {
  if (!precioCambio(fila) && fila?.catalogoMovido === true) return fila?.costoMaestroHoy ?? null;
  return fila?.costoCatalogo ?? null;
}

/** Cuánto cambió, en porcentaje. `null` cuando no hay con qué comparar. */
export function porcentajeDelPrecio(fila) {
  const factura = num(fila?.costoFactura);
  const pedido = num(costoPropioParaDecidir(fila));
  if (factura === null || pedido === null || pedido === 0) return null;
  return ((factura - pedido) / pedido) * 100;
}

/**
 * CUÁNTO GANA EL DEPÓSITO EN ESTE RENGLÓN, EN PORCENTAJE SOBRE EL PRECIO
 * INTERNO.
 *
 * Es lo que dibuja la tarjeta al lado del precio del ERP, y se lee así:
 *
 *   · POSITIVO y verde → el precio interno es MAYOR que lo que factura el
 *     proveedor. Se gana la diferencia.
 *   · NEGATIVO y naranja → el proveedor cobra más que el precio interno.
 *
 * Va SOBRE EL ERP y no sobre la factura, que es la base con la que la persona
 * piensa: "sobre lo que yo cobro, cuánto me queda". Es la misma base que usa el
 * pie de la pantalla —`gananciaDelDeposito` divide por el interno— y tenerlas
 * distintas haría que el renglón y el total dijeran dos números sobre el mismo
 * hecho.
 *
 * LOS DOS PRECIOS TIENEN QUE ESTAR EN LA MISMA UNIDAD, y eso NO se resuelve
 * acá: llega resuelto en la fila. Papas Congeladas comparaba $8.166,54 la bolsa
 * contra $3.800 el kilo y mostraba +114,9 % de aumento sobre un renglón donde
 * el depósito gana.
 */
export function gananciaDelRenglonPct(fila) {
  const factura = num(fila?.costoFactura);
  const erp = num(fila?.costoCatalogo);
  if (factura === null || erp === null || erp === 0) return null;
  return ((erp - factura) / erp) * 100;
}

/** Cuántas unidades faltan respecto de lo pedido. Negativo = sobran. */
export function diferenciaDeCantidad(fila) {
  // El fiambre que viene en kilos se compara por su estimación de piezas, con
  // tolerancia: ver `difiereDeLoPedido`. Lo contado a mano, si lo hay, manda.
  if (fila?.cantidadEnKilos === true) {
    return difiereDeLoPedido(fila, { piezasContadas: piezasContadasDeLaFila(fila) }).diferencia;
  }
  // EN UNIDADES FÍSICAS DE LOS DOS LADOS, y devuelta en la escala que muestra
  // la tarjeta. Comparar 80 unidades contra 8 bultos es lo que decía "sobra
  // 72"; comparar 2 bultos contra un pedido de 8 en UNIDAD es lo que decía
  // "faltan 6" sobre el Gancia de la #253. Ver `unidadesFisicasEsperadas`.
  const facturada = unidadesFisicasDeLaFactura(fila);
  const esperada = unidadesFisicasEsperadas(fila);
  if (facturada === null || esperada === null) return null;
  const factor = num(fila?.factorPack);
  const porBulto = quedoEnBultos(fila) && factor !== null && factor > 1 ? factor : 1;
  return (esperada - facturada) / porBulto;
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
  // Un envase no es un producto: no hay nada que vincular ni que comparar.
  if (esFilaDeEnvase(fila)) return ESTADO_LINEA.ENVASE;
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
  // Y solo cuenta si todavía hay algo que decidir: con la decisión ya tomada
  // sobre estos dos precios, la línea no está para revisar — está resuelta, y
  // mostrarla como pendiente es volver a pedir lo que ya se contestó.
  if (hayQueDecidirElPrecio(fila)) return ESTADO_LINEA.PRECIO_DISTINTO;

  return ESTADO_LINEA.COINCIDE;
}

/** ¿Esta línea pide que alguien la mire? */
export function pideRevision(fila) {
  const estado = estadoDeLinea(fila);
  return estado !== ESTADO_LINEA.COINCIDE && estado !== ESTADO_LINEA.ENVASE;
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
    case ESTADO_LINEA.ENVASE:
      return "Envase";
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
        estado !== ESTADO_LINEA.SIN_VINCULAR &&
        estado !== ESTADO_LINEA.ENVASE
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
