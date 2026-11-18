// lib/compras-proveedor/comprobante/precioCuadra.js
//
// ¿EL PRECIO DEL PAPEL CUADRA CON UN COSTO? Vivía en `vinculo.js`; se mudó
// tal cual el 2026-11-18 porque desde la regla de desempate entre el código y
// el texto (`codigoCompartido.js`) la necesitan también las listas, y
// `conciliarLista.js` no puede importar `vinculo.js`, que la importa a ella.
// `vinculo.js` la sigue exportando: los llamadores de siempre no cambian.

import { VARIACION_POR_DEFECTO } from "@/lib/compras-proveedor/decisionDeCostoSugerida";
import { costoEnLaUnidad } from "@/lib/unidades/reglaDeUnidades";

/**
 * ¿EL PRECIO DEL PAPEL CUADRA CON EL COSTO DE LA LÍNEA DEL PEDIDO?
 *
 * El precio delata la escala: $3.360 por unidad contra $33.600 el pack de 10 no
 * es una baja del 90 %, es unidad contra pack. Se prueban las tres lecturas
 * —igual, el papel por unidad y la línea por bulto, o al revés— y cuadra si
 * alguna cae dentro de la variación normal del proveedor. Sin precio en el
 * papel o sin costo en la línea no hay con qué: no cuadra, y no vincula solo.
 *
 * @param precio `{ importe, cantidad }` del renglón del papel
 * @param linea  la línea del pedido: `precioCostoDelPedido`, `factorPack`
 */
export function precioCuadra({ precio, linea, variacionPct = null } = {}) {
  const importe = Number(precio?.importe);
  const cantidad = Number(precio?.cantidad);
  const costo = Number(linea?.precioCostoDelPedido ?? linea?.precioCosto);
  if (!(importe > 0) || !(cantidad > 0) || !(costo > 0)) return false;
  const unitario = importe / cantidad;
  const factor = Number(linea?.factorPack) > 1 ? Number(linea.factorPack) : 1;
  // `Number(null)` es 0: sin variación dicha va la del sistema, no un margen cero.
  const margen = (variacionPct != null && Number.isFinite(Number(variacionPct)) ? Number(variacionPct) : VARIACION_POR_DEFECTO) / 100;
  const cerca = (a, b) => Math.abs(a - b) <= b * margen;
  // De la unidad al bulto, con el conversor de la pieza única (tanda 13) y el
  // factor de la línea: un factor mayor que 1 es un pack para la lectora.
  const alBulto = (precioDeUnaUnidad) => costoEnLaUnidad({ costo: precioDeUnaUnidad, de: "UNIDAD", a: "BULTO", base: { factor_pack: factor } });
  return cerca(unitario, costo) || cerca(alBulto(unitario), costo) || cerca(unitario, alBulto(costo));
}
