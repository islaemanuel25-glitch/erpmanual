// lib/compras-proveedor/comprobante/precioDeLinea.js
//
// EL ANÁLISIS DE PRECIO DE UNA LÍNEA LEÍDA, EN UN SOLO LUGAR.
//
// De una línea del comprobante y el producto al que quedó vinculada salen cinco
// cosas encadenadas, y siempre las mismas cinco:
//
//   1. el precio de la factura llevado a ESCALA FINAL (el neto no compara),
//   2. si la factura cobra por unidad o por bulto,
//   3. cuál de los dos precios se escribiría según eso,
//   4. cómo clasifica esa diferencia contra el costo de hoy,
//   5. qué se le ofrece a quien mira.
//
// ── POR QUÉ ESTO ES UN MÓDULO Y NO CÓDIGO EN CADA RUTA ─────────────────────
//
// Porque son DOS rutas las que necesitan las cinco: la que dibuja la pantalla y
// la que acepta el precio. Y tienen que dar el mismo número, porque una muestra
// lo que la otra va a escribir.
//
// La segunda copia llegó a existir: la ruta de aceptar nació repitiendo los
// pasos 1 a 3 con el mismo código pegado al lado. No se rompía ese día — se
// rompía el día que alguna de las dos cambiara, mostrando un precio y
// escribiendo otro. Es exactamente la regla 1 de CLAUDE.md, y se juntaron acá
// antes de que la copia se commiteara.
//
// ── EL ORDEN DE LOS PASOS NO ES LIBRE ──────────────────────────────────────
//
// Neto → final ANTES de comparar. El costo del ERP está en escala final y el
// unitario de la factura viene neto; comparar sin convertir mete la alícuota
// entera adentro del cociente y hace que un 21 % de IVA parezca un aumento.
//
// Y la unidad se decide ANTES de clasificar: si la factura cobra por unidad, lo
// que se compara contra el costo del bulto es el precio multiplicado por el
// pack. Clasificar antes de saber la unidad compara un precio de unidad contra
// un costo de bulto, y eso da siempre una baja brutal.

import {
  finalUnitarioSinPercepcionesCentavos,
  aCentavos,
  aPesos,
  RECETA_POR_DEFECTO,
} from "@/lib/compras-proveedor/comprobante/impuestos";
import {
  deducirUnidad,
  explicarVeredicto,
  lecturasPosibles,
  UNIDAD,
} from "@/lib/compras-proveedor/comprobante/unidadPorPrecio";
import {
  clasificarDiferenciaCosto,
  umbralesDelProveedor,
} from "@/lib/compras-proveedor/fronteraCosto";
// EL PREDICADO ÚNICO de "¿el DEPÓSITO cuenta este producto por kilo?". Vive con
// el resto de las conversiones de stock, que es donde el ERP ya contesta cómo se
// guarda cada cosa. No es la unidad de VENTA: las papas se venden por kilo en
// dos locales y el depósito las guarda por pieza.
import { elDepositoCuentaPorKilo } from "@/lib/conversiones/stock";
import { decisionDePrecio } from "@/lib/compras-proveedor/comprobante/aceptarPrecio";

/**
 * Qué producto es esta línea.
 *
 * ── EL VÍNCULO YA HECHO GANA SOBRE LA SUGERENCIA ─────────────────────────
 *
 * Una línea vinculada a mano no vuelve a buscarse: alguien ya decidió. Antes
 * esto no estaba y el producto salía SOLO de la sugerencia automática, así que
 * una línea vinculada a mano perdía su producto y con él el precio, la unidad y
 * la línea del pedido — y la pantalla decía "Todavía no se sabe qué producto
 * es" sobre una línea que sí lo sabía, con el `productoLocalId` escrito en la
 * fila.
 *
 * @param linea            la fila leída, con `productoLocalId` si ya está vinculada
 * @param baseDelLocal     Map productoLocalId → productoBaseId
 * @param sugeridoBaseId   lo que propuso la búsqueda, si no estaba vinculada
 */
export function productoBaseDeLaLinea({ linea, baseDelLocal, sugeridoBaseId } = {}) {
  if (linea?.productoLocalId != null) {
    const base = baseDelLocal?.get?.(linea.productoLocalId);
    // Si el vínculo apunta a un producto que ya no se ve desde acá, el vínculo
    // existe igual: se devuelve nulo y quien llame lo dirá como corresponde, sin
    // hacerlo pasar por "sin vincular".
    return { productoBaseId: base ?? null, desdeVinculo: true };
  }
  return { productoBaseId: sugeridoBaseId ?? null, desdeVinculo: false };
}

/**
 * Los cinco pasos, encadenados.
 *
 * @param linea          { cantidad, netoUnitario, internoUnitario }
 * @param producto       { precio_costo, factor_pack } — el del ERP, o null
 * @param receta         la que usó la lectura, no la de hoy
 * @param proveedor      para los umbrales propios del proveedor
 * @param unidadElegida  UNIDAD.POR_UNIDAD | POR_BULTO si una persona ya decidió
 */
