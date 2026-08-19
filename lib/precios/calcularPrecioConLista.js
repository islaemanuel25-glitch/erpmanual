// lib/precios/calcularPrecioConLista.js
//
// Funcion pura — sin acceso a BD, sin side effects.
// Calcula el precio final aplicando una lista comercial.
//
// Entrada:
//   { precioVenta, costo, lista }
//     - precioVenta: number  (precio_venta del producto base)
//     - costo:       number  (precio_costo del producto base)
//     - lista:       { id, tipoBase, margenPorcentaje, redondeo_100 } | null | undefined
//
// Salida:
//   {
//     precioFinal:        number,
//     tipoPrecioAplicado: 'PRECIO_VENTA' | 'COSTO_MAS_MARGEN' | 'COSTO_PURO' | 'MANUAL_AUTORIZADO',
//     margenAplicado:     number | null,
//     listaPrecioId:      number | null,
//   }

import { redondear100 } from "./redondeo";

function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  // Decimal / string
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

// ── "ESTA LISTA COBRA EL COSTO PELADO" ────────────────────────────────────────
//
// Sale de acá y no de una función parecida al lado porque este criterio ya lo
// decidía el `switch` de abajo, en la rama COSTO, para elegir entre COSTO_PURO y
// COSTO_MAS_MARGEN. El catálogo necesita la MISMA pregunta —para saber si el
// número grande de la tarjeta tiene que ser el costo— y si la reescribiera por su
// cuenta habría dos criterios que, el día que uno cambie, dejan la tarjeta y el
// POS diciendo cosas distintas sobre el mismo producto.
//
// Es un predicado sobre la LISTA, no sobre el producto: no mira precios, así que
// contesta sin fila. Por eso el catálogo lo puede preguntar UNA vez por pedido en
// vez de una por producto.
//
// Margen nulo y margen cero son el mismo caso a propósito: una lista al costo con
// 0 % de recargo cobra el costo, igual que una sin margen cargado. Es la misma
// condición que usa la rama COSTO, y ahora la usa desde acá.
export function esListaAlCosto(lista) {
  if (!lista || lista.tipoBase !== "COSTO") return false;
  const margen = lista.margenPorcentaje == null ? null : toNumber(lista.margenPorcentaje);
  return margen == null || margen === 0;
}

export function calcularPrecioConLista({ precioVenta, costo, lista } = {}) {
  const pv = toNumber(precioVenta);
  const co = toNumber(costo);

  // Sin lista — comportamiento POS clasico
  if (!lista) {
    return {
      precioFinal: pv,
      tipoPrecioAplicado: "PRECIO_VENTA",
      margenAplicado: null,
      listaPrecioId: null,
    };
  }

  const margen = lista.margenPorcentaje == null ? null : toNumber(lista.margenPorcentaje);
  const redondear = !!lista.redondeo_100;

  let precioFinal;
  let tipoPrecioAplicado;
  let margenAplicado = null;

  switch (lista.tipoBase) {
    case "PRECIO_VENTA": {
      precioFinal = pv;
      tipoPrecioAplicado = "PRECIO_VENTA";
      margenAplicado = null;
      break;
    }
    case "COSTO": {
      // La condición vive en `esListaAlCosto` y se llama desde acá. Antes estaba
      // escrita inline en este `if`; se extrajo para que el catálogo pueda hacer
      // la misma pregunta sin reimplementarla.
      if (esListaAlCosto(lista)) {
        precioFinal = co;
        tipoPrecioAplicado = "COSTO_PURO";
        margenAplicado = 0;
      } else {
        precioFinal = co * (1 + margen / 100);
        tipoPrecioAplicado = "COSTO_MAS_MARGEN";
        margenAplicado = margen;
      }
      break;
    }
    case "MANUAL_AUTORIZADO": {
      throw new Error("Lista MANUAL_AUTORIZADO requiere precio manual explicito");
    }
    default: {
      // Fallback defensivo — tipo desconocido se comporta como PRECIO_VENTA
      precioFinal = pv;
      tipoPrecioAplicado = "PRECIO_VENTA";
      margenAplicado = null;
    }
  }

  if (redondear) {
    precioFinal = redondear100(precioFinal);
  }

  return {
    precioFinal,
    tipoPrecioAplicado,
    margenAplicado,
    listaPrecioId: lista.id ?? null,
  };
}
