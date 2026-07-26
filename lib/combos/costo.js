// lib/combos/costo.js
//
// Cálculo del COSTO de un combo a partir de sus componentes. Reutiliza la
// convención canónica de costo unitario del ERP (misma que el reporte
// valorizado y lib/stock/mapItem), centralizada acá para no volver a duplicarla.
//
// Convención de costo unitario de UN componente (decisión explícita de E2):
//   costoUnitario = (ProductoLocal.precio_costo ?? ProductoBase.precio_costo)
//                   / (factor_pack > 1 ? factor_pack : 1)
//   · Override con `??` (nullish), NO `||`: un costo local de 0 NO cae al
//     fallback de la base (criterio del reporte valorizado; el POS usa `||`,
//     divergencia conocida — acá elegimos `??` por ser el correcto).
//   · Se divide por factor_pack cuando factor_pack > 1, porque el costo se
//     almacena POR BULTO en ese caso (ver lib/compras-proveedor/costoMaestro.js).
//   · Fiambre fijo en DEPÓSITO: el costo está por kg y el stock en piezas →
//     costo por pieza = costoPorKg × pesoReferenciaKg (multiplica, no divide).
//     En locales el fiambre sigue en kg → no se ajusta.
//
// El costo del combo es INFORMATIVO (el precio del combo es MANUAL). Sirve para
// mostrar ganancia y margen estimados.

// Ruta relativa CON extensión .js (no alias "@/") para que los tests corran bajo
// `node --test` (Node ESM exige extensión; Turbopack/webpack también la resuelven).
import { esFiambreFijo } from "../conversiones/stock.js";

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// Costo unitario de un componente, en la escala de su StockLocal (unidad o pieza).
// `base` = ProductoBase del componente; `productoLocal` = su ProductoLocal;
// `esDeposito` = si el local propietario del combo es depósito.
export function costoUnitarioComponente({ base, productoLocal, esDeposito = false }) {
  const overrideCosto = num(productoLocal?.precio_costo);
  const baseCosto = num(base?.precio_costo) ?? 0;
  const costo = overrideCosto ?? baseCosto; // '??' intencional

  if (esDeposito && esFiambreFijo(base)) {
    const pesoRef = num(base?.pesoReferenciaKg);
    return pesoRef && pesoRef > 0 ? round2(costo * pesoRef) : round2(costo);
  }

  const factor = Math.max(1, num(base?.factor_pack) || 1);
  return round2(factor > 1 ? costo / factor : costo);
}

// Costo total del combo = Σ (costoUnitarioComponente × cantidad).
// `componentes`: [{ costoUnitario, cantidad }]
export function costoCombo(componentes) {
  let total = 0;
  for (const c of componentes || []) {
    const cu = num(c.costoUnitario) ?? 0;
    const cant = num(c.cantidad) ?? 0;
    total += cu * cant;
  }
  return round2(total);
}

// Ganancia y margen (sobre costo, misma base que el resto del ERP:
// venta = costo × (1 + margen/100) → margen% = (venta − costo)/costo × 100).
// Si el costo es 0, el margen no está definido (null) para no dividir por cero.
export function gananciaYMargen({ precioVenta, costoTotal }) {
  const precio = num(precioVenta) ?? 0;
  const costo = num(costoTotal) ?? 0;
  const ganancia = round2(precio - costo);
  const margen = costo > 0 ? round2((ganancia / costo) * 100) : null;
  return { ganancia, margen };
}
