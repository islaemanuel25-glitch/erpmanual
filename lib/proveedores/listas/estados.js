// lib/proveedores/listas/estados.js
//
// CONCILIACIÓN DE LISTAS DE PROVEEDOR — el estado de cada línea.
//
// Una línea de la lista termina en exactamente UNO de ocho estados. El estado es
// lo que decide si la línea se puede aplicar, y es lo único que la pantalla
// necesita mirar para agrupar.
//
// ── POR QUÉ HAY UNA PRIORIDAD, Y POR QUÉ ES ESTA ─────────────────────────────
//
// Una línea puede tener varios problemas a la vez: código duplicado Y factor
// dudoso, por ejemplo. Sin un orden fijo, el estado dependería de en qué orden
// se escribieron los `if`, y la misma lista clasificaría distinto según por
// dónde entró. El orden es:
//
//   1. ERROR             — la línea ni siquiera se pudo leer o calcular.
//   2. CODIGO_DUPLICADO  — el código apunta a más de un producto: no se sabe
//                          A CUÁL aplicarle nada.
//   3. NO_MACHEADO       — no apunta a ninguno.
//   4. BLOQUEADO         — hay producto, pero este usuario/ubicación no puede
//                          escribirle el costo.
//   5. FACTOR_DUDOSO     — se puede escribir, pero la conversión a bulto no se
//                          puede calcular.
//   6. EXCLUIDO          — se podría, pero alguien decidió que no.
//   7. SIN_CAMBIOS       — el costo propuesto ya es el que está.
//   8. LISTO_PARA_ACTUALIZAR
//
// La lógica es: primero lo que impide identificar el producto, después lo que
// impide escribirle, después lo que impide calcular, después la decisión humana,
// y al final los dos casos sanos. De más grave a más leve, y cada escalón
// presupone que el anterior salió bien.
//
// ── LA VARIACIÓN ALTA NO ES UN ESTADO ────────────────────────────────────────
//
// Un aumento del 45 % sigue siendo LISTO_PARA_ACTUALIZAR, con la bandera
// `variacionAlta` encendida. Es una advertencia para que alguien mire, no un
// bloqueo: los proveedores aumentan, y convertir cada aumento grande en un
// estado propio obligaría a destrabar a mano lo que es simplemente caro.

import { mismoCosto, bloqueoPorUnidad, MOTIVO_BLOQUEO } from "./calculoCosto.js";

// Re-exportados para que quien clasifica no tenga que importar de dos lados.
export { bloqueoPorUnidad, MOTIVO_BLOQUEO };

export const ESTADO_LINEA = {
  LISTO_PARA_ACTUALIZAR: "LISTO_PARA_ACTUALIZAR",
  SIN_CAMBIOS: "SIN_CAMBIOS",
  NO_MACHEADO: "NO_MACHEADO",
  CODIGO_DUPLICADO: "CODIGO_DUPLICADO",
  FACTOR_DUDOSO: "FACTOR_DUDOSO",
  EXCLUIDO: "EXCLUIDO",
  BLOQUEADO: "BLOQUEADO",
  ERROR: "ERROR",
};

/** El orden que resuelve los empates. Índice 0 = lo más grave. */
export const PRIORIDAD_ESTADO = [
  ESTADO_LINEA.ERROR,
  ESTADO_LINEA.CODIGO_DUPLICADO,
  ESTADO_LINEA.NO_MACHEADO,
  ESTADO_LINEA.BLOQUEADO,
  ESTADO_LINEA.FACTOR_DUDOSO,
  ESTADO_LINEA.EXCLUIDO,
  ESTADO_LINEA.SIN_CAMBIOS,
  ESTADO_LINEA.LISTO_PARA_ACTUALIZAR,
];

/** Los dos estados que se pueden aplicar sin que nadie intervenga. */
export const ESTADOS_APLICABLES = new Set([ESTADO_LINEA.LISTO_PARA_ACTUALIZAR]);

