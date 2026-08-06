// lib/proveedores/listas/detalleSistema.js
//
// EL DETALLE DE CADA MÉTRICA, ORGANIZADO POR PRODUCTO.
//
// ── POR QUÉ POR PRODUCTO Y NO POR FILA ──────────────────────────────────────
//
// Un producto del ERP puede aparecer en varias filas del Excel: el proveedor lo
// informa dos veces, o dos códigos distintos terminan apuntando al mismo
// producto. Si el detalle listara filas, ese producto aparecería dos veces y los
// números no cerrarían contra el resumen —"279 actualizados" y una lista de
// 281—, que es exactamente la confusión que este detalle viene a resolver.
//
// Acá el producto se muestra UNA vez, y las filas que lo tocaron cuelgan debajo.
//
// ── LAS CUATRO SITUACIONES ──────────────────────────────────────────────────
//
//   ACTUALIZADOS  el costo ya se escribió. Se muestra de cuánto a cuánto, cuándo
//                 y por qué filas.
//   PENDIENTES    están en el archivo y falta decidirlos. Lo que importa es el
//                 MOTIVO exacto por el que siguen pendientes.
//   AUSENTES      el proveedor no los informó. No hay precio nuevo, así que no
//                 son un error ni algo que se pueda aplicar.
//   SIN_CODIGO    no tienen código del proveedor guardado. No es un problema de
//                 esta lista: es lo que va a hacer que la próxima tampoco los
//                 reconozca por código.
//
// Módulo puro: sin BD, sin Next.

import { ESTADO_LINEA } from "./estados.js";

export const SITUACION_DETALLE = {
  ACTUALIZADOS: "ACTUALIZADOS",
  PENDIENTES: "PENDIENTES",
  AUSENTES: "AUSENTES",
  SIN_CODIGO: "SIN_CODIGO",
};

export const TITULO_SITUACION = {
  ACTUALIZADOS: "Productos actualizados",
  PENDIENTES: "Pendientes de actualizar",
  AUSENTES: "No aparecieron en esta lista",
  SIN_CODIGO: "Sin código de Arcor guardado",
};

export const AYUDA_SITUACION = {
  ACTUALIZADOS: "Su costo ya se escribió con esta lista. Acá está de cuánto a cuánto y por qué filas.",
  PENDIENTES: "Están en el archivo y falta decidirlos. Cada uno dice por qué sigue pendiente.",
  AUSENTES:
    "Existen en el sistema y el proveedor no los informó en esta lista. No hay precio nuevo, así que no hay nada que aplicar.",
  SIN_CODIGO:
    "No tienen guardado el código con el que el proveedor los identifica. No es un problema de esta lista: es lo que va a impedir que la próxima los reconozca por código.",
};

/** Los motivos por los que un producto puede seguir pendiente. */
export const MOTIVO_PENDIENTE = {
  PRODUCTO_INCORRECTO: "PRODUCTO_INCORRECTO",
  VARIAS_INTERPRETACIONES: "VARIAS_INTERPRETACIONES",
  DISMINUCION: "DISMINUCION",
  PRESENTACION_DUDOSA: "PRESENTACION_DUDOSA",
  DUPLICADO: "DUPLICADO",
  SIN_OPCION_RAZONABLE: "SIN_OPCION_RAZONABLE",
  LISTO_SIN_APLICAR: "LISTO_SIN_APLICAR",
  EXCLUIDO: "EXCLUIDO",
  OTRO: "OTRO",
};

export const TEXTO_MOTIVO_PENDIENTE = {
  PRODUCTO_INCORRECTO: "El producto vinculado no parece el correcto",
  VARIAS_INTERPRETACIONES: "Más de una interpretación posible",
  DISMINUCION: "La interpretación baja el costo",
  PRESENTACION_DUDOSA: "Presentación dudosa: falta decidir qué representa el producto",
  DUPLICADO: "El código del archivo está duplicado",
  SIN_OPCION_RAZONABLE: "Ninguna interpretación da un costo creíble",
  LISTO_SIN_APLICAR: "Listo para aplicar, falta ejecutarlo",
  EXCLUIDO: "Excluido a mano de esta importación",
  OTRO: "Falta revisarlo",
};

export const TONO_MOTIVO_PENDIENTE = {
  PRODUCTO_INCORRECTO: "sunmi-text-danger",
  VARIAS_INTERPRETACIONES: "sunmi-text-warning",
  DISMINUCION: "sunmi-text-danger",
  PRESENTACION_DUDOSA: "sunmi-text-warning",
  DUPLICADO: "sunmi-text-warning",
  SIN_OPCION_RAZONABLE: "sunmi-text-danger",
  LISTO_SIN_APLICAR: "sunmi-text-accent",
  EXCLUIDO: "sunmi-text-muted",
  OTRO: "sunmi-text-muted",
};

/** Qué puede hacer la persona con un producto pendiente. */
export const ACCION = {
  CONFIRMAR: "CONFIRMAR",
  VER_OPCIONES: "VER_OPCIONES",
  CAMBIAR: "CAMBIAR",
};

export const TEXTO_ACCION = {
  CONFIRMAR: "Confirmar",
  VER_OPCIONES: "Ver opciones",
  CAMBIAR: "Cambiar producto",
};

/**
 * Por qué este producto sigue pendiente, y qué se puede hacer.
 *
 * `analisis` es lo que devuelve `analizarFila` para la fila principal, o `null`
 * cuando la fila no admite análisis (sin producto, estado que no es dudoso).
 * Se mira el ESTADO primero porque un duplicado o un excluido no se resuelven
 * eligiendo una interpretación.
 */
