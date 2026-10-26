// LOS TRES RENGLONES DE LA TARJETA DE RECEPCIÓN.
//
// ── QUÉ DICE LA TARJETA, Y EN QUÉ ORDEN ───────────────────────────────────
//
//   Factura  12 u                 ← cuánto vino, en la escala del pedido
//   Papel    $8.166,54 / u        ← lo que cobra el proveedor, por esa unidad
//   ERP      $9.500,00 / u  +14,0 %  ← el precio interno, en LA MISMA unidad
//
// El porcentaje va sobre el ERP: positivo y verde cuando el precio interno es
// mayor —el depósito gana la diferencia— y negativo y rojo cuando el
// proveedor cobra más.
//
// ── LA MISMA UNIDAD DE LOS DOS LADOS, O NO SE MUESTRA ─────────────────────
//
// Es la regla entera de este archivo. Papas Congeladas comparaba $8.166,54 la
// BOLSA contra $3.800 el KILO y mostraba "+114,9 %" sobre un renglón donde el
// depósito gana catorce por ciento. Son 40 productos activos en esa situación,
// 17 de ellos ya pedidos alguna vez — medido contra producción.
//
// La conversión no se hace acá: llega hecha en la fila, desde
// `costoDelCatalogoEnLaUnidadDelDeposito`. Acá se decide QUÉ SE MUESTRA, y lo
// que no se puede comparar no se muestra: sin producto vinculado o sin costo
// interno, la tarjeta dibuja la línea del Papel sola. Una comparación contra
// nada es peor que ninguna comparación.
//
// Módulo puro: sin React, sin Prisma y sin red.

import {
  cantidadEnEscalaDelPedido,
  escalaSinDeducir,
  gananciaDelRenglonPct,
  importeDelPapel,
  quedoEnBultos,
} from "./estadoDeLineaFacturada";
// ── SIN PAPEL, LA MISMA CANTIDAD CON LA QUE SE VALORIZA LA GANANCIA ─────
//
// Con papel el total es su importe (`totalDeLaLinea`). Sin papel no hay
// importe, y lo contado se valoriza con `cuantoSeValoriza`, que ya resuelve si
// el producto va por kilo, si lo pesado manda y en qué escala está la cantidad.
import { cuantoSeValoriza } from "./gananciaDelDeposito";
import { formatearKgExacto } from "@/lib/moneda";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * CÓMO SE NOMBRA LA UNIDAD EN LA QUE SE COMPARAN LOS DOS PRECIOS.
 *
 * Sale del depósito y del pedido, en ese orden:
 *
 *   · si el depósito cuenta por kilo → "kg";
 *   · si el pedido se hizo por bulto Y el bulto existe → "pack";
 *   · si no → "u".
 *
 * El "y el bulto existe" no es un detalle: Papas Congeladas se pide en BULTO y
 * no tiene `factor_pack` —la bolsa ES la unidad de compra—, así que decir
 * "pack" ahí sería nombrar algo que no hay.
 *
 * Es la misma unidad en la que está `costoFactura` —el neto que decide
 * `netoQueFacturaElProveedor`— así que el rótulo y el número no se pueden
 * separar.
 */
export function unidadDeComparacion(fila) {
  if (fila?.porKilo === true) return "kg";
  return quedoEnBultos(fila) && num(fila?.factorPack) > 1 ? "pack" : "u";
}

// `quedoEnBultos` vive desde el 2026-10-09 en `estadoDeLineaFacturada`, al
// lado de `cantidadEnEscalaDelPedido`, que es la función que espeja: ahí la
// necesita la cuenta de lo esperado en unidades físicas, y dejarla acá obligaba
// a un import circular. Se reexporta para que la tarjeta y la hoja la sigan
// pidiendo de donde siempre.
export { quedoEnBultos };

