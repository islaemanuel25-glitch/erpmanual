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
  const factor = num(fila?.factorPack);
  return fila?.unidadPedido === "BULTO" && factor !== null && factor > 1 ? "pack" : "u";
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

  // ¿Quedó contada en BULTOS? Lo decide el veredicto de la factura cuando hay
  // uno —es el que convirtió el número— y si no, la unidad del pedido.
  const veredicto = fila?.unidad;
  const enBultos = veredicto && !veredicto.requiereDecision
    ? veredicto.unidad === "POR_BULTO"
    : fila?.unidadPedido === "BULTO";

  if (enBultos && factor !== null && factor > 1) return `${entero} PACK x${factor}`;
  return `${entero} u`;
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
export function renglonesDeLaTarjeta(fila) {
  const unidad = unidadDeComparacion(fila);
  const papel = num(fila?.costoFactura);
  const erp = num(fila?.costoCatalogo);
  const pct = gananciaDelRenglonPct(fila);

  return {
    cantidad: textoDeLaCantidad(fila),
    papel: papel === null ? null : { importe: papel, unidad },
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
