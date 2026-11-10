// lib/stock/preciosDeStock.js
//
// LOS PRECIOS POR UNIDAD QUE MUESTRAN DOS RUTAS DE STOCK.
//
// Vivían escritos adentro de `app/api/stock_locales/obtener/route.js` y de
// `app/api/stock_locales/buscar-producto/route.js`. Se mudaron acá tal cual
// (tanda 6 de la regla única de unidades, 2026-11-05) por dos razones: la
// división por el bulto pasa a ser la de la pieza (`precioDeLaUnidadDeStock`), y
// así un candado puede correr la MISMA cuenta que la ruta, no una copia.
//
// ── NO SE UNIFICAN LAS CONDICIONES, A PROPÓSITO ────────────────────────────
//
// Cada ruta decide distinto cuándo mostrar el unitario, y la tanda 6 no cambia
// ningún resultado: `obtener` divide si la unidad de medida no es "unidad" y hay
// factor; `buscar-producto` si además el factor es mayor que 1 y hay precio, y
// el fiambre de pieza fija del depósito va por pieza. `stock/mapItem` divide con
// cualquier factor mayor que 1. Con "unidad" y factor 12 dan números distintos,
// y así siguen hasta que se decida cuál es el bueno.
//
// Módulo puro: sin Prisma.

import { esFiambreFijo } from "@/lib/conversiones/stock";
import { redondear100 } from "@/lib/precios/redondeo";
import { precioDeLaPieza, precioDeLaUnidadDeStock } from "@/lib/unidades/reglaDeUnidades";

/**
 * El costo por unidad que contesta `stock_locales/obtener`, y los datos de los
 * que sale. `pl` es el ProductoLocal con su `base` entera.
 */
export function precioUnitarioDeObtener(pl) {
  const precioCostoBulto = Number(pl.precio_costo ?? pl.base.precio_costo);
  const unidadMedida = pl.base.unidad_medida;
  const factorPack = Number(pl.base.factor_pack ?? 0);

  let precioUnitario = precioCostoBulto;
  // La división, con la regla única de unidades (tanda 6); la condición de
  // cuándo se muestra el unitario es la de esta ruta, como siempre.
  if (unidadMedida !== "unidad" && factorPack > 0) {
    precioUnitario = precioDeLaUnidadDeStock({ precio: precioCostoBulto, base: pl.base });
  }
  // Sin redondear: el redondeo a centavos lo hace la ruta al armar el ítem.
  return { precioCostoBulto, unidadMedida, factorPack, precioUnitario };
}

/**
 * Los precios de venta por unidad y por bulto que contesta
 * `stock_locales/buscar-producto`, con el fiambre de pieza fija del depósito.
 */
export function preciosDeVentaDeLaBusqueda(pl, esDeposito) {
  let unidadMedida = pl.base?.unidad_medida || "unidad";
  const factorPack = Number(pl.base?.factor_pack || 1);

  const fiambreFijo = esDeposito && esFiambreFijo(pl.base);
  const pesoReferenciaKg = fiambreFijo ? Number(pl.base.pesoReferenciaKg) : 0;

  const precioDB = Number(pl.precio_venta || pl.base?.precio_venta || 0);
  let precioVentaBulto = precioDB;
  let precioVentaUnitario = precioDB;

  if (fiambreFijo) {
    // La pieza desde el kilo, con la pieza única de unidades (tanda 17).
    const precioPorPieza = precioDeLaPieza({ precioPorKilo: precioDB, pesoKg: pesoReferenciaKg }) ?? 0;
    precioVentaUnitario = precioPorPieza;
    precioVentaBulto = precioPorPieza;
    unidadMedida = "unidad";
  } else if (factorPack > 1 && unidadMedida !== "unidad" && precioDB > 0) {
    // La división, con la regla única de unidades (tanda 6).
    precioVentaUnitario = Number(precioDeLaUnidadDeStock({ precio: precioDB, base: pl.base }).toFixed(2));
    precioVentaBulto = Number(precioDB.toFixed(2));
  }

  if (pl.base?.redondeo_100 === true && !fiambreFijo) {
    precioVentaUnitario = redondear100(precioVentaUnitario);
  }

  return { unidadMedida, factorPack, fiambreFijo, pesoReferenciaKg, precioVentaBulto, precioVentaUnitario };
}
