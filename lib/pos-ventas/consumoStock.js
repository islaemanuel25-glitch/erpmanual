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
//
// Cuántas unidades de stock son un bulto o una unidad NO se calcula acá: se le
// pregunta a `unidadesDeStockPorEscalon`, el embudo de la escala. Hoy una unidad
// vale 1 en todos los productos y el resultado es el mismo número de siempre;
// cuando exista el tercer nivel de empaque, la unidad valdrá sus sueltos sin
// tocar esta función.
import { defaultModoEnvio, unidadesDeStockPorEscalon } from "../conversiones/stock.js";

export function cantidadParaStockNormal({ cantidadVenta, esDeposito, baseStock = {}, modoVentaLinea } = {}) {
  const cant = Number(cantidadVenta);
  const escalones = unidadesDeStockPorEscalon({ factor_pack: baseStock.factorPack });
  const vendePorPieza =
    esDeposito && baseStock.modoVentaDeposito === "PIEZA" && Number(baseStock.pesoReferenciaKg) > 0;

  if (vendePorPieza) {
    // PIEZA fiambre fijo: el stock del depósito está en PIEZAS → cantidad tal cual.
    return cant;
  }
  // ¿El bulto trae más de una unidad? Es la pregunta de siempre —factor mayor
  // que 1— hecha en los términos del embudo.
  if (esDeposito && escalones.bulto > escalones.unidad) {
    if (modoVentaLinea === "UNIDAD_REMANENTE") {
      // Remanente: item.cantidad viene en unidades sueltas del bulto.
      return cant * escalones.unidad;
    }
    // NORMAL: replica calcularModoSalida() de buscar-producto.
    // SOLO_UNIDAD → unidad; SOLO_BULTO / MIXTO / null → bulto.
    const modoEnvioEfectivo = baseStock.modo_envio || defaultModoEnvio(baseStock.unidad_medida);
    const modoSalida = modoEnvioEfectivo === "SOLO_UNIDAD" ? "UNIDAD" : "BULTO";
    return modoSalida === "BULTO" ? cant * escalones.bulto : cant * escalones.unidad;
  }
  // Local normal, o producto sin factor_pack: se vende por unidad.
  return cant * escalones.unidad;
}
