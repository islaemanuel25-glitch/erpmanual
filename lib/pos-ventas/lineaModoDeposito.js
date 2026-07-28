// lib/pos-ventas/lineaModoDeposito.js
//
// Helpers PUROS para el toggle "Pack | Unidad suelta" de una línea de la
// corrección (Opción A: una línea = un modo, copiando la semántica del POS de
// depósito). NO reinventa la conversión física: reutiliza cantidadParaStockNormal
// (el MISMO helper que usa crear/planConsumoVenta) y las escalas del POS.
//
// modoVentaLinea:
//   · MODO_PACK   ("NORMAL")            → cantidad = packs;  cantidadStock = packs×factor
//   · MODO_UNIDAD ("UNIDAD_REMANENTE")  → cantidad = unidades; cantidadStock = unidades
//
// Escalas por línea (guardadas en el estado del editor): precioBulto/precioUnitario
// y costoBulto/costoUnitario. Al togglear se intercambia la escala (no se divide/
// multiplica a mano). Para líneas existentes las escalas se DERIVAN del costo/precio
// congelado (no se re-consulta el maestro). Para agregados se capturan de buscar-producto.

import { cantidadParaStockNormal } from "./consumoStock.js";

export const MODO_PACK = "NORMAL";
export const MODO_UNIDAD = "UNIDAD_REMANENTE";

export const aCent = (n) => { const x = Number(n); return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) : 0; };
export const desdeCent = (c) => (Number(c) || 0) / 100;
export const round2 = (n) => { const x = Number(n); return Number.isFinite(x) ? Math.round((x + Number.EPSILON) * 100) / 100 : 0; };

/** ¿La línea permite togglear Pack/Unidad? Depósito + factor>1 + no SOLO_UNIDAD. */
export function permiteToggleDeposito({ esDeposito, factorPack, modoEnvio } = {}) {
  return esDeposito === true
    && Math.max(1, Number(factorPack) || 1) > 1
    && String(modoEnvio || "").toUpperCase() !== "SOLO_UNIDAD";
}

/** Modos permitidos para una línea (para restringir la UI). */
export function modosPermitidos({ esDeposito, factorPack, modoEnvio } = {}) {
  if (!permiteToggleDeposito({ esDeposito, factorPack, modoEnvio })) {
    // Un único modo: SOLO_UNIDAD o sin pack → la cantidad va en la escala natural.
    return [String(modoEnvio || "").toUpperCase() === "SOLO_UNIDAD" ? MODO_UNIDAD : MODO_PACK];
  }
  return [MODO_PACK, MODO_UNIDAD];
}

/** cantidadStock física según modo — reutiliza el helper del POS (no duplica reglas). */
export function cantidadStockLinea({ cantidad, modoVentaLinea, factorPack, modoEnvio, esDeposito } = {}) {
  return cantidadParaStockNormal({
    cantidadVenta: Number(cantidad) || 0,
    esDeposito: esDeposito === true,
    baseStock: { factorPack: Math.max(1, Number(factorPack) || 1), modo_envio: modoEnvio || null },
    modoVentaLinea: modoVentaLinea || MODO_PACK,
  });
}

/**
 * Infiere el modo con el que se persistió una línea existente, comparando
 * cantidadStock (físico) con cantidad (comercial): stock == cantidad×factor → Pack.
 */
export function inferirModo({ cantidad, cantidadStock, factorPack } = {}) {
  const f = Math.max(1, Number(factorPack) || 1);
  const cant = Number(cantidad) || 0;
  const stock = Number(cantidadStock);
  if (f > 1 && cant > 0 && Number.isFinite(stock) && Math.round(stock) === Math.round(cant * f)) {
    return MODO_PACK;
  }
  return MODO_UNIDAD;
}

/**
 * Deriva las DOS escalas (bulto/unidad) desde una línea EXISTENTE congelada, sin
 * re-consultar el maestro. El costo/precio físico por unidad es invariante:
 *   Pack:   precio=precioBulto,   unitario = precioBulto/factor
 *   Unidad: precio=precioUnitario, bulto   = precioUnitario×factor
 */
export function escalasDeLineaExistente({ precio, precioCosto, modoActual, factorPack } = {}) {
  const f = Math.max(1, Number(factorPack) || 1);
  const esPack = modoActual === MODO_PACK;
  return {
    precioBulto: esPack ? round2(precio) : round2(Number(precio) * f),
    precioUnitario: esPack ? round2(Number(precio) / f) : round2(precio),
    costoBulto: esPack ? round2(precioCosto) : round2(Number(precioCosto) * f),
    costoUnitario: esPack ? round2(Number(precioCosto) / f) : round2(precioCosto),
  };
}

/**
 * Devuelve el patch { modoVentaLinea, precio, precioCosto } para togglear al modo
 * destino, usando las escalas ya guardadas en la línea (no divide/multiplica).
 */
export function rescalarLinea(linea, modoDestino) {
  if (modoDestino === MODO_UNIDAD) {
    return { modoVentaLinea: MODO_UNIDAD, precio: round2(linea.precioUnitario), precioCosto: round2(linea.costoUnitario) };
  }
  return { modoVentaLinea: MODO_PACK, precio: round2(linea.precioBulto), precioCosto: round2(linea.costoBulto) };
}

/**
 * ¿El costo de un producto agregado es resoluble? Se considera NO resoluble solo
 * cuando faltan por completo los campos de costo (undefined/null). Un costo 0 con
 * maestro realmente 0 es válido (no se bloquea).
 */
export function costoResoluble(item = {}) {
  const b = item.costoBulto ?? item.precioCostoBulto;
  const u = item.costoUnitario ?? item.precioCostoUnitario;
  return (b != null && Number.isFinite(Number(b))) || (u != null && Number.isFinite(Number(u)));
}

/**
 * Cálculos de una línea (en CENTAVOS para paridad con el backend). Devuelve
 * subtotal, cantidadStock, costoLinea, ganancia. precio/precioCosto son por unidad
 * COMERCIAL (según el modo).
 */
export function calcLinea({ cantidad, precio, precioCosto, modoVentaLinea, factorPack, modoEnvio, esDeposito } = {}) {
  const cant = Number(cantidad) || 0;
  const subtotalCent = aCent(round2(Number(precio) * cant));
  const costoLineaCent = aCent(round2(Number(precioCosto) * cant));
  const cantidadStock = cantidadStockLinea({ cantidad: cant, modoVentaLinea, factorPack, modoEnvio, esDeposito });
  return {
    subtotal: desdeCent(subtotalCent),
    costoLinea: desdeCent(costoLineaCent),
    ganancia: desdeCent(subtotalCent - costoLineaCent),
    cantidadStock,
  };
}