export function motivoDePendiente({ fila, analisis } = {}) {
  if (!fila) return { motivo: MOTIVO_PENDIENTE.OTRO, acciones: [ACCION.CAMBIAR] };

  if (fila.excluidaManual === true) {
    return { motivo: MOTIVO_PENDIENTE.EXCLUIDO, acciones: [] };
  }
  if (fila.estado === ESTADO_LINEA.CODIGO_DUPLICADO) {
    return { motivo: MOTIVO_PENDIENTE.DUPLICADO, acciones: [ACCION.CAMBIAR] };
  }
  if (fila.estado === ESTADO_LINEA.LISTO_PARA_ACTUALIZAR) {
    return { motivo: MOTIVO_PENDIENTE.LISTO_SIN_APLICAR, acciones: [] };
  }
  if (fila.estado === ESTADO_LINEA.NO_MACHEADO || fila.productoBaseId === null) {
    return { motivo: MOTIVO_PENDIENTE.PRODUCTO_INCORRECTO, acciones: [ACCION.CAMBIAR] };
  }

  if (!analisis) {
    return { motivo: MOTIVO_PENDIENTE.OTRO, acciones: [ACCION.VER_OPCIONES, ACCION.CAMBIAR] };
  }

  if (analisis.resultado === "REVISAR") {
    // Ninguna interpretación cierra: casi siempre el producto vinculado es otro.
    return { motivo: MOTIVO_PENDIENTE.SIN_OPCION_RAZONABLE, acciones: [ACCION.CAMBIAR] };
  }
  if (analisis.resultado === "AMBIGUA") {
    return {
      motivo: MOTIVO_PENDIENTE.VARIAS_INTERPRETACIONES,
      acciones: [ACCION.VER_OPCIONES, ACCION.CAMBIAR],
    };
  }

  const elegida = analisis.evaluadas?.find((h) => h.clave === analisis.recomendada) ?? null;
  if (elegida?.estado === "DISMINUCION" || elegida?.estado === "SIN_AUMENTO") {
    return {
      motivo: MOTIVO_PENDIENTE.DISMINUCION,
      acciones: [ACCION.VER_OPCIONES, ACCION.CAMBIAR],
    };
  }

  return {
    motivo: MOTIVO_PENDIENTE.PRESENTACION_DUDOSA,
    acciones: [ACCION.CONFIRMAR, ACCION.CAMBIAR],
  };
}

/**
 * Agrupa filas por producto, sin perder ninguna.
 *
 * Devuelve un producto por clave, con TODAS sus filas ordenadas por número de
 * fila. Es lo que garantiza que el detalle no duplique un producto que el
 * proveedor informó dos veces.
 */
export function agruparPorProducto(filas = []) {
  const porProducto = new Map();
  for (const f of filas) {
    const id = f?.productoBaseId;
    if (id === null || id === undefined) continue;
    if (!porProducto.has(id)) porProducto.set(id, []);
    porProducto.get(id).push(f);
  }
  for (const lista of porProducto.values()) {
    lista.sort((a, b) => Number(a.filaExcel ?? 0) - Number(b.filaExcel ?? 0));
  }
  return porProducto;
}

/**
 * El resumen de lo que le pasó a un producto actualizado.
 *
 * Cuando lo tocaron varias filas, el costo anterior es el de la PRIMERA y el
 * aplicado el de la ÚLTIMA: es el recorrido real que hizo el costo, y esconder
 * que hubo dos escrituras sería mentir sobre lo que pasó.
 */
export function resumenDeActualizado(filas = []) {
  const aplicadas = filas
    .filter((f) => f?.aplicada === true)
    .sort((a, b) => new Date(a.aplicadaEn ?? 0) - new Date(b.aplicadaEn ?? 0));
  if (aplicadas.length === 0) return null;

  const primera = aplicadas[0];
  const ultima = aplicadas[aplicadas.length - 1];
  const anterior = primera.costoPrevioAplicacion === null || primera.costoPrevioAplicacion === undefined
    ? null
    : Number(primera.costoPrevioAplicacion);
  const aplicado = ultima.costoAplicado === null || ultima.costoAplicado === undefined
    ? null
    : Number(ultima.costoAplicado);

  const variacionPct =
    anterior !== null && anterior > 0 && aplicado !== null ? ((aplicado - anterior) / anterior) * 100 : null;

  return {
    costoAnterior: anterior,
    costoAplicado: aplicado,
    variacionPct,
    aplicadaEn: ultima.aplicadaEn ?? null,
    cantidadFilas: aplicadas.length,
    // Dos filas sobre el mismo producto no es un caso normal: se marca para que
    // se pueda mirar, no se esconde.
    variasFilas: aplicadas.length > 1,
  };
}

/**
 * ¿Este producto pendiente está en alerta?
 *
 * Alerta significa que NO se puede resolver de un clic: la interpretación baja
 * el costo, no deja el costo donde debería, hay más de una posible o no hay
 * ninguna creíble.
 *
 * Existe porque el contador anterior usaba `variacionAlta`, un flag que se fija
 * al conciliar y que en una fila por revisar SIEMPRE vale false —todavía no hay
 * costo propuesto—. Con eso el resumen decía "0 fuera de lo esperado" mientras
 * el detalle mostraba disminuciones. Contar sobre el motivo real es lo único
 * que hace coincidir los dos lugares.
 */
export function pendienteEnAlerta(motivo) {
  return (
    motivo === MOTIVO_PENDIENTE.DISMINUCION ||
    motivo === MOTIVO_PENDIENTE.SIN_OPCION_RAZONABLE ||
    motivo === MOTIVO_PENDIENTE.VARIAS_INTERPRETACIONES ||
    motivo === MOTIVO_PENDIENTE.DUPLICADO ||
    motivo === MOTIVO_PENDIENTE.PRODUCTO_INCORRECTO
  );
}
