// UNA LÍNEA NO PUEDE DECIR "UNIDAD SUELTA" Y TRAER EL COSTO DEL BULTO.
//
// ── QUÉ DETECTA, Y POR QUÉ ES INEQUÍVOCO ────────────────────────────────────
//
// El POS del depósito manda cada línea con `modoVentaLinea`:
//
//   NORMAL            → cantidad en BULTOS, precio y costo del bulto. El servidor
//                       multiplica por el factor para descontar stock.
//   UNIDAD_REMANENTE  → cantidad en UNIDADES sueltas, precio y costo unitarios.
//                       El servidor NO multiplica —`cantidadParaStockNormal` lo
//                       dice: "item.cantidad ya en unidades reales".
//
// Si una línea llega marcada UNIDAD_REMANENTE pero con el costo del BULTO, las
// dos mitades se contradicen: se cobra el bulto y se descuenta una unidad. El
// stock queda corto por (factor − 1) por cada línea.
//
// La comparación es aritmética y no admite interpretación: con un factor mayor
// que 1, el costo del bulto y el unitario NO pueden ser el mismo número. Medido
// sobre las ventas reales del depósito: las 89 ventas unitarias legítimas dan la
// división exacta —1.400 contra 16.800÷12, 2.685 contra 32.220÷12— y ninguna se
// confunde con la otra rama.
//
// ── LAS DOS EXCEPCIONES, DECLARADAS Y NO DEDUCIDAS ──────────────────────────
//
// 1) COSTO CERO. Con costo 0 el del bulto y el unitario son los dos 0, así que
//    toda línea daría positivo. No es una contradicción: es que no hay nada que
//    comparar.
// 2) FACTOR 1. Sin factor no hay dos escalas. La rama de `cantidadParaStockNormal`
//    que multiplica ni siquiera se alcanza.
//
// Fuera de esas dos no encontré ningún caso donde pueda equivocarse.
//
// ── POR QUÉ REGISTRA Y NO RECHAZA ───────────────────────────────────────────
//
// Decisión de Emanuel: no se frena una venta en el mostrador por esto. Rechazar
// sería una venta que no se puede cobrar con gente esperando; corregir en
// silencio cambiaría el precio que el cajero ya le dijo al cliente. Registrar
// deja el rastro con los cuatro datos que hacen falta para encontrarlo.
//
// ── Y ES EL ANCLA QUE HOY NO EXISTE ─────────────────────────────────────────
//
// Esto corre EN EL MOMENTO de la venta, con el factor vigente en ese instante.
// Por eso no sufre el problema que tienen todas las mediciones retrospectivas:
// mirar hacia atrás compara contra el factor de HOY, y cambiar el factor de un
// producto reescribe cómo se leen los documentos ya emitidos. De las 103 líneas
// que parecían mal, 10 eran exactamente eso — el factor cambió después.
//
// Hacia atrás no sirve y no hay forma de que sirva: el factor de entonces no
// quedó guardado en ninguna parte. Hacia adelante, cada caso queda marcado.

import { costoDelSuelto, unidadesDeStockPorEscalon } from "../conversiones/stock.js";
import { MODO_SUELTO } from "./consumoStock.js";

/**
 * EL ESCALÓN SUELTO: ¿una línea SUELTA trae el costo de la UNIDAD, o una línea
 * de UNIDAD (la normal de un local) trae el del SUELTO? Devuelve la
 * contradicción, o null si no la hay o si el producto no tiene sueltos.
 *
 * Los dos costos esperados salen del embudo: la unidad es el bulto dividido las
 * unidades que trae, y el suelto es `costoDelSuelto` de la unidad. Con la misma
 * tolerancia de un centavo y la misma preferencia que la regla de abajo: si el
 * costo coincide con el de su propio escalón, no hay contradicción.
 */
function contradiccionDelSuelto({ modoVentaLinea, costoCliente, costoBulto, factorPack, sueltosPorUnidad, esDeposito }) {
  const esLineaSuelta = modoVentaLinea === MODO_SUELTO;
  const esLineaDeUnidad = !esDeposito && !esLineaSuelta && modoVentaLinea !== "UNIDAD_REMANENTE";
  if (!esLineaSuelta && !esLineaDeUnidad) return null;

  const escalones = unidadesDeStockPorEscalon({ factor_pack: factorPack, sueltos_por_unidad: sueltosPorUnidad });
  if (escalones.unidad <= 1) return null;

  const bulto = num(costoBulto);
  const cliente = num(costoCliente);
  if (bulto === null || bulto <= 0 || cliente === null || cliente < 0) return null;

  const unidad = Number((bulto / (escalones.bulto / escalones.unidad)).toFixed(2));
  const sueltoEsperado = Number(costoDelSuelto(bulto / (escalones.bulto / escalones.unidad), escalones).toFixed(2));
  const es = (x) => Math.abs(cliente - x) < 0.01;

  if (esLineaSuelta && !es(sueltoEsperado) && es(unidad)) {
    return { contradice: true, motivo: MOTIVO.COSTO_DE_UNIDAD_EN_LINEA_SUELTA, costoUnitarioEsperado: sueltoEsperado };
  }
  if (esLineaDeUnidad && !es(unidad) && es(sueltoEsperado)) {
    return { contradice: true, motivo: MOTIVO.COSTO_DE_SUELTO_EN_LINEA_DE_UNIDAD, costoUnitarioEsperado: unidad };
  }
  return null;
}

