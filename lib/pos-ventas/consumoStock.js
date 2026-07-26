// lib/pos-ventas/consumoStock.js
//
// Conversión de la cantidad de VENTA de una línea NORMAL a la escala de
// StockLocal. Extraída VERBATIM de app/api/pos-ventas/crear/route.js (el bloque
// que calculaba `cantidadParaStock`) para que productos normales mantengan
// paridad EXACTA y para que el plan de consumo de combos reutilice la MISMA
// lógica sin duplicarla.
//
// StockLocal está SIEMPRE en UNIDADES (excepto PIEZA de fiambre fijo en depósito,
// que va en piezas). El POS envía la cantidad en la unidad de venta efectiva
// (BULTO, UNIDAD o PIEZA). `baseStock` = { factorPack, modoVentaDeposito,
// pesoReferenciaKg, modo_envio, unidad_medida }.
import { defaultModoEnvio } from "../conversiones/stock.js";

export function cantidadParaStockNormal({ cantidadVenta, esDeposito, baseStock = {}, modoVentaLinea } = {}) {
  const cant = Number(cantidadVenta);
  const factorPackItem = Math.max(1, Number(baseStock.factorPack) || 1);
  const vendePorPieza =
    esDeposito && baseStock.modoVentaDeposito === "PIEZA" && Number(baseStock.pesoReferenciaKg) > 0;

  if (vendePorPieza) {
    // PIEZA fiambre fijo: el stock del depósito está en PIEZAS → cantidad tal cual.
    return cant;
  }
  if (esDeposito && factorPackItem > 1) {
    if (modoVentaLinea === "UNIDAD_REMANENTE") {
      // Remanente: item.cantidad ya en unidades reales → no multiplica por pack.
      return cant;
    }
    // NORMAL: replica calcularModoSalida() de buscar-producto.
    // SOLO_UNIDAD → unidad; SOLO_BULTO / MIXTO / null → bulto.
    const modoEnvioEfectivo = baseStock.modo_envio || defaultModoEnvio(baseStock.unidad_medida);
    const modoSalida = modoEnvioEfectivo === "SOLO_UNIDAD" ? "UNIDAD" : "BULTO";
    return modoSalida === "BULTO" ? cant * factorPackItem : cant;
  }
  // Local normal, o producto sin factor_pack: cantidad directa.
  return cant;
}
