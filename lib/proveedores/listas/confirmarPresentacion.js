// lib/proveedores/listas/confirmarPresentacion.js
//
// CONFIRMAR LA PRESENTACIÓN de una fila que quedó por revisar.
//
// ── LOS DOS DATOS QUE NO SE MEZCLAN ─────────────────────────────────────────
//
// A. CANTIDAD / PRESENTACIÓN — cuántas unidades contiene lo que el proveedor
//    cotiza. Es un dato del producto: sirve para compras, stock y equivalencias.
//    NO entra en el precio.
//
// B. BASE DEL PRECIO — de qué cosa es el precio que informó el proveedor. Sale
//    de la columna U.M. del archivo, no se adivina: UN es el precio de una
//    unidad suelta, DI el de un display, BU el de un bulto.
//
// Mezclarlos fue el error que hubo que corregir: el panel anterior ofrecía la
// cantidad como si fuera un multiplicador del precio, y con eso un display de
// $5.678 se convertía en $71.545. Cambiar la cantidad de 18 a 12 no multiplica
// nada: el display sigue costando lo mismo, solo trae otra cantidad adentro.
//
// ── CUÁNDO SE MULTIPLICA (una sola vez, y demostrada) ───────────────────────
//
// El ERP guarda UN costo por producto, el de SU presentación. Entonces:
//
//   · Si el proveedor cotiza LA MISMA presentación que guarda el producto, el
//     costo es el precio con recargo. Sin multiplicar. Es el caso del display de
//     jugos, el de la bolsa de un kilo de Mogul y el de cualquier fila BU contra
//     un producto que guarda por bulto.
//
//   · Si el proveedor cotiza LA UNIDAD SUELTA y el producto agrupa varias, el
//     costo del producto es el precio de la unidad por cuántas agrupa. Es la
//     ÚNICA multiplicación legítima, y solo se ofrece cuando el archivo dice UN,
//     que es lo que demuestra que el precio es por unidad.
//
//   · Si el proveedor cotiza algo MÁS GRANDE que lo que guarda el producto, no
//     hay forma de repartirlo: se bloquea.
//
// ── LA PISTA QUE NO INVENTA NADA ────────────────────────────────────────────
//
// El costo que el producto ya tiene, dividido por el precio nuevo con recargo,
// dice qué relación valía la última vez que ese costo estuvo bien. Si da cerca
// de 1, el producto es lo que el proveedor cotiza. Si da cerca de la cantidad
// del pack, el producto agrupa. No decide: orienta, y se muestra para que la
// persona compare contra lo que ella sabe.
//
// Módulo puro: sin BD, sin Next.

import { aplicarRecargo, round2, requiereConversionABulto, calcularVariacion } from "./calculoCosto.js";
import { ESTADO_LINEA } from "./estados.js";
import { esImportacionAbierta } from "./persistencia.js";

/** De qué cosa es el precio que informó el proveedor. Sale del archivo. */
export const BASE_PRECIO = {
  UNIDAD: "UNIDAD",
  DISPLAY: "DISPLAY",
  BULTO: "BULTO",
};

export const TEXTO_BASE_PRECIO = {
  UNIDAD: "una unidad suelta",
  DISPLAY: "un display",
  BULTO: "un bulto",
};

/** Qué es el producto del ERP respecto de lo que el proveedor cotiza. */
export const RELACION = {
  /** El producto ES lo que el proveedor cotiza. El precio no se multiplica. */
  MISMA_PRESENTACION: "MISMA_PRESENTACION",
  /** El proveedor cotiza la unidad suelta y el producto agrupa varias. */
  POR_UNIDAD_SUELTA: "POR_UNIDAD_SUELTA",
};

export const MOTIVO_NO_CONFIRMABLE = {
  IMPORTACION_CERRADA: "IMPORTACION_CERRADA",
  FILA_APLICADA: "FILA_APLICADA",
  ESTADO_NO_CONFIRMABLE: "ESTADO_NO_CONFIRMABLE",
  SIN_PRODUCTO: "SIN_PRODUCTO",
  EXCLUIDA: "EXCLUIDA",
  BASE_INDETERMINADA: "BASE_INDETERMINADA",
};