/** Number finito a partir de number | string | Decimal de Prisma. */
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const MOTIVO = {
  SIN_CONTRADICCION: null,
  COSTO_DE_BULTO_EN_LINEA_UNITARIA: "COSTO_DE_BULTO_EN_LINEA_UNITARIA",
  // Tercer nivel de empaque: las mismas dos mitades que se contradicen, un
  // escalón más abajo. Una línea SUELTA descuenta 1 y una de unidad descuenta N:
  // con el costo del otro escalón, la ganancia de la línea sale N veces mal.
  COSTO_DE_UNIDAD_EN_LINEA_SUELTA: "COSTO_DE_UNIDAD_EN_LINEA_SUELTA",
  COSTO_DE_SUELTO_EN_LINEA_DE_UNIDAD: "COSTO_DE_SUELTO_EN_LINEA_DE_UNIDAD",
};

/**
 * ¿Esta línea se contradice a sí misma?
 *
 * @param {object} args
 * @param {string} args.modoVentaLinea   lo que mandó el cliente
 * @param {number|string} args.costoCliente  el `precioCosto` que mandó el cliente
 * @param {number|string} args.costoBulto    el costo del ProductoLocal, leído del servidor
 * @param {number|string} args.factorPack    el factor VIGENTE en este momento
 * @param {number|string|null} [args.sueltosPorUnidad]  los sueltos VIGENTES (tercer nivel)
 * @param {boolean} [args.esDeposito]  una línea NORMAL de local es de UNIDAD
 * @returns {{contradice: boolean, motivo: string|null, costoUnitarioEsperado: number|null}}
 */
export function detectarEscalaContradictoria({
  modoVentaLinea,
  costoCliente,
  costoBulto,
  factorPack,
  sueltosPorUnidad = null,
  esDeposito = false,
} = {}) {
  const sin = { contradice: false, motivo: MOTIVO.SIN_CONTRADICCION, costoUnitarioEsperado: null };

  // El escalón suelto se mira aparte: el resto de la función es la regla de
  // siempre, para la unidad suelta del depósito.
  const suelto = contradiccionDelSuelto({ modoVentaLinea, costoCliente, costoBulto, factorPack, sueltosPorUnidad, esDeposito });
  if (suelto) return suelto;

  // Solo aplica a la rama que NO multiplica.
  if (modoVentaLinea !== "UNIDAD_REMANENTE") return sin;

  const factor = num(factorPack);
  // EXCEPCIÓN 2: sin factor no hay dos escalas que distinguir.
  if (factor === null || factor <= 1) return sin;

  const bulto = num(costoBulto);
  // EXCEPCIÓN 1: con costo cero el del bulto y el unitario son el mismo número.
  //
  // ⚠️ ES REDUNDANTE y se deja igual, con esta nota para que nadie la borre
  // creyendo que hace algo ni la defienda creyendo que protege: con costo 0 el
  // unitario también da 0, así que la comparación `esElUnitario` de abajo ya
  // devuelve "sin contradicción" antes de llegar a marcar. Comprobado sacándola:
  // ningún candado se pone rojo.
  //
  // Se conserva porque hace explícita una condición con la que este control fue
  // aprobado, y porque cubre un costo NEGATIVO, que la otra rama no atrapa.
  if (bulto === null || bulto <= 0) return sin;

  const cliente = num(costoCliente);
  // Sin costo del cliente el servidor calcula el unitario por su cuenta
  // (`costoBulto / factorPack` en ventaConsumo), así que no hay contradicción
  // posible: es el caso de la cola offline, que no guarda `precioCosto`.
  if (cliente === null || cliente < 0) return sin;

  const unitario = Number((bulto / factor).toFixed(2));

  // La tolerancia es de un centavo: es la escala en la que están guardados los
  // dos números. Más ancha empezaría a tapar factores chicos —con factor 2 el
  // unitario es la mitad, y la mitad de un costo bajo puede quedar cerca.
  const esElDelBulto = Math.abs(cliente - bulto) < 0.01;
  const esElUnitario = Math.abs(cliente - unitario) < 0.01;

  // Si coincide con el unitario, es una venta unitaria legítima — aunque por
  // redondeo también quedara cerca del bulto, gana el unitario.
  if (esElUnitario) return sin;
  if (!esElDelBulto) return sin;

  return {
    contradice: true,
    motivo: MOTIVO.COSTO_DE_BULTO_EN_LINEA_UNITARIA,
    costoUnitarioEsperado: unitario,
  };
}
