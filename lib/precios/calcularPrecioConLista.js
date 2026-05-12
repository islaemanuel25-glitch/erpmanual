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
      if (margen == null || margen === 0) {
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