export const TEXTO_NO_CONFIRMABLE = {
  IMPORTACION_CERRADA: "La importación está cerrada.",
  FILA_APLICADA: "Esta fila ya se aplicó y no se puede modificar.",
  ESTADO_NO_CONFIRMABLE: "Solo se puede confirmar la presentación de una fila que quedó por revisar.",
  SIN_PRODUCTO: "La fila no tiene un producto del ERP para confirmar.",
  EXCLUIDA: "La fila está excluida. Volvé a incluirla antes de confirmarla.",
  BASE_INDETERMINADA:
    "El archivo no dice de qué presentación es este precio, así que no hay forma de saber a qué corresponde. No se puede confirmar sin ese dato.",
};

/** Tope de la cantidad contenida. Más de mil no es una presentación de venta. */
export const UNIDADES_MAX = 1000;

/**
 * De qué es el precio, según el archivo. `null` cuando no se puede determinar:
 * ahí se bloquea, no se supone.
 */
export function basePrecioDeFila(fila) {
  const u = String(fila?.unidadProveedor ?? "").trim().toUpperCase();
  if (u === "UN") return BASE_PRECIO.UNIDAD;
  if (u === "DI") return BASE_PRECIO.DISPLAY;
  if (u === "BU") return BASE_PRECIO.BULTO;
  return null;
}

/** ¿Se puede confirmar la presentación de esta fila? */
export function puedeConfirmarse(fila, importacion) {
  if (!importacion || !esImportacionAbierta(importacion.estado)) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.IMPORTACION_CERRADA };
  }
  if (!fila) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE };
  if (fila.aplicada === true) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.FILA_APLICADA };
  if (fila.excluidaManual === true) return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.EXCLUIDA };
  if (fila.estado !== ESTADO_LINEA.FACTOR_DUDOSO) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.ESTADO_NO_CONFIRMABLE };
  }
  if (fila.productoBaseId === null || fila.productoBaseId === undefined) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.SIN_PRODUCTO };
  }
  if (basePrecioDeFila(fila) === null) {
    return { ok: false, motivo: MOTIVO_NO_CONFIRMABLE.BASE_INDETERMINADA };
  }
  return { ok: true, motivo: null };
}

/** La cantidad contenida es un entero de 1 a mil. Es un dato, no un factor. */
export function unidadesValidas(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= UNIDADES_MAX;
}

/**
 * Qué relación tenía el costo que el producto ya tiene con el precio nuevo.
 *
 * Cerca de 1 → el producto es lo que el proveedor cotiza. Cerca de la cantidad
 * del pack → el producto agrupa esa cantidad de unidades sueltas.
 */
export function relacionImplicita({ costoActual, precioConIva, recargoPct } = {}) {
  const costo = Number(costoActual);
  const conRecargo = aplicarRecargo(Number(precioConIva), Number(recargoPct ?? 0));
  if (!Number.isFinite(costo) || costo <= 0) return null;
  if (conRecargo === null || !Number.isFinite(conRecargo) || conRecargo <= 0) return null;
  return Math.round((costo / conRecargo) * 100) / 100;
}

/**
 * Las relaciones que se le pueden ofrecer a la persona.
 *
 * POR_UNIDAD_SUELTA solo aparece cuando el archivo dice UN: es lo único que
 * demuestra que el precio es por unidad. Con DI o BU multiplicar sería inventar
 * una equivalencia que el archivo no da.
 */
export function relacionesPosibles(fila, base) {
  const basePrecio = basePrecioDeFila(fila);
  if (basePrecio === null) return [];

  const agrupa = requiereConversionABulto(base);
  const opciones = [];

  opciones.push({
    relacion: RELACION.MISMA_PRESENTACION,
    detalle:
      basePrecio === BASE_PRECIO.UNIDAD
        ? "El producto del ERP es esa misma unidad. El costo es el precio informado."
        : `El producto del ERP es ${TEXTO_BASE_PRECIO[basePrecio]} que cotiza el proveedor. El costo es el precio informado, sin multiplicar.`,
  });

  if (basePrecio === BASE_PRECIO.UNIDAD && agrupa) {
    opciones.push({
      relacion: RELACION.POR_UNIDAD_SUELTA,
      detalle:
        "El proveedor cotiza la unidad suelta y este producto agrupa varias. El costo es el precio por la cantidad que agrupa.",
    });
  }

  return opciones;
}

/**
 * El costo que resulta de una relación.
 *
 * `unidades` SOLO se usa con POR_UNIDAD_SUELTA. En cualquier otra relación es
 * un dato de la presentación y no toca el precio.
 */
