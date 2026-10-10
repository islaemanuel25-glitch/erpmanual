// LOS CARGOS DEL PROVEEDOR VAN ADENTRO DEL COSTO DE LA MERCADERÍA.
//
// ── EL CASO (CCU #257, 2026-10-10) ────────────────────────────────────────
//
// "300016 Servicio Logístico · CU 1 · 1.436,27 · Pr.Un.Fin 1.780,32". No es
// mercadería: no se vende, no tiene producto en el catálogo y no entra al
// stock. Pero es plata que sale por esa compra, y la regla de Emanuel del
// 2026-10-08 es que el costo lleva TODO lo de la boleta. Así que el costo final
// del cargo se REPARTE entre los renglones de mercadería, en proporción a su
// costo final.
//
// ── Y LOS ENVASES NO ──────────────────────────────────────────────────────
//
// Las botellas de cambio de Secco a $0,025 siguen como en #163: suman al papel
// y no tocan ningún costo (`envase.js`). Un envase es un cargo simbólico que se
// devuelve; un flete es un gasto de la compra.
//
// ── CÓMO SE REPARTE ───────────────────────────────────────────────────────
//
// En centavos y por renglón, con el resto de redondeo al renglón de mayor costo
// —el mismo criterio que tenía el reparto del pie—: así la suma de las partes
// es exactamente el cargo y el papel sigue cerrando contra su total. Un
// renglón bonificado (costo cero) no carga nada: no hay proporción de cero.
//
// Módulo puro: sin Prisma, sin React y sin red.

import { aCentavos } from "./impuestos.js";
import { TIPO_RENGLON, tipoDelRenglon } from "./lector/lecturaInterpretada.js";

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** El costo final de un renglón —leído o guardado— en centavos, o null. */
const costoCentavos = (l) => {
  const c = num(l?.costoFinalRenglon ?? l?.costoFinal);
  return c === null ? null : aCentavos(c);
};

/** ¿Este renglón es un cargo del proveedor? Lo dice el modelo en su tipo. */
export function esRenglonDeCargo(linea) {
  return tipoDelRenglon(linea) === TIPO_RENGLON.CARGO;
}

/**
 * LO QUE LE TOCA A CADA RENGLÓN DE MERCADERÍA DE LOS CARGOS DE SU PAPEL.
 *
 * ── SE LE PASA EL COMPROBANTE ENTERO ──────────────────────────────────────
 *
 * La proporción es sobre el costo de TODA la mercadería del papel: con la mitad
 * de los renglones, a cada uno le tocaría el doble. Quien analiza una sola
 * línea —`aceptar-precio`— igual tiene que traer todas.
 *
 * @param lineas  todos los renglones del comprobante, con `orden`,
 *                `costoFinalRenglon` (o `costoFinal`) y `tipoRenglon` (o `tipo`)
 * @returns Map por `orden` → centavos de cargo de ese renglón. Vacío si el
 *          papel no trae cargos o no tiene mercadería con costo.
 */
export function cargosDelPapel(lineas = []) {
  const todas = Array.isArray(lineas) ? lineas : [];
  const totalCargos = todas
    .filter(esRenglonDeCargo)
    .reduce((a, l) => a + (costoCentavos(l) ?? 0), 0);
  const porOrden = new Map();
  if (totalCargos === 0) return porOrden;

  const mercaderia = todas
    .map((l, i) => ({ orden: l?.orden ?? i + 1, costo: costoCentavos(l), tipo: tipoDelRenglon(l) }))
    .filter((l) => l.tipo === TIPO_RENGLON.MERCADERIA && l.costo !== null && l.costo > 0);
  const base = mercaderia.reduce((a, l) => a + l.costo, 0);
  if (base === 0) return porOrden;

  let repartido = 0;
  for (const l of mercaderia) {
    const parte = Math.round((totalCargos * l.costo) / base);
    porOrden.set(l.orden, parte);
    repartido += parte;
  }
  // El resto de redondeo, al de mayor costo: la suma es exactamente el cargo.
  const mayor = mercaderia.reduce((m, l) => (l.costo > m.costo ? l : m), mercaderia[0]);
  porOrden.set(mayor.orden, porOrden.get(mayor.orden) + (totalCargos - repartido));
  return porOrden;
}
