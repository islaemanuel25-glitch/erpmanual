// lib/stock/control/valorDeLaDiferencia.js
//
// CUÁNTA PLATA ES UNA DIFERENCIA DEL CONTROL DE STOCK.
//
// Con las MISMAS dos funciones con que Finanzas → Valor del Stock valoriza una
// cantidad, y en la misma escala:
//
//   · `costoPorUnidadFisica` lleva el costo de la ficha —el de la ubicación si
//     lo tiene, si no el de la base— a lo que vale UNA unidad de
//     `StockLocal.cantidad` en esta ubicación. Es la que resuelve el precio
//     guardado por bulto: un pack de 6 a $6.000 vale $1.000 por unidad física.
//     Acá no se divide por ningún factor;
//   · `valorEnCentavos` multiplica milésimas por ese costo con el redondeo del
//     Valor del Stock.
//
// El costo es el de la ficha en el momento de calcular. Para un control abierto
// es el de hoy; al terminar, el informe se congela con el de ese momento.
//
// Sin costo conocido —sin precio, una conversión ambigua— la diferencia NO vale
// cero: queda sin importe y el informe lo dice. Lo mismo que el Valor del Stock.
//
// Puro: no conoce Prisma.

import { costoPorUnidadFisica, ESTADO_COSTO_FISICO } from "../../conversiones/costoPorUnidadFisica.js";
import { aPesos, valorEnCentavos } from "../libro/valorDelStock.js";

/**
 * @param {object} p
 * @param {number} p.diferencia   contado − sistema, en la unidad física del stock
 * @param {object} p.base         la ficha (`ProductoBase`, con su escala)
 * @param {*}      p.costoLocal   `ProductoLocal.precio_costo`
 * @param {boolean} p.esDeposito
 * @returns {{ costoUnitario: number|null, importe: number|null }}
 */
export function valorDeLaDiferencia({ diferencia, base, costoLocal = null, esDeposito }) {
  const r = costoPorUnidadFisica({ costoBase: base?.precio_costo, costoLocal, producto: base, esDeposito: esDeposito === true });
  if (r.estado !== ESTADO_COSTO_FISICO.CONOCIDO) return { costoUnitario: null, importe: null };
  const milesimas = Math.round(Number(diferencia) * 1000);
  return { costoUnitario: r.costoPorUnidadFisica, importe: aPesos(valorEnCentavos(milesimas, r.costoPorUnidadFisica)) };
}
