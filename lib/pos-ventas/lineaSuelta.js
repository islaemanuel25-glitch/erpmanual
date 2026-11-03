// lib/pos-ventas/lineaSuelta.js
//
// LA LÍNEA QUE VENDE EL SUELTO: quién la puede vender, a qué precio y a qué
// costo. Tercer nivel de empaque, tanda 4 (docs/roadmap/tercer-nivel-empaque.md).
//
// Un atado trae 20 cigarrillos y el local vende las dos cosas. Una línea en modo
// SUELTO (`MODO_SUELTO`, de `consumoStock.js`) cobra el precio del suelto y
// descuenta 1 de stock; una línea normal del mismo producto cobra el atado y
// descuenta 20. El descuento lo decide `cantidadParaStockNormal`; esto decide el
// resto, en un solo lugar para `crear` y para la corrección.
//
// ── EL PRECIO LO PONE EL SERVIDOR, COMO EN LOS SERVICIOS ───────────────────
//
// Hoy el servidor acepta el precio que manda el navegador para una línea normal
// (Gravedad 1 de docs/roadmap/el-precio-que-se-cobra.md, todavía pendiente). Para
// el suelto no se abre esa puerta: es una escala nueva, sin una sola venta
// histórica que respetar, y el precio sale de la fila de la ubicación
// (`ProductoLocal.precio_venta_suelto`) con la lista del cliente aplicada igual
// que en `pos-ventas/buscar-producto`. Si el navegador mandó otro número, gana el
// del servidor, igual que con los servicios de importe variable.
//
// El precio del suelto se carga APARTE: no es el de la unidad dividido. El COSTO
// sí se reparte, y sale de `costoPorUnidadFisica`, que pasa por `costoDelSuelto`
// —la única definición del costo del suelto—.
//
// ── QUIÉN NO PUEDE VENDER SUELTO ───────────────────────────────────────────
//
//   · El depósito: el suelto se vende solo en los locales (decisión de negocio).
//   · Un producto sin `sueltos_por_unidad`: no tiene escalón más chico.
//   · Una ubicación sin `precio_venta_suelto`: no hay precio que cobrar, y
//     derivarlo de la unidad sería inventarlo.
//   · Lo que no tiene unidades: el kilo, el combo y el servicio.
//
// Módulo puro: sin Prisma.

import { calcularPrecioConLista } from "../precios/calcularPrecioConLista.js";
import { costoPorUnidadFisica, ESTADO_COSTO_FISICO } from "../conversiones/costoPorUnidadFisica.js";
import { sueltosParaCongelar } from "../conversiones/stock.js";
import { MODO_SUELTO as MODO_SUELTO_LOCAL } from "./consumoStock.js";

export { MODO_SUELTO } from "./consumoStock.js";

/** Por qué una línea no se puede vender suelta. */
export const MOTIVO_SUELTO = Object.freeze({
  EN_DEPOSITO: "SUELTO_EN_DEPOSITO",
  SIN_SUELTOS: "SUELTO_SIN_SUELTOS_POR_UNIDAD",
  SIN_PRECIO: "SUELTO_SIN_PRECIO",
  NO_ADMITE: "SUELTO_NO_ADMITE",
});

/** Lo que se le dice al cajero. Dice qué pasó y qué falta. */
export const TEXTO_SUELTO = Object.freeze({
  [MOTIVO_SUELTO.EN_DEPOSITO]: "El depósito no vende sueltos: el suelto se vende solo en los locales.",
  [MOTIVO_SUELTO.SIN_SUELTOS]: "Este producto no se vende suelto: en la ficha no dice cuántos sueltos trae cada unidad.",
  [MOTIVO_SUELTO.SIN_PRECIO]: "Este producto no tiene precio de suelto en este local. Cargalo en la ficha para venderlo suelto.",
  [MOTIVO_SUELTO.NO_ADMITE]: "Este producto no se vende suelto: los que se venden por kilo, los combos y los servicios no tienen sueltos.",
});

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * ¿Esta línea se puede vender suelta? Devuelve el motivo si no, o null.
 *
 * @param {object} p
 * @param {boolean} p.esDeposito
 * @param {object} p.base  `{ unidad_medida, es_combo, modalidad, sueltos_por_unidad }`
 * @param {*} p.precioVentaSuelto  `ProductoLocal.precio_venta_suelto`
 */
export function motivoParaNoVenderSuelto({ esDeposito, base = {}, precioVentaSuelto } = {}) {
  if (esDeposito === true) return MOTIVO_SUELTO.EN_DEPOSITO;
  if (base.unidad_medida === "kg" || base.es_combo === true || base.modalidad === "IMPORTE_VARIABLE") {
    return MOTIVO_SUELTO.NO_ADMITE;
  }
  if (sueltosParaCongelar(base) === null) return MOTIVO_SUELTO.SIN_SUELTOS;
  const precio = num(precioVentaSuelto);
  if (precio === null || precio <= 0) return MOTIVO_SUELTO.SIN_PRECIO;
  return null;
}