/**
 * LA CANTIDAD COMO SE DICE ARRIBA: "12 u", "3 PACK x30".
 *
 * ── LA UNIDAD DE LA CANTIDAD NO ES LA DE LOS PRECIOS ──────────────────────
 *
 * Se parecen y no son la misma, y confundirlas produjo dos rótulos falsos en la
 * primera versión de esta tarjeta, medidos sobre el #242:
 *
 *   · "Salametro · Factura 2 kg". Son 2 PIEZAS, que pesan 2,9 kg. El producto
 *     se costea por kilo —y por eso los precios dicen "/ kg"— pero la cantidad
 *     del pedido está en piezas. "2 kg" afirmaba un peso que no es.
 *   · "Hamburguesa · Factura 3 u". Son 3 PACKS de 30. La cantidad ya venía
 *     convertida a bultos y el rótulo seguía mirando la unidad del pedido, que
 *     en esa línea es UNIDAD.
 *
 * Así que la cantidad se rotula con LA PRESENTACIÓN EN LA QUE ESTÁ CONTADA, que
 * es la que resolvió `cantidadEnEscalaDelPedido`: si esa función devolvió
 * bultos, dice PACK; si devolvió unidades sueltas o piezas, dice "u". Nunca
 * dice "kg" — los kilos del papel son otro dato y se ven en la hoja de
 * Corregir.
 */
export function textoDeLaCantidad(fila) {
  // ── EL FIAMBRE DE PESO VARIABLE QUE SE FACTURA POR KILO ───────────────
  //
  // Das #255: "SALAME MILAN FELA · 10,94 × 9.375,87". Los 10,94 son KILOS, y
  // la tarjeta decía "10.94 u". En ese renglón la cantidad del papel no son
  // piezas: es el peso, y se dice como peso.
  if (fila?.cantidadEnKilos === true) {
    const kilos = num(fila?.peso);
    return kilos !== null && kilos > 0 ? formatearKgExacto(kilos) : null;
  }
  const cant = num(cantidadEnEscalaDelPedido(fila));
  if (cant === null) return null;
  const entero = Number.isInteger(cant) ? String(cant) : String(Number(cant.toFixed(3)));
  const factor = num(fila?.factorPack);

  // La MISMA pregunta que usan los precios, para que los dos rótulos no puedan
  // decir cosas distintas sobre el mismo renglón.
  const piezas =
    quedoEnBultos(fila) && factor !== null && factor > 1
      ? `${entero} PACK x${factor}`
      : `${entero} u`;

  // ── Y LOS KILOS DEL PAPEL AL LADO, CUANDO LOS TRAE ───────────────────
  //
  // En un producto que el depósito cuenta por peso, las piezas solas no dicen
  // cuánto entra: el salamín picado son 3 piezas Y 2,100 kg, y lo que se guarda
  // son los kilos. La tarjeta decía "3 u" y quien la miraba no tenía cómo saber
  // que el papel traía el peso impreso.
  //
  // Solo cuando el DEPÓSITO cuenta por peso: en las papas el papel también trae
  // kilos y no significan nada para el stock, que va por bolsa.
  const kilos = num(fila?.peso);
  if (fila?.porKilo === true && kilos !== null && kilos > 0) {
    // `formatearKgExacto` y no una función nueva al lado: ya escribe los kilos
    // como los escribe el resto del sistema —coma decimal, hasta tres
    // decimales, sin ceros de relleno— y su archivo dice por qué separarlas es
    // justamente cómo nacieron los 36 formateadores que hubo que juntar.
    return `${piezas} · ${formatearKgExacto(kilos)}`;
  }
  return piezas;
}

/** El porcentaje como se escribe: "+14,0 %", "−3,2 %". */
export function textoDelPorcentaje(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  const signo = pct >= 0 ? "+" : "−";
  return `${signo}${Math.abs(pct).toFixed(1).replace(".", ",")} %`;
}

/**
 * LOS TRES RENGLONES, YA RESUELTOS.
 *
 * @returns `{ cantidad, papel, erp }`. `erp` es null cuando no hay con qué
 *          comparar, y ahí la tarjeta dibuja el Papel solo.
 */