/**
 * EL PRECIO QUE EL PROVEEDOR ESTÁ COBRANDO DE VERDAD, POR UNIDAD DE COMPRA.
 *
 * ── POR QUÉ NO ES EL UNITARIO IMPRESO ──────────────────────────────────────
 *
 * El unitario impreso es el precio DE LISTA. Lo que se paga es el subtotal, y
 * entre los dos puede haber un descuento —el papel de Paty tiene renglones al
 * 57 %—. Así que el neto sale de DIVIDIR EL SUBTOTAL IMPRESO, que es el número
 * que el proveedor va a cobrar. No se aplica el descuento al unitario: eso
 * sería recalcular lo que el papel ya dice, y difiere por redondeo.
 *
 * ── POR CUÁNTO SE DIVIDE: LO DECIDE EL PRODUCTO, NO EL PAPEL ───────────────
 *
 * Regla de negocio de Emanuel. Cómo se maneja cada producto en el depósito ya
 * está en el catálogo, y es lo que manda:
 *
 *   · el DEPÓSITO lo cuenta POR KILO  → subtotal ÷ kilos del papel
 *   · el DEPÓSITO lo cuenta POR PIEZA → subtotal ÷ cantidad del papel, AUNQUE
 *                          EL PAPEL TRAIGA PESO y aunque el producto se venda
 *                          por kilo en los locales
 *
 * El peso del papel es un dato, no una orden. Hasta `6787934d` esto dividía por
 * los kilos siempre que el renglón los trajera, y estaba mal: el queso danbo va
 * por kilo, pero las papas van por pieza y su papel igual imprime el peso.
 * Dividir las papas por sus kilos les pone un costo por kilo que después se
 * compara contra un costo de catálogo que está por pieza — y esa comparación no
 * significa nada.
 *
 * ── Y SI NO HAY PRODUCTO TODAVÍA, NO HAY NETO ─────────────────────────────
 *
 * Un renglón sin vincular no sabe por cuánto dividir, así que no se contesta:
 * devuelve `null`. Adivinar con los kilos del papel es exactamente el error que
 * esta función vino a sacar, y "todavía no se sabe" es la verdad — la pantalla
 * ya sabe dibujar un renglón sin vincular.
 *
 * ── LO QUE PASA SI FALTAN LOS KILOS ────────────────────────────────────────
 *
 * Producto por kilo y papel sin kilos: tampoco se inventa. Devuelve `null` con
 * `faltanKilos`, y los kilos se piden AL RECIBIR, que es como ya funciona el
 * fiambre desde antes de todo esto.
 *
 * @param linea     la fila leída: `{ cantidad, peso|pesoKg, subtotalImpreso, netoUnitario }`
 * @param producto  el del catálogo, o null si el renglón no está vinculado
 */
export function netoQueFacturaElProveedor({ linea, producto } = {}) {
  if (!producto) return { neto: null, porKilo: null, faltanKilos: false, sinProducto: true };

  const porKilo = elDepositoCuentaPorKilo(producto);
  const kilos = Number(linea?.peso ?? linea?.pesoKg);
  const cantidad = Number(linea?.cantidad);
  const hayKilos = Number.isFinite(kilos) && kilos > 0;

  if (porKilo && !hayKilos) {
    // Los kilos se piden al recibir. No se cae a la cantidad: eso daría un
    // "precio por kilo" que en realidad es por pieza, y nada lo delataría.
    return { neto: null, porKilo: true, faltanKilos: true, sinProducto: false };
  }

  const divisor = porKilo ? kilos : cantidad;
  // Lo corregido manda sobre lo leído: si alguien —o la cuenta del papel—
  // arregló un dígito, el costo que se propone tiene que salir de ESE importe.
  const subtotal = Number(linea?.subtotalCorregido ?? linea?.subtotalImpreso);
  if (!Number.isFinite(subtotal) || !Number.isFinite(divisor) || divisor === 0) {
    // Sin subtotal queda el unitario impreso, que es lo único que hay. No se
    // inventa: una lectura sin subtotal ya no pasa el control principal, así
    // que ese comprobante no propone ningún costo igual.
    const unitario = Number(linea?.netoUnitario);
    return {
      neto: Number.isFinite(unitario) ? unitario : null,
      porKilo,
      faltanKilos: false,
      sinProducto: false,
    };
  }
  return { neto: subtotal / divisor, porKilo, faltanKilos: false, sinProducto: false };
}