export function costoDeRelacion({ precioConIva, recargoPct, relacion, unidades } = {}) {
  const precio = Number(precioConIva);
  if (!Number.isFinite(precio) || precio <= 0) return null;

  const conRecargo = aplicarRecargo(precio, Number(recargoPct ?? 0));
  if (conRecargo === null || !Number.isFinite(conRecargo) || conRecargo <= 0) return null;

  if (relacion === RELACION.MISMA_PRESENTACION) return round2(conRecargo);

  if (relacion === RELACION.POR_UNIDAD_SUELTA) {
    if (!unidadesValidas(unidades)) return null;
    return round2(conRecargo * Number(unidades));
  }

  return null;
}

/** El costo de una unidad suelta, para mostrar. Nunca se guarda. */
export function costoUnitarioInformativo({ costoTotal, unidades } = {}) {
  const total = Number(costoTotal);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!unidadesValidas(unidades)) return null;
  return round2(total / Number(unidades));
}

/**
 * Cómo queda la fila al confirmar la presentación.
 *
 * @returns { ok, estado, costoNuevo, costoAnterior, precioConRecargo, montoRecargo,
 *            diferencia, diferenciaPct, variacionAlta, relacion, unidades }
 */
export function resultadoConfirmacion({
  fila, base, relacion, unidades, recargoPct, umbralVariacionPct,
} = {}) {
  const basePrecio = basePrecioDeFila(fila);
  if (basePrecio === null) {
    return { ok: false, motivo: TEXTO_NO_CONFIRMABLE.BASE_INDETERMINADA };
  }

  const permitidas = relacionesPosibles(fila, base).map((o) => o.relacion);
  if (!permitidas.includes(relacion)) {
    return { ok: false, motivo: "Esa relación no corresponde a lo que informa el archivo." };
  }

  const precio = Number(fila?.precioConIva);
  const conRecargo = aplicarRecargo(precio, Number(recargoPct ?? 0));
  const costoNuevo = costoDeRelacion({ precioConIva: precio, recargoPct, relacion, unidades });
  if (costoNuevo === null) {
    return { ok: false, motivo: "No se pudo calcular el costo con esos datos." };
  }

  const costoAnterior =
    base?.precio_costo === null || base?.precio_costo === undefined ? null : Number(base.precio_costo);

  const v = calcularVariacion({ costoAnterior, costoNuevo, umbralPct: umbralVariacionPct });
  const sinCambio = costoAnterior !== null && v.diferenciaCentavos === 0;

  return {
    ok: true,
    estado: sinCambio ? ESTADO_LINEA.SIN_CAMBIOS : ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
    costoNuevo,
    costoAnterior,
    precioConRecargo: round2(conRecargo),
    montoRecargo: round2(conRecargo - precio),
    diferencia: v.diferencia,
    diferenciaPct: v.diferenciaPct,
    variacionAlta: v.variacionAlta === true,
    relacion,
    // La cantidad se guarda siempre como dato de la presentación, multiplique o
    // no. Es lo que permite mostrar el costo unitario y, más adelante, ofrecer
    // corregir la ficha del producto por su propio flujo.
    unidades: unidadesValidas(unidades) ? Number(unidades) : null,
  };
}

/**
 * ¿El costo que el producto ya tiene respalda esta relación?
 *
 * No decide nada: avisa. Si el producto vale hoy 12,7 veces lo que el proveedor
 * cotiza, decir que el producto ES esa presentación le baja el costo un 92 %, y
 * eso hay que verlo antes de confirmar, no después de aplicar.
 *
 * @returns "RESPALDA" | "NO_RESPALDA" | "SIN_DATO"
 */
export function respaldoDeRelacion({ relacion, implicita, unidades } = {}) {
  if (implicita === null || implicita === undefined) return "SIN_DATO";
  const esperado =
    relacion === RELACION.MISMA_PRESENTACION
      ? 1
      : unidadesValidas(unidades)
        ? Number(unidades)
        : null;
  if (esperado === null) return "SIN_DATO";
  // Banda ancha a propósito: entre listas hay aumentos reales y el costo previo
  // pudo quedar viejo. Lo que se quiere detectar es un orden de magnitud, no una
  // diferencia de precio.
  return implicita >= esperado * 0.6 && implicita <= esperado * 1.6 ? "RESPALDA" : "NO_RESPALDA";
}
