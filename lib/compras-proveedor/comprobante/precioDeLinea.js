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
  aCentavos,
  aPesos,
  alicuotaDelRenglon,
  costoUnitarioFinalCentavos,
  esRenglonBonificado,
  normalizarReceta,
  RECETA_POR_DEFECTO,
} from "@/lib/compras-proveedor/comprobante/impuestos";
import {
  deducirUnidad,
  explicarVeredicto,
  lecturaElegida,
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
import { elDepositoCuentaPorKilo, esProductoFiambre } from "@/lib/conversiones/stock";
import { pesoPorPieza } from "@/lib/compras-proveedor/calculoPedido";
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
/**
 * ¿CUÁNTOS KILOS FACTURA ESTE RENGLÓN? Y SI LA CANTIDAD MISMA SON LOS KILOS.
 *
 * ── EL CASO (Emanuel, Das #255, 2026-10-10) ───────────────────────────────
 *
 * "0223 SALAME MILAN FELA · 10,94 × 9.375,87 = 102.572,05". No hay columna de
 * peso: los 10,94 SON los kilos que pesó el proveedor, y 9.375,87 es el neto
 * POR KILO. La pantalla lo leía como 10,94 unidades, sin precio —"faltan los
 * kilos"— y con "✓ Coincide".
 *
 * Regla de Emanuel: el fiambre de peso VARIABLE se pide por pieza pero el
 * proveedor lo VENDE POR PESO, así que su boleta trae los kilos que pesó y no
 * cuántas piezas entraron. Lo decide EL PRODUCTO, no el papel:
 *
 *   · `esProductoFiambre` —se compra por pieza, se mide en kilos, tiene peso
 *     de referencia— y
 *   · `elDepositoCuentaPorKilo` —el depósito NO lo cuenta por pieza: peso no
 *     fijo, venta en depósito por peso—.
 *
 * Los dos son los predicados de la biblioteca (`lib/conversiones/stock.js`);
 * acá no se escribe una copia más de "fiambre fijo" —hay trece congeladas—.
 * Los kilos que se compran por bulto —trozado, pan— NO entran: ahí la cantidad
 * cuenta cajones. Y el fiambre de peso fijo —la mortadela— tampoco: sigue por
 * pieza, como siempre.
 *
 * Si el papel imprime una columna de kilos, mandan esos kilos y la cantidad
 * son piezas, como en el salamín picado de Paty.
 *
 * @returns `{ kilos, cantidadEnKilos }` — `kilos` null si no se sabe.
 */
export function kilosQueFacturaElRenglon({ linea, producto } = {}) {
  const impresos = Number(linea?.peso ?? linea?.pesoKg);
  if (Number.isFinite(impresos) && impresos > 0) return { kilos: impresos, cantidadEnKilos: false };
  if (!producto || !esProductoFiambre(producto) || !elDepositoCuentaPorKilo(producto)) {
    return { kilos: null, cantidadEnKilos: false };
  }
  const cantidad = Number(linea?.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0) return { kilos: null, cantidadEnKilos: false };
  return { kilos: cantidad, cantidadEnKilos: true };
}

export function netoQueFacturaElProveedor({ linea, producto } = {}) {
  if (!producto) return { neto: null, porKilo: null, faltanKilos: false, sinProducto: true };

  const porKilo = elDepositoCuentaPorKilo(producto);
  const { kilos, cantidadEnKilos } = kilosQueFacturaElRenglon({ linea, producto });
  const cantidad = Number(linea?.cantidad);
  const hayKilos = kilos !== null;

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
      // Sin subtotal, el "renglón" es una unidad a ese precio.
      subtotal: Number.isFinite(unitario) ? unitario : null,
      divisor: 1,
    };
  }
  // El subtotal y el divisor viajan aparte del cociente: el costo se arma POR
  // RENGLÓN —neto + IVA + percepciones, recién después dividido— y no desde el
  // neto unitario ya redondeado. Ver `costoUnitarioFinalCentavos`.
  return {
    neto: subtotal / divisor, porKilo, faltanKilos: false, sinProducto: false, subtotal, divisor,
    // Los kilos que factura y si la cantidad misma lo son: viajan a la fila de
    // la recepción, que rotula "kg" y estima piezas con ellos.
    kilos: porKilo ? kilos : null,
    cantidadEnKilos: porKilo && cantidadEnKilos,
  };
}

const numeroONull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * EL PRECIO DE UNA LECTURA ANTERIOR A LA INTERPRETADA, armado con la receta.
 *
 * Solo para los comprobantes leídos antes del 2026-10-10, que no traen el costo
 * final de cada renglón. Las lecturas nuevas no pasan por acá.
 */
