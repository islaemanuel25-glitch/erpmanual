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
// Cuántas unidades de stock son un bulto, una unidad o un suelto NO se calcula
// acá: se le pregunta a `unidadesDeStockPorEscalon`, el embudo de la escala,
// con el factor y los sueltos por unidad del producto (tercer nivel de empaque,
// tanda 4). Un BULTO descuenta factor × N, una UNIDAD descuenta N y un SUELTO
// descuenta 1. Hoy ningún producto tiene sueltos, N vale 1 y el resultado es el
// número de siempre.
//
// La escala del COBRO de cada modo vive en el POS (`modoSalidaDeVenta`) y, para
// el suelto, en `lib/pos-ventas/lineaSuelta.js`. Esta función replica la misma
// regla del lado del stock, y la atadura de `escalaDeVenta.test.mjs` las ata en
// las tres escalas.
import { defaultModoEnvio, unidadesDeStockPorEscalon } from "../conversiones/stock.js";

/** El modo de una línea que vende el escalón más chico (el cigarrillo suelto). */
export const MODO_SUELTO = "SUELTO";

export function cantidadParaStockNormal({ cantidadVenta, esDeposito, baseStock = {}, modoVentaLinea } = {}) {
  const cant = Number(cantidadVenta);
  // Lo que se mide por peso no tiene sueltos: el kilo no se reparte.
  const escalones = unidadesDeStockPorEscalon({
    factor_pack: baseStock.factorPack,
    sueltos_por_unidad: baseStock.unidad_medida === "kg" ? null : baseStock.sueltos_por_unidad,
  });
  const vendePorPieza =
    esDeposito && baseStock.modoVentaDeposito === "PIEZA" && Number(baseStock.pesoReferenciaKg) > 0;

  if (vendePorPieza) {
    // PIEZA fiambre fijo: el stock del depósito está en PIEZAS → cantidad tal cual.
    return cant;
  }
  if (modoVentaLinea === MODO_SUELTO) {
    // El escalón más chico: un suelto es una unidad de stock. Quién puede vender
    // suelto (solo un local, con sueltos y con precio) lo decide `lineaSuelta`.
    return cant * escalones.suelto;
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
