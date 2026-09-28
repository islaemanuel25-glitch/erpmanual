// lib/conversiones/costoPorUnidadFisica.js
//
// CUÁNTOS PESOS VALE UNA UNIDAD DE `StockLocal.cantidad`.
//
// ── PARA QUÉ ────────────────────────────────────────────────────────────────
//
// El Stock Diario va a valorizar cantidades. Una cantidad de stock no siempre
// está en la misma unidad que el costo guardado: un pack se guarda por bulto y
// se cuenta en unidades; un producto por kilo que el depósito maneja por pieza
// se costea por kilo y se cuenta en piezas. Esta función contesta, para UN
// producto en UNA ubicación, cuánto vale una unidad de lo que dice la fila de
// stock, y dice con qué regla lo contestó.
//
// Nadie la usa todavía. La conecta el Stock Diario en su propia PR.
//
// ── LAS REGLAS, TAL COMO LAS FIJÓ EL NEGOCIO (2026-09-28) ─────────────────
//
//   1. Un producto por KG tiene el costo SIEMPRE por kilo. `factor_pack` no
//      participa ni del costo ni de la cantidad: si está cargado, se ignora.
//   2. En el DEPÓSITO, un producto por kg con venta por PIEZA y peso de
//      referencia mayor a cero se cuenta en piezas, y una pieza pesa ese peso.
//      El modo de compra NO decide esto. Vale costo por kilo × peso.
//   3. En un local, y en el depósito cuando no es por pieza, el producto por kg
//      se cuenta en kilos y vale su costo por kilo. El peso variable también:
//      no se inventa un peso fijo.
//   4. Un producto que no es por kg se cuenta en unidades físicas. Si es pack o
//      cajón con factor mayor a 1, el costo guardado es el del bulto y la unidad
//      vale costo ÷ factor. En cualquier otro caso vale el costo tal cual. El
//      factor solo participa en esta familia.
//   5. Un combo no tiene stock propio: su valor está en los componentes.
//   6. El costo efectivo lo decide `precioDeLaUbicacion`: un cero no es un precio.
//      Sin costo válido el estado es SIN_COSTO, nunca un cero.
//
// ── QUÉ SE REUSA, Y POR QUÉ NO HAY NINGUNA CUENTA NUEVA ───────────────────
//
//   · El costo efectivo: `precioDeLaUbicacion`.
//   · Si se cuenta por pieza: `esProductoPorPeso`, de la venta por importe del
//     POS. Es EXACTAMENTE la regla 2 —kg, depósito, PIEZA, peso mayor a cero—,
//     sin el modo de compra. No se usa `esFiambreFijo` a propósito: exige
//     compra por unidad, y el negocio dijo que eso no decide.
//   · El valor de una pieza: `valorEnLaEscalaDeVenta` en escala pieza, la misma
//     cuenta que Productos y el POS —kilo × peso, redondeado a centavos—.
//   · El valor de una unidad: `precioUnitarioQueSeCobra` sin redondeo comercial,
//     que divide por el factor solo en pack y cajón. Con eso un costo por kilo
//     nunca se divide.
//   · La unidad física: `UNIDAD_FISICA_STOCK`, los valores del enum
//     `UnidadFisicaStock` del esquema.
//
// ── LA DIVERGENCIA QUE ESTA FUNCIÓN NO ARREGLA ─────────────────────────────
//
// Un producto por kg, en el depósito, con PIEZA, peso mayor a cero y compra POR
// BULTO: acá es pieza, por la regla 2. Hoy Productos, `buscar-producto`, el
// cierre de compra y las transferencias usan `esFiambreFijo` y lo tratan como
// kilo, mientras el consumo del POS lo descuenta como pieza. Esos escritores y
// lectores se corrigen aparte; esta función sigue la regla y lo avisa con la
// anomalía PIEZA_COMPRADA_POR_BULTO.
//
// Módulo puro: sin Prisma, sin React, sin lectura del catálogo vivo.

import { esFiambreFijoEnUbicacion, factorBulto, seMideEnKilos } from "./stock.js";
import { precioDeLaUbicacion } from "../precios/precioDeLaUbicacion.js";
import { precioUnitarioQueSeCobra } from "../precios/redondeo.js";
import { ESCALA_PIEZA, valorEnLaEscalaDeVenta } from "../precios/escalaDeVenta.js";
import { esProductoPorPeso } from "../pos-ventas/lineaPorImporte.js";
import { UNIDAD_FISICA_STOCK } from "../compras-proveedor/stockIngresado.js";

/** Cómo terminó la valoración de una unidad. */
export const ESTADO_COSTO_FISICO = Object.freeze({
  CONOCIDO: "CONOCIDO",
  SIN_COSTO: "SIN_COSTO",
  NO_APLICA: "NO_APLICA",
  // La unidad de medida no es ninguna de las del enum `UnidadMedida`: ninguna
  // regla la resuelve. No hay otro caso que llegue acá.
  CONVERSION_AMBIGUA: "CONVERSION_AMBIGUA",
});