/**
 * LO QUE VALE ESTE RENGLÓN, EN LA MISMA BASE QUE EL "PAPEL".
 *
 * ── QUÉ ESTABA MAL ────────────────────────────────────────────────────────
 *
 * La tarjeta mostraba abajo a la derecha `fila.subtotal`, que es el subtotal
 * IMPRESO: el neto, sin IVA ni los conceptos del pie. Dos centímetros más
 * arriba, el renglón "Papel" muestra el costo unitario CON los impuestos
 * repartidos, que es la regla de negocio vigente. Medido sobre el pedido 246:
 * "Papel $21.790,88 / pack" y abajo "$17.573,34", que es ese mismo importe
 * dividido por 1,24. Dos bases en la misma tarjeta, y la de abajo sin rótulo
 * que dijera cuál era.
 *
 * ── DE DÓNDE SALE ─────────────────────────────────────────────────────────
 *
 * Del costo final de la fila según el papel —`importeDelPapel`: lo que cuesta
 * con todo lo que el papel le carga—, no de `subtotal`, que es el neto y que
 * la hoja de Corregir compara contra lo impreso. Así queda en la misma base que
 * el renglón "Papel". Hasta el 2026-10-26 se multiplicaba lo recibido por el
 * precio de la tarjeta, y eso podía no dar el papel (ver abajo).
 *
 * @returns el importe, o `null` cuando el papel no dio el costo de esa fila.
 */
//
// ── SIN PAPEL, EL COSTO ES EL DEL PEDIDO ──────────────────────────────────
//
// Una fila que llegó sin factura no tiene `costoFactura`: el único costo que hay
// es el del pedido, y con ése se valoriza. No es una comparación —no hay dos
// números— sino lo que vale lo que se contó.
//
// ── CON PAPEL, EL TOTAL ES EL IMPORTE DEL PAPEL, SIEMPRE ──────────────────
//
// Regla de Emanuel del 2026-10-26. Era lo recibido por el precio de la tarjeta,
// y en Pablo #337 Santa Julia decía Total $233.400 sobre un papel de $116.700:
// lo recibido estaba en otra escala que el precio. El importe es un dato del
// papel; si la cantidad y el precio de la tarjeta no lo dan, el error es del
// sistema y la fila no se marca como buena (`cuadraConElPapel`).
export function totalDeLaLinea(fila) {
  if (fila?.sinPapel !== true) return importeDelPapel(fila);
  const unitario = num(fila?.costoCatalogo);
  if (unitario === null) return null;
  const cuantos = num(cuantoSeValoriza(fila));
  if (cuantos === null) return null;
  return cuantos * unitario;
}

export function renglonesDeLaTarjeta(fila) {
  const unidad = unidadDeComparacion(fila);
  const papel = num(fila?.costoFactura);
  const erp = num(fila?.costoCatalogo);
  // Sin saber en qué viene no hay porcentaje: sería de otra escala, y un
  // "+91,4 %" en verde se lee como normal (Pablo #337, `escalaSinDeducir`).
  const pct = escalaSinDeducir(fila) ? null : gananciaDelRenglonPct(fila);

  return {
    cantidad: textoDeLaCantidad(fila),
    /** Lo que vale el renglón entero, en la misma base que `papel`. */
    total: totalDeLaLinea(fila),
    // Un renglón bonificado no tiene precio del papel, y no es que falte: el
    // papel lo regala. Se dice "bonificado" donde iría el importe.
    papel:
      fila?.bonificado === true
        ? { importe: null, unidad, bonificado: true }
        : papel === null
          ? null
          : { importe: papel, unidad },
    /** Sin papel: el costo del pedido, solo, sin nada contra qué compararlo. */
    costo: fila?.sinPapel === true && erp !== null ? { importe: erp, unidad } : null,
    // ── SIN LOS DOS PRECIOS NO HAY LÍNEA DE ERP ────────────────────────
    //
    // Un renglón sin vincular no tiene producto, y uno sin costo cargado no
    // tiene contra qué. En los dos casos la tarjeta muestra el Papel solo: es
    // la verdad, y es lo que la persona necesita para cotejar contra la foto.
    erp:
      papel === null || erp === null
        ? null
        : {
            importe: erp,
            unidad,
            pct,
            // "+2,9 %" cuando el ERP está más caro que el papel. El color lo
            // elige la tarjeta con `tonoDelPorcentaje`: verde positivo, rojo
            // negativo. El signo y el color dicen lo mismo a propósito.
            texto: textoDelPorcentaje(pct),
          },
  };
}