function precioPorLaRecetaAnterior({ linea, base, recetaUsada, percepcionDeLaLinea }) {
  const alicuota = alicuotaDelRenglon(linea, recetaUsada);
  const subtotalCentavos = Number.isFinite(percepcionDeLaLinea?.subtotalCentavos)
    ? percepcionDeLaLinea.subtotalCentavos
    : aCentavos(base.subtotal);
  const internoCentavos = aCentavos(linea?.internoUnitario ?? 0);
  const ivaCentavos = Number.isFinite(percepcionDeLaLinea?.ivaLineaCentavos)
    ? percepcionDeLaLinea.ivaLineaCentavos
    : Math.round(
        ((normalizarReceta(recetaUsada).ivaIncluyeInternoEnLaBase
          ? subtotalCentavos + internoCentavos * (Number(base.divisor) || 1)
          : subtotalCentavos) * alicuota) / 100
      );
  // La percepción del renglón en centavos. Un llamador viejo que trae solo el
  // factor sobre el neto sigue funcionando: el factor por el neto es lo mismo.
  const percepcionCentavos = Number.isFinite(percepcionDeLaLinea?.percepcionLineaCentavos)
    ? percepcionDeLaLinea.percepcionLineaCentavos
    : Math.round(subtotalCentavos * (Number(percepcionDeLaLinea?.factorSobreNeto) || 0));
  return aPesos(
    costoUnitarioFinalCentavos({
      lineaCentavos: subtotalCentavos + ivaCentavos + percepcionCentavos,
      divisor: base.divisor,
      internoUnitarioCentavos: internoCentavos,
    })
  );
}