/** Qué regla produjo el valor. Es parte de la explicación del Stock Diario. */
export const REGLA_COSTO_FISICO = Object.freeze({
  COMBO: "COMBO",
  KG_POR_PIEZA_EN_DEPOSITO: "KG_POR_PIEZA_EN_DEPOSITO",
  KG_POR_KILO: "KG_POR_KILO",
  BULTO_A_UNIDAD: "BULTO_A_UNIDAD",
  POR_UNIDAD: "POR_UNIDAD",
  UNIDAD_DE_MEDIDA_DESCONOCIDA: "UNIDAD_DE_MEDIDA_DESCONOCIDA",
});

/**
 * Configuraciones que las reglas resuelven pero que conviene mirar. NO impiden
 * valorizar: son advertencias, separadas del valor.
 */
export const ANOMALIA_COSTO_FISICO = Object.freeze({
  // Un producto por kg con `factor_pack` cargado: se ignora (regla 1).
  KG_CON_FACTOR: "KG_CON_FACTOR",
  // Un producto "unidad" con factor mayor a 1: la ficha no lo puede crear, y la
  // compra y las listas lo escriben por bulto. Se valoriza por unidad.
  UNIDAD_CON_FACTOR: "UNIDAD_CON_FACTOR",
  // Pack o cajón sin factor mayor a 1: se usa lo guardado, bulto = unidad. No
  // se inventa un x6 ni un x12.
  BULTO_SIN_FACTOR: "BULTO_SIN_FACTOR",
  // Un producto que no es por kg marcado PIEZA con peso: la pieza no significa
  // nada, pero el consumo del POS en el depósito lo descuenta como pieza.
  PIEZA_EN_PRODUCTO_NO_KG: "PIEZA_EN_PRODUCTO_NO_KG",
  // La divergencia conocida: pieza por la regla, kilo para los escritores que
  // usan `esFiambreFijo`. La fila del depósito puede tener unidades mezcladas.
  PIEZA_COMPRADA_POR_BULTO: "PIEZA_COMPRADA_POR_BULTO",
});

// ── POR QUÉ NO HAY NINGUNA COMPARACIÓN CONTRA "PIEZA" EN ESTE ARCHIVO ──────
//
// `lib/conversiones/copiasPredicadoFiambre.test.mjs` congela las copias a mano
// del predicado de pieza. Todo lo que acá pregunta por la pieza lo pregunta a
// un predicado que ya existe: `esProductoPorPeso` para la regla de negocio y
// `esFiambreFijoEnUbicacion` para saber si los escritores de hoy discrepan. Por
// eso no hay una anomalía "PIEZA sin peso": con peso cero ningún predicado lo
// cuenta por pieza —ni la regla ni los escritores—, así que no hay divergencia
// que avisar, y detectarlo exigiría otra copia.

const UNIDADES_DE_MEDIDA = new Set(["unidad", "pack", "cajon", "kg"]);

/** Lee un campo en su nombre de la base (snake) o del mapper (camel). */
const campo = (p, camel, snake) => (p?.[camel] !== undefined ? p[camel] : p?.[snake]);

