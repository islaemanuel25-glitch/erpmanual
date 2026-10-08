// LOS TRES RENGLONES DE LA TARJETA DE RECEPCIÓN.
//
// ── QUÉ DICE LA TARJETA, Y EN QUÉ ORDEN ───────────────────────────────────
//
//   Factura  12 u                 ← cuánto vino, en la escala del pedido
//   Papel    $8.166,54 / u        ← lo que cobra el proveedor, por esa unidad
//   ERP      $9.500,00 / u  +14,0 %  ← el precio interno, en LA MISMA unidad
//
// El porcentaje va sobre el ERP: positivo y verde cuando el precio interno es
// mayor —el depósito gana la diferencia— y negativo y naranja cuando el
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

import { cantidadEnEscalaDelPedido, gananciaDelRenglonPct } from "./estadoDeLineaFacturada";
// ── LA MISMA CANTIDAD CON LA QUE SE VALORIZA LA GANANCIA ────────────────
//
// `cuantoSeValoriza` ya resuelve las tres preguntas que tiene esta cuenta —si
// el producto va por kilo, si lo pesado manda sobre lo declarado, y en qué
// escala está la cantidad contra el costo— y su archivo tiene el caso medido
// que costó cada una. Escribir la multiplicación al lado daría un total de la
// tarjeta distinto del total de la ganancia sobre el mismo renglón.
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
 * devuelve BULTOS —mira `lecturas[...].bultos` en las dos ramas—; si no, deja
 * la cantidad cruda, que está en la unidad de la línea del pedido.
 */
export function quedoEnBultos(fila) {
  const veredicto = fila?.unidad;
  if (veredicto && !veredicto.requiereDecision) {
    const elegida = veredicto.unidad === "POR_UNIDAD" ? "porUnidad" : "porBulto";
    if (num(veredicto?.lecturas?.[elegida]?.bultos) !== null) return true;
  }
  return fila?.unidadPedido === "BULTO";
}

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
 * ── POR QUÉ MULTIPLICA Y NO LEE UN CAMPO ──────────────────────────────────
 *
 * Porque el campo que existe —`subtotal`— es el neto, y otras pantallas lo
 * leen como neto: la hoja de Corregir lo compara contra lo que dice el papel,
 * que está impreso sin impuestos. Cambiarlo ahí rompería esa comparación. El
 * total de la tarjeta se calcula aparte, con el costo que la tarjeta ya
 * muestra.
 *
 * Es la MISMA cuenta que hace la ganancia del depósito —`cuantoSeValoriza`
 * por `costoFactura`—, así que la suma de los totales de las tarjetas da el
 * mismo número que el renglón "Factura de esos N" de la cabecera, que a su vez
 * cierra contra el total impreso del papel.
 *
 * @returns el importe, o `null` cuando el renglón no tiene costo con impuestos
 *          —uno sin vincular no tiene producto, así que tampoco tiene "Papel"—.
 *          Null y no el neto: poner ahí el número sin impuestos sería volver a
 *          mezclar las dos bases, ahora con un rótulo que afirma que no.
 */
//
// ── SIN PAPEL, EL COSTO ES EL DEL PEDIDO ──────────────────────────────────
//
// Una fila que llegó sin factura no tiene `costoFactura`: el único costo que hay
// es el del pedido, y con ése se valoriza. No es una comparación —no hay dos
// números— sino lo que vale lo que se contó.
export function totalDeLaLinea(fila) {
  const unitario = num(fila?.sinPapel === true ? fila?.costoCatalogo : fila?.costoFactura);
  if (unitario === null) return null;
  const cuantos = num(cuantoSeValoriza(fila));
  if (cuantos === null) return null;
  return cuantos * unitario;
}

export function renglonesDeLaTarjeta(fila) {
  const unidad = unidadDeComparacion(fila);
  const papel = num(fila?.costoFactura);
  const erp = num(fila?.costoCatalogo);
  const pct = gananciaDelRenglonPct(fila);

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
            texto: textoDelPorcentaje(pct),
            // Verde cuando el depósito gana, naranja cuando pierde. El signo y
            // el color dicen lo mismo a propósito: un color solo no se lee.
            gana: pct !== null && pct >= 0,
          },
  };
}