/**
 * El costo de UN suelto en esta ubicación, a centavos (la escala de
 * `VentaDetalle.precioCosto`). Null si el producto no tiene costo válido.
 *
 * @param {object} p
 * @param {object} p.base          la ficha, con `precio_costo`, `unidad_medida`,
 *                                 `factor_pack`, `sueltos_por_unidad`.
 * @param {*} [p.costoLocal]       `ProductoLocal.precio_costo`.
 */
export function costoDeUnSuelto({ base, costoLocal = null } = {}) {
  const r = costoPorUnidadFisica({ costoBase: base?.precio_costo, costoLocal, producto: base, esDeposito: false });
  return r.estado === ESTADO_COSTO_FISICO.CONOCIDO ? round2(r.costoPorUnidadFisica) : null;
}

/**
 * EL PRECIO DEL SUELTO QUE SE COBRA: el de la ubicación, con la lista del
 * cliente aplicada como en `buscar-producto`. Si la lista no se puede aplicar
 * (MANUAL_AUTORIZADO), el precio cargado, igual que allá.
 *
 * @returns {{ precio: number, aplicacionLista: object|null }}
 */
export function precioDeUnSuelto({ precioVentaSuelto, costoSuelto, lista = null } = {}) {
  const base = round2(num(precioVentaSuelto) ?? 0);
  if (!lista) return { precio: base, aplicacionLista: null };
  try {
    const calc = calcularPrecioConLista({ precioVenta: base, costo: costoSuelto ?? 0, lista });
    const precio = round2(Number(calc.precioFinal));
    if (!(precio > 0)) return { precio: base, aplicacionLista: null };
    return {
      precio,
      aplicacionLista: {
        listaPrecioId: lista.id,
        tipoPrecioAplicado: calc.tipoPrecioAplicado,
        margenAplicado: calc.margenAplicado,
        precioOriginal: base,
        precioFinal: precio,
      },
    };
  } catch {
    return { precio: base, aplicacionLista: null };
  }
}

/**
 * ¿ESTA LÍNEA GUARDADA SE VENDIÓ SUELTA?
 *
 * `VentaDetalle` no guarda el modo de la línea, pero con sueltos se deduce sin
 * ambigüedad: una línea por unidad descontó cantidad × N y una suelta descontó
 * la cantidad tal cual, y con N mayor que 1 esos dos números no coinciden nunca.
 * Sin N congelado (todas las ventas de hoy) no hay suelto posible.
 *
 * @returns {string|null}  `MODO_SUELTO`, o null si no se vendió suelta.
 */
export function modoDeLineaGuardada({ cantidad, cantidadStock, sueltosPorUnidadCongelado, esDeposito } = {}) {
  if (esDeposito === true) return null;
  if (sueltosParaCongelar({ sueltos_por_unidad: sueltosPorUnidadCongelado }) === null) return null;
  const c = num(cantidad);
  const s = num(cantidadStock);
  if (c === null || s === null) return null;
  return Math.abs(s - c) < 0.0005 ? MODO_SUELTO_LOCAL : null;
}

/**
 * TODO LO QUE EL SERVIDOR DECIDE DE UNA LÍNEA SUELTA, de una vez.
 *
 * @param {object} p
 * @param {boolean} p.esDeposito
 * @param {object} p.base           la ficha (ver arriba).
 * @param {object} p.productoLocal  `{ precio_venta_suelto, precio_costo }`.
 * @param {object|null} p.lista     la lista resuelta por el servidor.
 * @returns {{ ok: false, motivo: string, error: string }
 *         | { ok: true, precio: number, precioCosto: number|null, aplicacionLista: object|null }}
 */
export function resolverLineaSuelta({ esDeposito, base, productoLocal = {}, lista = null } = {}) {
  const motivo = motivoParaNoVenderSuelto({ esDeposito, base, precioVentaSuelto: productoLocal.precio_venta_suelto });
  if (motivo) return { ok: false, motivo, error: TEXTO_SUELTO[motivo] };
  const precioCosto = costoDeUnSuelto({ base, costoLocal: productoLocal.precio_costo });
  const { precio, aplicacionLista } = precioDeUnSuelto({
    precioVentaSuelto: productoLocal.precio_venta_suelto,
    costoSuelto: precioCosto,
    lista,
  });
  return { ok: true, precio, precioCosto, aplicacionLista };
}
