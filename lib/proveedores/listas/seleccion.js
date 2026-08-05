// lib/proveedores/listas/seleccion.js
//
// QUÉ FILAS SE PUEDEN SELECCIONAR PARA APLICAR.
//
// Módulo puro: sin BD, sin Next. Lo usan la pantalla (para pintar el checkbox) y
// el endpoint (para rechazar). Que sean el MISMO predicado es el punto: si la UI
// decidiera por su cuenta, un cliente viejo —o alguien con curl— podría marcar
// filas que el motor nunca consideró aplicables.
//
// Las tres condiciones son acumulativas y ninguna es cosmética:
//
//   1. La importación tiene que estar CONCILIADA. En BORRADOR la conciliación no
//      terminó y los costos propuestos todavía pueden cambiar; en APLICADA ya se
//      escribieron; en DESCARTADA se decidió no usarla.
//   2. La fila tiene que estar en LISTO_PARA_ACTUALIZAR. Cualquier otro estado
//      significa que el motor NO tiene un costo confiable para escribir.
//   3. La fila no puede estar ya aplicada. Sin esto, un reintento duplicaría el
//      movimiento de costo.

import { ESTADO_LINEA } from "./estados.js";
import { esImportacionAbierta } from "./persistencia.js";

export const MOTIVO_NO_SELECCIONABLE = {
  IMPORTACION_NO_CONCILIADA: "IMPORTACION_NO_CONCILIADA",
  ESTADO_NO_APLICABLE: "ESTADO_NO_APLICABLE",
  YA_APLICADA: "YA_APLICADA",
  SIN_COSTO_PROPUESTO: "SIN_COSTO_PROPUESTO",
  SIN_PRODUCTO: "SIN_PRODUCTO",
  EXCLUIDA_A_MANO: "EXCLUIDA_A_MANO",
};

export const TEXTO_NO_SELECCIONABLE = {
  IMPORTACION_NO_CONCILIADA:
    "La importación está cerrada: no se pueden seleccionar filas.",
  ESTADO_NO_APLICABLE: "Solo se pueden aplicar las filas listas para actualizar.",
  YA_APLICADA: "Esta fila ya fue aplicada.",
  SIN_COSTO_PROPUESTO: "La fila no tiene un costo propuesto.",
  SIN_PRODUCTO: "La fila no está vinculada a ningún producto.",
  EXCLUIDA_A_MANO: "Se excluyó a mano desde la revisión.",
};

/**
 * ¿Se puede seleccionar esta fila?
 *
 * @returns {{ ok: boolean, motivo: string|null }}
 */
export function filaSeleccionable(fila, importacion) {
  if (!fila || !importacion) {
    return { ok: false, motivo: MOTIVO_NO_SELECCIONABLE.ESTADO_NO_APLICABLE };
  }
  // Una importación PARCIALMENTE_APLICADA sigue abierta: aplicar una tanda no
  // cierra el proceso. Lo que impide re-aplicar es la marca de la fila, no el
  // estado de la cabecera.
  if (!esImportacionAbierta(importacion.estado)) {
    return { ok: false, motivo: MOTIVO_NO_SELECCIONABLE.IMPORTACION_NO_CONCILIADA };
  }
  if (fila.estado !== ESTADO_LINEA.LISTO_PARA_ACTUALIZAR) {
    return { ok: false, motivo: MOTIVO_NO_SELECCIONABLE.ESTADO_NO_APLICABLE };
  }
  if (fila.aplicada === true) {
    return { ok: false, motivo: MOTIVO_NO_SELECCIONABLE.YA_APLICADA };
  }
  // Excluir a mano gana sobre todo lo demás: es una decisión explícita de una
  // persona que miró la fila.
  if (fila.excluidaManual === true) {
    return { ok: false, motivo: MOTIVO_NO_SELECCIONABLE.EXCLUIDA_A_MANO };
  }
  // Defensa en profundidad: LISTO_PARA_ACTUALIZAR ya implica producto y costo,
  // pero una fila editada a mano en la base no debe poder colarse.
  if (fila.productoBaseId === null || fila.productoBaseId === undefined) {
    return { ok: false, motivo: MOTIVO_NO_SELECCIONABLE.SIN_PRODUCTO };
  }
  const costo = Number(fila.costoMaestroPropuesto);
  if (!Number.isFinite(costo) || costo <= 0) {
    return { ok: false, motivo: MOTIVO_NO_SELECCIONABLE.SIN_COSTO_PROPUESTO };
  }
  return { ok: true, motivo: null };
}

/** Ids de las filas seleccionables de una lista. */
export function idsSeleccionables(filas = [], importacion) {
  return filas.filter((f) => filaSeleccionable(f, importacion).ok).map((f) => f.id);
}

/**
 * Valida un pedido de selección del cliente contra la realidad de la base.
 *
 * Devuelve las que se pueden marcar y las rechazadas CON SU MOTIVO, en vez de
 * fallar entero: si el usuario tildó 40 filas y una dejó de ser aplicable
 * mientras miraba la pantalla, tirar las 40 sería peor que decirle cuál.
 *
 * `estricto: true` hace que cualquier rechazo invalide el pedido completo. Lo usa
 * el endpoint de selección explícita, donde el cliente afirma un estado concreto.
 */
export function validarSeleccion(idsPedidos = [], filas = [], importacion, { estricto = false } = {}) {
  const porId = new Map(filas.map((f) => [Number(f.id), f]));
  const aceptadas = [];
  const rechazadas = [];

  for (const idCrudo of idsPedidos) {
    const id = Number(idCrudo);
    const fila = porId.get(id);
    if (!fila) {
      rechazadas.push({ id, motivo: MOTIVO_NO_SELECCIONABLE.SIN_PRODUCTO, texto: "La fila no existe en esta importación." });
      continue;
    }
    const v = filaSeleccionable(fila, importacion);
    if (v.ok) aceptadas.push(id);
    else rechazadas.push({ id, motivo: v.motivo, texto: TEXTO_NO_SELECCIONABLE[v.motivo] });
  }

  return {
    ok: estricto ? rechazadas.length === 0 : aceptadas.length > 0 || idsPedidos.length === 0,
    aceptadas,
    rechazadas,
  };
}

/** Normaliza la lista de ids que llega del cliente: enteros, únicos, sin basura. */
export function normalizarIds(valor) {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set();
  const out = [];
  for (const v of valor) {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0 || vistos.has(n)) continue;
    vistos.add(n);
    out.push(n);
  }
  return out;
}

/** Resumen para el contador de la pantalla. */
export function resumirSeleccion(filas = [], importacion) {
  let seleccionables = 0;
  let seleccionadas = 0;
  let aplicadas = 0;
  for (const f of filas) {
    if (f.aplicada === true) aplicadas++;
    if (filaSeleccionable(f, importacion).ok) {
      seleccionables++;
      if (f.seleccionada === true) seleccionadas++;
    }
  }
  return { seleccionables, seleccionadas, aplicadas };
}