/** ¿Este estado permite escribir el costo? */
export function esAplicable(estado) {
  return ESTADOS_APLICABLES.has(estado);
}

export function esEstadoValido(estado) {
  return Object.prototype.hasOwnProperty.call(ESTADO_LINEA, estado);
}

/**
 * De un conjunto de estados, el más grave.
 *
 * Un estado desconocido se ignora en vez de romper: la clasificación de una
 * lista de mil filas no puede caerse porque alguien agregó un estado nuevo y
 * olvidó ponerlo en la tabla.
 */
export function estadoMasPrioritario(estados = []) {
  let mejor = null;
  let mejorIdx = Infinity;
  for (const e of estados) {
    const idx = PRIORIDAD_ESTADO.indexOf(e);
    if (idx === -1) continue;
    if (idx < mejorIdx) {
      mejorIdx = idx;
      mejor = e;
    }
  }
  return mejor;
}

/**
 * El estado de una línea, a partir de lo que ya se sabe de ella.
 *
 * No calcula nada por su cuenta: recibe los hechos y devuelve el veredicto. Eso
 * la hace probable sin base de datos y evita que la clasificación y el cálculo
 * se desincronicen.
 *
 * @param error         algo impidió leer o calcular la línea (motivo o true)
 * @param duplicado     el código apunta a más de un producto
 * @param macheado      se encontró exactamente un producto
 * @param bloqueado     hay producto, pero no se le puede escribir el costo
 * @param motivoBloqueo motivo concreto del bloqueo. Bloquea por sí solo: viene
 *                      de `bloqueoPorUnidad`, que detecta el caso de la lista
 *                      por unidad contra un costo guardado por kilo.
 * @param factorDudoso  necesita conversión a bulto y el factor no sirve
 * @param excluido      alguien decidió dejar esta línea afuera
 * @param costoActual   el costo maestro de hoy
 * @param costoNuevo    el costo que propone la lista
 */
export function clasificarLinea({
  error = null,
  duplicado = false,
  macheado = false,
  bloqueado = false,
  motivoBloqueo = null,
  factorDudoso = false,
  excluido = false,
  costoActual = null,
  costoNuevo = null,
} = {}) {
  if (error) return ESTADO_LINEA.ERROR;
  if (duplicado) return ESTADO_LINEA.CODIGO_DUPLICADO;
  if (!macheado) return ESTADO_LINEA.NO_MACHEADO;
  // Un motivo presente bloquea igual que la bandera. Que el motivo alcance por
  // sí solo es lo que impide el olvido: quien arma la línea no tiene que
  // acordarse de encender también `bloqueado`.
  if (bloqueado || motivoBloqueo) return ESTADO_LINEA.BLOQUEADO;
  if (factorDudoso) return ESTADO_LINEA.FACTOR_DUDOSO;
  if (excluido) return ESTADO_LINEA.EXCLUIDO;

  // Sin costo nuevo no hay nada que proponer, y llegar acá sin él significa que
  // el cálculo falló sin informar su error. Se trata como error antes que
  // proponer un costo que no existe.
  if (costoNuevo === null || costoNuevo === undefined) return ESTADO_LINEA.ERROR;

  // La igualdad se mide a DOS DECIMALES, que es la precisión en la que el costo
  // maestro existe. Una diferencia de milésimas no es un cambio: es ruido de la
  // conversión, y aplicarla escribiría el mismo número dos veces.
  if (mismoCosto(costoActual, costoNuevo)) return ESTADO_LINEA.SIN_CAMBIOS;

  return ESTADO_LINEA.LISTO_PARA_ACTUALIZAR;
}

/** Cuenta las líneas por estado. Devuelve los ocho, incluso en cero, para que la
 *  pantalla no tenga que preguntar si la clave existe. */
export function resumirEstados(estados = []) {
  const resumen = {};
  for (const e of PRIORIDAD_ESTADO) resumen[e] = 0;
  for (const e of estados) {
    if (Object.prototype.hasOwnProperty.call(resumen, e)) resumen[e] += 1;
  }
  return resumen;
}
