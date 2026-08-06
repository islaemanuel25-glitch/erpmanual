// lib/proveedores/listas/confirmarArmado.js
//
// CONFIRMAR EL ARMADO de una fila que quedó en "revisar armado".
//
// ── QUÉ LE FALTA A ESAS FILAS ───────────────────────────────────────────────
//
// El producto YA está identificado. Lo que falta es el factor: cuántas unidades
// del ERP cubre el precio que informó el proveedor. Sin ese número no hay costo
// que proponer, y por eso la fila no podía llegar a "lista" por ningún camino.
//
// Dos situaciones reales, las dos con el producto correcto:
//
//   FACTOR_DIFIERE  — el archivo dice UxBU 12 y el producto tiene factor 18.
//                     Uno de los dos está desactualizado y el motor no adivina
//                     cuál: multiplicar por el equivocado deja el costo mal por
//                     un 50 %.
//   DISPLAY_SIN_EQUIVALENCIA — el proveedor cotiza por display y el ERP no sabe
//                     qué es un display. Solo una persona que conoce el producto
//                     puede decir cuántas unidades entran.
//
// ── DÓNDE SE GUARDA LA DECISIÓN ─────────────────────────────────────────────
//
// En la FILA, no en el producto. Cambiar `ProductoBase.factor_pack` reescribiría
// la ficha del producto para todo el ERP —compras, stock, transferencias— a
// partir de una lista de precios. La decisión vale para esta importación y se
// guarda donde vale.
//
// Módulo puro: sin BD, sin Next.

import { aplicarRecargo, round2, requiereConversionABulto, calcularVariacion } from "./calculoCosto.js";
import { ESTADO_LINEA } from "./estados.js";
import { esImportacionAbierta } from "./persistencia.js";

export const MOTIVO_NO_CONFIRMABLE = {
  IMPORTACION_CERRADA: "IMPORTACION_CERRADA",
  FILA_APLICADA: "FILA_APLICADA",
  ESTADO_NO_CONFIRMABLE: "ESTADO_NO_CONFIRMABLE",
  SIN_PRODUCTO: "SIN_PRODUCTO",
  EXCLUIDA: "EXCLUIDA",
};

export const TEXTO_NO_CONFIRMABLE = {
  IMPORTACION_CERRADA: "La importación está cerrada.",
  FILA_APLICADA: "Esta fila ya se aplicó y no se puede modificar.",
  ESTADO_NO_CONFIRMABLE: "Solo se puede confirmar el armado de una fila que quedó por revisar.",
  SIN_PRODUCTO: "La fila no tiene un producto del ERP para confirmar.",
  EXCLUIDA: "La fila está excluida. Volvé a incluirla antes de confirmarla.",
};

/** Factor máximo admisible. Un armado de más de mil unidades no es un armado. */
export const FACTOR_MAX = 1000;

/**
 * ¿Se puede confirmar el armado de esta fila?
 *
 * Solo las que quedaron en FACTOR_DUDOSO: son las que tienen producto pero no
 * tienen costo. Una fila sin vincular se resuelve vinculando, y una que ya está
 * lista no necesita confirmación.
 */
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
  return { ok: true, motivo: null };
}

/** ¿Es un factor que se puede usar para convertir? */
export function factorConfirmadoValido(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= FACTOR_MAX;
}

/**
 * Las opciones de factor que se le ofrecen al usuario, con su origen.
 *
 * No se elige ninguna por defecto: elegir sería exactamente lo que el motor se
 * negó a hacer. Se ponen las dos a la vista, con el costo que produce cada una,
 * para que la decisión se tome mirando el número y no a ciegas.
 */
export function opcionesDeFactor(fila, base) {
  const opciones = [];
  const agregar = (valor, origen, detalle) => {
    if (!factorConfirmadoValido(valor)) return;
    if (opciones.some((o) => o.factor === Number(valor))) return;
    opciones.push({ factor: Number(valor), origen, detalle });
  };

  agregar(fila?.unidadesPorBulto, "ARCHIVO", "Es el armado que declara el archivo del proveedor (UxBU).");
  agregar(base?.factor_pack, "ERP", "Es el factor de bulto que tiene cargado el producto.");
  // Sin conversión: el precio informado ya es el del bulto.
  agregar(1, "SIN_CONVERSION", "El precio del proveedor ya corresponde a la unidad que guarda el ERP.");

  return opciones;
}

/**
 * El costo que resulta de un factor confirmado.
 *
 * Usa las MISMAS primitivas que el motor: recargo a precisión completa y
 * redondeo al final. No reimplementa la conversión, la aplica con el factor que
 * eligió una persona en vez del que el motor no pudo deducir.
 *
 * Un producto que NO guarda por bulto ignora el factor: su costo es el precio
 * con recargo, y multiplicarlo sería inflarlo.
 */
export function costoConFactor({ precioConIva, recargoPct, factor, base } = {}) {
  const precio = Number(precioConIva);
  if (!Number.isFinite(precio) || precio <= 0) return null;

  const conRecargo = aplicarRecargo(precio, Number(recargoPct ?? 0));
  if (conRecargo === null || !Number.isFinite(conRecargo) || conRecargo <= 0) return null;

  if (!requiereConversionABulto(base)) return round2(conRecargo);

  if (!factorConfirmadoValido(factor)) return null;
  return round2(conRecargo * Number(factor));
}

/**
 * Cómo queda la fila al confirmar el armado con un factor.
 *
 * @returns { ok, estado, costoNuevo, costoAnterior, diferencia, diferenciaPct,
 *            variacionAlta, precioConRecargo, montoRecargo }
 */
export function resultadoConfirmacion({ fila, base, factor, recargoPct, umbralVariacionPct } = {}) {
  const precio = Number(fila?.precioConIva);
  const conRecargo = aplicarRecargo(precio, Number(recargoPct ?? 0));
  const costoNuevo = costoConFactor({ precioConIva: precio, recargoPct, factor, base });

  if (costoNuevo === null) {
    return { ok: false, motivo: "No se pudo calcular el costo con ese factor." };
  }

  const costoAnterior = base?.precio_costo === null || base?.precio_costo === undefined
    ? null
    : Number(base.precio_costo);

  const v = calcularVariacion({ costoAnterior, costoNuevo, umbralPct: umbralVariacionPct });

  // Si el costo no cambia, la fila no tiene nada que aplicar: SIN_CAMBIOS es la
  // verdad, y dejarla "lista" haría que el usuario aplique una fila que no hace
  // nada.
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
    factorAplicado: requiereConversionABulto(base) ? Number(factor) : 1,
  };
}