/** El costo efectivo como número, o null si no es un precio. */
function costoValido(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * CUÁNTO VALE UNA UNIDAD DE `StockLocal.cantidad` DE ESTE PRODUCTO EN ESTA
 * UBICACIÓN.
 *
 * @param {object}  p
 * @param {*}       p.costoBase   `ProductoBase.precio_costo` (Decimal, número o texto).
 * @param {*}       [p.costoLocal] `ProductoLocal.precio_costo` de la ubicación.
 * @param {object}  p.producto    la escala del producto, con nombres de la base o
 *   del mapper: `unidadMedida`|`unidad_medida`, `factorPack`|`factor_pack`,
 *   `pesoReferenciaKg`, `modoVentaDeposito`, `modoCompraProveedor`,
 *   `esCombo`|`es_combo`.
 * @param {boolean} p.esDeposito  si la ubicación de la fila de stock es el depósito.
 *   Obligatorio y booleano: la misma fila vale distinto según dónde está.
 * @returns {{
 *   estado: "CONOCIDO"|"SIN_COSTO"|"NO_APLICA"|"CONVERSION_AMBIGUA",
 *   unidadFisica: "UNIDAD"|"KG"|"PIEZA"|null,
 *   costoEfectivo: number|null,
 *   costoPorUnidadFisica: number|null,
 *   regla: string,
 *   anomalias: string[],
 * }}
 */
export function costoPorUnidadFisica({ costoBase, costoLocal = null, producto, esDeposito } = {}) {
  if (esDeposito !== true && esDeposito !== false) {
    throw new TypeError("costoPorUnidadFisica necesita esDeposito booleano: la misma fila vale distinto según la ubicación");
  }
  if (!producto || typeof producto !== "object") {
    throw new TypeError("costoPorUnidadFisica necesita el producto con su escala");
  }

  const unidadMedida = String(campo(producto, "unidadMedida", "unidad_medida") ?? "").toLowerCase();
  const factor = factorBulto({ factor_pack: campo(producto, "factorPack", "factor_pack") });
  const pesoReferenciaKg = Number(producto.pesoReferenciaKg ?? 0);
  const modoVentaDeposito = producto.modoVentaDeposito ?? null;
  const esCombo = campo(producto, "esCombo", "es_combo") === true;
  const costoEfectivo = costoValido(precioDeLaUbicacion(costoBase, costoLocal));

  if (esCombo) {
    return {
      estado: ESTADO_COSTO_FISICO.NO_APLICA,
      unidadFisica: null,
      costoEfectivo,
      costoPorUnidadFisica: null,
      regla: REGLA_COSTO_FISICO.COMBO,
      anomalias: [],
    };
  }

  if (!UNIDADES_DE_MEDIDA.has(unidadMedida)) {
    return {
      estado: ESTADO_COSTO_FISICO.CONVERSION_AMBIGUA,
      unidadFisica: null,
      costoEfectivo,
      costoPorUnidadFisica: null,
      regla: REGLA_COSTO_FISICO.UNIDAD_DE_MEDIDA_DESCONOCIDA,
      anomalias: [],
    };
  }

  const anomalias = [];
  const base = { unidad_medida: unidadMedida, modoVentaDeposito, pesoReferenciaKg };
  const conCosto = (unidadFisica, regla, valor) => ({
    estado: costoEfectivo === null ? ESTADO_COSTO_FISICO.SIN_COSTO : ESTADO_COSTO_FISICO.CONOCIDO,
    unidadFisica,
    costoEfectivo,
    costoPorUnidadFisica: costoEfectivo === null ? null : valor(costoEfectivo),
    regla,
    anomalias,
  });

  // ── Por kilo: el costo es SIEMPRE por kilo y el factor no participa ──────
  if (seMideEnKilos(base)) {
    if (factor > 1) anomalias.push(ANOMALIA_COSTO_FISICO.KG_CON_FACTOR);

    const porPieza = esDeposito && !esProductoPorPeso(base, { esDeposito: true });
    if (porPieza) {
      // Los escritores de hoy deciden con `esFiambreFijo`, que además exige
      // compra por unidad. Si ellos no lo ven como pieza, la fila puede estar
      // mezclada: se valoriza por la regla y se avisa.
      const paraLosEscritores = esFiambreFijoEnUbicacion(
        { ...base, modoCompraProveedor: producto.modoCompraProveedor, pesoEsFijo: producto.pesoEsFijo },
        true
      );
      if (!paraLosEscritores) anomalias.push(ANOMALIA_COSTO_FISICO.PIEZA_COMPRADA_POR_BULTO);
      return conCosto(UNIDAD_FISICA_STOCK.PIEZA, REGLA_COSTO_FISICO.KG_POR_PIEZA_EN_DEPOSITO, (c) =>
        valorEnLaEscalaDeVenta({ escala: ESCALA_PIEZA, valor: c, pesoReferenciaKg })
      );
    }
    return conCosto(UNIDAD_FISICA_STOCK.KG, REGLA_COSTO_FISICO.KG_POR_KILO, (c) => c);
  }

  // ── No es por kilo: unidades físicas, el factor solo en pack y cajón ─────
  // ¿El POS lo contaría por pieza si fuera por kilo? Es la misma pregunta de la
  // regla, hecha al mismo predicado: marcado PIEZA y con peso.
  if (!esProductoPorPeso({ ...base, unidad_medida: "kg" }, { esDeposito: true })) {
    anomalias.push(ANOMALIA_COSTO_FISICO.PIEZA_EN_PRODUCTO_NO_KG);
  }

  const esBulto = unidadMedida === "pack" || unidadMedida === "cajon";
  if (esBulto && factor <= 1) anomalias.push(ANOMALIA_COSTO_FISICO.BULTO_SIN_FACTOR);
  if (unidadMedida === "unidad" && factor > 1) anomalias.push(ANOMALIA_COSTO_FISICO.UNIDAD_CON_FACTOR);

  const regla = esBulto && factor > 1 ? REGLA_COSTO_FISICO.BULTO_A_UNIDAD : REGLA_COSTO_FISICO.POR_UNIDAD;
  return conCosto(UNIDAD_FISICA_STOCK.UNIDAD, regla, (c) =>
    precioUnitarioQueSeCobra({ precio: c, factor, unidad: unidadMedida, redondeo100: false })
  );
}