export function analizarPrecioDeLinea({
  linea,
  producto,
  receta,
  proveedor,
  unidadElegida,
  /**
   * Cuántas unidades trae lo que este proveedor factura de este producto, tal
   * como quedó confirmado en su vínculo (`ProductoCodigoProveedor.
   * unidadesPorPresentacion`). Ver `unidadesGuardadasDeLaLinea`.
   */
  unidadesGuardadas = null,
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

  const costoAnterior = Number(producto.precio_costo ?? 0);

  // ── LA LECTURA INTERPRETADA TRAE EL COSTO DEL RENGLÓN ──────────────────
  //
  // El modelo leyó el papel entero y dio lo que cuesta el renglón con todo
  // adentro según ESE papel (`lector/lecturaInterpretada.js`); la suma de esos
  // costos contra el total impreso ya la controló la puerta. Acá no se vuelve a
  // armar con reglas de formato: se divide por los kilos o por la cantidad —lo
  // decide el producto— y siguen las reglas de negocio de siempre.
  const costoFinalDelRenglon = numeroONull(linea?.costoFinalRenglon ?? linea?.costoFinal);
  const interpretado = costoFinalDelRenglon !== null;

  // ── UN RENGLÓN INTERPRETADO SIN SU COSTO NO SE ARMA CON REGLAS ─────────
  //
  // Si el modelo no dio el costo de este renglón, armarlo con la receta de
  // formato es exactamente el defecto que la lectura interpretada vino a sacar:
  // Secco #256 con la genérica sumándole un 21 % que el papel ya traía. Sin
  // costo no hay precio, y la puerta ya marcó el papel como mal leído.
  if (!interpretado && recetaUsada?.interpretada === true) {
    return {
      precioFinal: null,
      costoAnterior,
      precioAEscribir: null,
      faltanKilos: false,
      sinCostoDelPapel: true,
      porKilo: base.porKilo,
      unidad: null,
      clasificacion: null,
      decision: null,
    };
  }

  // ── EL RENGLÓN BONIFICADO NO PROPONE COSTO ─────────────────────────────
  //
  // Descuento del 100 %, importe cero. La mercadería entra al stock, pero un
  // costo de cero escrito en el producto le rompería el margen: conserva el
  // que tenía, y la línea dice "bonificado". Sin precio no hay unidad que
  // deducir ni diferencia que clasificar. En la lectura interpretada, un
  // renglón regalado es el que cuesta cero.
  if (interpretado ? costoFinalDelRenglon === 0 : esRenglonBonificado(linea)) {
    return {
      precioFinal: null,
      costoAnterior,
      precioAEscribir: null,
      faltanKilos: false,
      bonificado: true,
      porKilo: base.porKilo,
      // Un bonificado de peso variable entra igual al stock, en kilos.
      cantidadEnKilos: base.cantidadEnKilos === true,
      kilos: base.kilos ?? null,
      pesoPorPiezaKg: base.cantidadEnKilos ? pesoPorPieza(producto) : null,
      unidad: null,
      clasificacion: null,
      decision: null,
    };
  }

  // ── EL PRECIO FINAL LLEVA TODO LO QUE EL PAPEL COBRA ──────────────────
  //
  // Neto con descuento + IVA con la alícuota DEL RENGLÓN + percepciones del
  // pie de esa factura, todo por renglón y recién después dividido, más el
  // interno por unidad. La fórmula es `costoUnitarioFinalCentavos`, la misma
  // con la que la verificación dice el costo en la receta: lo que se muestra y
  // lo que se escribe salen del mismo lugar.
  //
  // El IVA y la percepción del renglón vienen del reparto de SU factura —el
  // mismo motor que controla el total—. Sin reparto —un llamador que no trae
  // el pie— se arma el IVA acá con la alícuota del renglón y la percepción es
  // cero, que es exactamente el número de antes.
  //
  // El divisor lo decidió el producto —kilos o cantidad— en
  // `netoQueFacturaElProveedor`.
  const precioFinal = interpretado
    ? aPesos(costoUnitarioFinalCentavos({ lineaCentavos: aCentavos(costoFinalDelRenglon), divisor: base.divisor }))
    : precioPorLaRecetaAnterior({ linea, base, recetaUsada, percepcionDeLaLinea });
  const factorPack = producto.factor_pack;
  const cantidad = Number(linea?.cantidad);

  // ── LA CANTIDAD SON KILOS: NO HAY BULTO NI PACK QUE DEDUCIR ─────────────
  //
  // El precio ya es POR KILO —subtotal ÷ kilos— y el costo del catálogo de un
  // producto que el depósito cuenta por kilo también: se comparan directo, con
  // la misma frontera de siempre. Deducir si 10,94 son unidades o bultos sería
  // preguntarle al cociente algo que no tiene sentido sobre un peso.
  if (base.cantidadEnKilos) {
    const clasificacion = clasificarDiferenciaCosto({
      costoAnterior,
      costoNuevo: precioFinal,
      umbrales: umbralesDelProveedor(proveedor),
    });
    return {
      precioFinal,
      costoAnterior,
      precioAEscribir: precioFinal,
      faltanKilos: false,
      porKilo: true,
      cantidadEnKilos: true,
      kilos: base.kilos,
      // El puente entre lo pedido en piezas y lo facturado en kilos. El de la
      // biblioteca —`pesoPorPieza`—, no uno parecido.
      pesoPorPiezaKg: pesoPorPieza(producto),
      unidad: null,
      clasificacion,
      decision: decisionDePrecio({ clasificacion, costoAnterior, costoNuevo: precioFinal }),
    };
  }

  // 2. ¿Por unidad, por un pack intermedio o por bulto? El texto impreso
  //    confirma un pack; lo ya confirmado en el vínculo del proveedor, si el
  //    precio lo sigue explicando, decide sin volver a preguntar.
  const deducido = deducirUnidad({
    costoAnteriorFinal: costoAnterior,
    precioFacturaFinal: precioFinal,
    factorPack,
    descripcion: linea?.textoCrudo ?? linea?.descripcion ?? null,
    unidadesGuardadas,
  });
  // Si una persona eligió, esa manda: eligió mirando la factura, que es más de
  // lo que puede hacer el cociente.
  const elegidaValida = unidadElegida === UNIDAD.POR_UNIDAD || unidadElegida === UNIDAD.POR_BULTO;
  const veredicto = elegidaValida
    ? { ...deducido, unidad: unidadElegida, requiereDecision: false, elegidaAMano: true }
    : deducido;

  const lecturas = lecturasPosibles({
    cantidad,
    precioFinal,
    factorPack,
    unidadesPorFacturada: veredicto.unidadesPorFacturada,
    posibles: veredicto.posibles,
  });

  // 3. Qué precio se escribiría: el del BULTO del catálogo, según la lectura
  //    elegida. Por bulto —o sin lectura— el precio entra tal cual.
  const elegida = lecturaElegida({ ...veredicto, lecturas });
  const precioAEscribir = elegida ? elegida.costoPorBulto : precioFinal;

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
      explicacion: explicarVeredicto({ veredicto, cantidad, precioFinal, factorPack, proveedor: proveedor?.nombre }),
    },
    clasificacion,
    decision,
  };
}