export function analizarPrecioDeLinea({
  linea,
  producto,
  receta,
  proveedor,
  unidadElegida,
  /**
   * ── LO QUE LE TOCA A ESTE RENGLÓN DE LOS CONCEPTOS DEL PIE ──────────────
   *
   * `{ factorSobreNeto }`, tal como lo devuelve `repartoDelPie`. Es cuánto
   * agrega la percepción —o el IIBB, o lo que el papel imprima entre el
   * subtotal y el total— sobre el neto de ESTE renglón, dentro de SU factura.
   *
   * Entra por parámetro y no se calcula acá porque el reparto es del
   * COMPROBANTE ENTERO: hace falta el neto de todos los renglones para saber
   * qué proporción le toca a uno. Calcularlo con la línea sola le daría el pie
   * completo al único renglón que se está mirando.
   *
   * En CERO por omisión, y eso es deliberado: un papel sin conceptos al pie
   * —o un llamador que todavía no los trae— da exactamente el número de antes.
   */
  percepcionDeLaLinea = null,
} = {}) {
  if (!producto) return null;

  const recetaUsada = receta ?? { ...RECETA_POR_DEFECTO };

  // 1. Neto → final. La unidad del neto la decide EL PRODUCTO.
  const base = netoQueFacturaElProveedor({ linea, producto });

  // ── FALTAN LOS KILOS: NO HAY PRECIO, Y SE DICE ──────────────────────────
  //
  // Un producto por kilo cuyo papel no trae kilos no tiene precio todavía, y
  // los kilos se piden al recibir. Devolver un número igual —dividiendo por las
  // piezas— sería un "precio por kilo" que en realidad es por pieza, y nada lo
  // delataría río abajo: entraría al catálogo como costo y se compararía contra
  // el costo por kilo de ayer.
  if (base.faltanKilos) {
    return {
      precioFinal: null,
      costoAnterior: Number(producto.precio_costo ?? 0),
      precioAEscribir: null,
      faltanKilos: true,
      porKilo: true,
      unidad: null,
      clasificacion: null,
      decision: null,
    };
  }

  // ── EL PRECIO FINAL LLEVA TODO LO QUE EL PAPEL COBRA ──────────────────
  //
  // El IVA y el interno salen de la receta; las percepciones y el IIBB salen
  // del PIE de esa factura, repartidos en proporción al neto de cada renglón.
  // Hasta el 2026-09-23 este número era solo neto + IVA, así que el costo de
  // cada producto quedaba deflactado en la percepción —3 % en los papeles de
  // Arcor— mientras el total de la factura cerraba perfecto.
  //
  // Se suma DESPUÉS del IVA y no antes: la percepción se calcula sobre el neto
  // y se imprime aparte al pie. Metida en la base, el IVA se cobraría dos veces
  // sobre ella.
  //
  // El factor no tiene unidad, así que vale igual para un costo por kilo que
  // para uno por pieza — que es justamente lo que `base.neto` ya resolvió.
  const netoBaseCentavos = aCentavos(base.neto);
  const delPieCentavos = Math.round(
    netoBaseCentavos * (Number(percepcionDeLaLinea?.factorSobreNeto) || 0)
  );
  const precioFinal = aPesos(
    finalUnitarioSinPercepcionesCentavos({
      netoUnitario: base.neto,
      internoUnitario: Number(linea?.internoUnitario ?? 0),
      receta: recetaUsada,
    }) + delPieCentavos
  );

  const costoAnterior = Number(producto.precio_costo ?? 0);
  const factorPack = producto.factor_pack;
  const cantidad = Number(linea?.cantidad);

  // 2. ¿Por unidad o por bulto?
  const deducido = deducirUnidad({
    costoAnteriorFinal: costoAnterior,
    precioFacturaFinal: precioFinal,
    factorPack,
  });
  // Si una persona eligió, esa manda: eligió mirando la factura, que es más de
  // lo que puede hacer el cociente.
  const elegidaValida = unidadElegida === UNIDAD.POR_UNIDAD || unidadElegida === UNIDAD.POR_BULTO;
  const veredicto = elegidaValida
    ? { ...deducido, unidad: unidadElegida, requiereDecision: false, elegidaAMano: true }
    : deducido;

  const lecturas = lecturasPosibles({ cantidad, precioFinal, factorPack });

  // 3. Qué precio se escribiría.
  const precioAEscribir =
    lecturas && veredicto.unidad === UNIDAD.POR_UNIDAD ? lecturas.porUnidad.costoPorBulto : precioFinal;

  // 4. Cómo clasifica esa diferencia. Se reusa la frontera que ya gobierna la
  //    recepción: acá no hay ningún umbral nuevo.
  const clasificacion = clasificarDiferenciaCosto({
    costoAnterior,
    costoNuevo: precioAEscribir,
    umbrales: umbralesDelProveedor(proveedor),
  });

  // 5. Qué se le ofrece a quien mira.
  const decision = decisionDePrecio({ clasificacion, costoAnterior, costoNuevo: precioAEscribir });

  return {
    precioFinal,
    costoAnterior,
    precioAEscribir,
    faltanKilos: false,
    // POR KILO O POR PIEZA, dicho por el producto. Viaja para que la pantalla
    // pueda rotular el precio sin volver a deducirlo del papel.
    porKilo: base.porKilo,
    unidad: {
      ...veredicto,
      precioFinal,
      lecturas,
      explicacion: explicarVeredicto({ veredicto, cantidad, precioFinal, factorPack }),
    },
    clasificacion,
    decision,
  };
}
