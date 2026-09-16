// lib/proveedores/listas/resultadoDeLaLista.js
//
// EN QUÉ SITUACIÓN QUEDÓ CADA FILA, CONTADO COMO LO MIRA UNA PERSONA.
//
// ── POR QUÉ NO ALCANZAN LOS ESTADOS DEL MOTOR ───────────────────────────────
//
// Los ocho estados de `estados.js` dicen QUÉ SE PUEDE HACER con una fila, que es
// lo que el motor necesita. La pantalla necesita otra cosa: POR QUÉ hay que
// mirarla, que es lo que decide qué se muestra y qué botones tiene.
//
// Y no se corresponden uno a uno. `FACTOR_DUDOSO` junta dos situaciones que no se
// parecen en nada —un aumento raro y un producto sin costo cargado— y el usuario
// tiene que hacer cosas distintas con cada una. Al revés, `NO_MACHEADO` y
// `CODIGO_DUPLICADO` son estados distintos que en la pantalla son dos grupos con
// la misma forma.
//
// Este módulo traduce, en un solo lugar, para que la pantalla no vuelva a
// clasificar por su cuenta y el conteo del resumen y el de la cola de revisión no
// puedan decir cosas distintas.
//
// Módulo puro: sin BD, sin Next.

import { ESTADO_LINEA } from "./estados.js";
import { MOTIVO_LECTURA } from "./eleccionDeLectura.js";

/** Por qué una fila está en la cola de revisión. */
export const MOTIVO_REVISION = {
  AUMENTO_DISTINTO: "AUMENTO_DISTINTO",
  SIN_COSTO: "SIN_COSTO",
  SIN_PRODUCTO: "SIN_PRODUCTO",
  REPETIDO: "REPETIDO",
  /** Lo que no entra en los cuatro de arriba: bloqueos, errores de archivo. */
  OTRO: "OTRO",
};

/**
 * Cómo se llama cada grupo en la pantalla, y qué explica.
 *
 * Los textos viven acá y no en el JSX por el mismo motivo que los motivos: el
 * resumen y la cola tienen que decir lo mismo, y dos copias de un texto se
 * separan el día que alguien corrige una.
 */
export const TEXTO_MOTIVO_REVISION = {
  AUMENTO_DISTINTO: {
    titulo: "Aumentan distinto de lo esperado",
    ayuda: ({ minPct, maxPct }) =>
      minPct === null || maxPct === null || minPct === undefined || maxPct === undefined
        ? "Estos quedaron afuera de lo que esperabas."
        : `Esperabas entre ${formatoPct(minPct)} y ${formatoPct(maxPct)}. Estos quedaron afuera.`,
  },
  SIN_COSTO: {
    titulo: "Sin costo cargado",
    ayuda: () =>
      "Estos productos no tienen costo en el sistema, así que no hay con qué controlar el precio de la lista.",
  },
  SIN_PRODUCTO: {
    titulo: "No están en tu catálogo",
    ayuda: () =>
      "Estas filas del archivo no se pudieron asociar a ningún producto tuyo. Vinculalas una vez y las próximas listas entran solas.",
  },
  REPETIDO: {
    titulo: "Repetidos con otro precio",
    ayuda: () =>
      "El mismo código aparece más de una vez en el archivo, con precios distintos. Elegí cuál corresponde.",
  },
  OTRO: {
    titulo: "Otros para mirar",
    ayuda: () => "Filas que el sistema no pudo procesar.",
  },
};

/** El orden en que se ofrecen los grupos: primero lo más frecuente y accionable. */
export const ORDEN_MOTIVOS = [
  MOTIVO_REVISION.AUMENTO_DISTINTO,
  MOTIVO_REVISION.SIN_COSTO,
  MOTIVO_REVISION.SIN_PRODUCTO,
  MOTIVO_REVISION.REPETIDO,
  MOTIVO_REVISION.OTRO,
];

function formatoPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")} %`;
}

/**
 * ¿La persona ya decidió dejar esta fila como está?
 *
 * ── POR QUÉ NO ES `estado === EXCLUIDO` ────────────────────────────────────
 *
 * Porque `ESTADO_LINEA.EXCLUIDO` está en el enum y NADA LO ESCRIBE NUNCA. La
 * exclusión vive en `excluidaManual`, una columna aparte, y por una razón: pisar
 * el estado perdería el motivo por el que la fila estaba así, y desexcluir —que
 * es reversible— no podría restaurarlo.
 *
 * Preguntar por el estado era entonces una condición INALCANZABLE. Se vio
 * usando la pantalla: "Dejar como está" escribía bien en la base, mostraba su
 * cartel verde, y la cola seguía diciendo 595. El botón parecía no hacer nada.
 *
 * Vive en una función y no repetido en tres lugares porque el contador, la cola
 * y el agrupador tienen que contestar lo mismo.
 */
export function laDejaronComoEsta(fila) {
  return fila?.excluidaManual === true;
}

/**
 * En qué grupo de revisión cae una fila, o null si no hay que revisarla.
 *
 * @param fila  { estado, motivo, costoAnterior, productoBaseId, excluidaManual }
 */
export function motivoDeRevision(fila) {
  const estado = fila?.estado;
  if (laDejaronComoEsta(fila)) return null;
  if (estado === ESTADO_LINEA.LISTO_PARA_ACTUALIZAR) return null;
  if (estado === ESTADO_LINEA.SIN_CAMBIOS) return null;

  if (estado === ESTADO_LINEA.NO_MACHEADO) return MOTIVO_REVISION.SIN_PRODUCTO;
  if (estado === ESTADO_LINEA.CODIGO_DUPLICADO) return MOTIVO_REVISION.REPETIDO;

  // ── EL COSTO SE MIRA EN LA FILA Y NO SOLO EN EL MOTIVO ───────────────────
  //
  // El motivo nuevo `SIN_COSTO_ACTUAL` lo escriben las importaciones de ahora en
  // adelante. Las que ya están guardadas tienen `FUERA_DE_RANGO` con
  // `costoAnterior` nulo o cero, y son el mismo caso: agruparlas por el motivo
  // solo las dejaría mezcladas con los aumentos raros para siempre.
  //
  // Es la diferencia entre traducir el dato y traducir la etiqueta del dato.
  const costo = Number(fila?.costoAnterior);
  const sinCosto = fila?.costoAnterior === null || fila?.costoAnterior === undefined || !(costo > 0);

  if (estado === ESTADO_LINEA.FACTOR_DUDOSO) {
    if (fila?.motivo === MOTIVO_LECTURA.SIN_COSTO_ACTUAL) return MOTIVO_REVISION.SIN_COSTO;
    if (sinCosto && fila?.productoBaseId) return MOTIVO_REVISION.SIN_COSTO;
    return MOTIVO_REVISION.AUMENTO_DISTINTO;
  }

  return MOTIVO_REVISION.OTRO;
}

/**
 * Los contadores del resumen.
 *
 * ── EL ORDEN DE LAS RAMAS ES LA MITAD DE LO QUE AFIRMAN ────────────────────
 *
 * "La dejaron como está" va PRIMERO porque es una decisión de una persona y
 * manda sobre el veredicto del motor: una fila que el motor dejó lista y que
 * después alguien excluyó a mano no se aplica, así que contarla entre los listos
 * diría que se van a escribir 360 costos cuando se escriben 359.
 *
 * @param filas  las filas, con estado, motivo, costoAnterior y excluidaManual
 * @returns { listos, sinCambio, paraRevisar, dejadas, porMotivo: {} }
 */
export function contarResultado(filas = []) {
  const porMotivo = {};
  for (const m of ORDEN_MOTIVOS) porMotivo[m] = 0;

  let listos = 0;
  let sinCambio = 0;
  let dejadas = 0;
  let paraRevisar = 0;

  for (const f of filas) {
    if (laDejaronComoEsta(f)) { dejadas++; continue; }
    if (f.estado === ESTADO_LINEA.LISTO_PARA_ACTUALIZAR) { listos++; continue; }
    if (f.estado === ESTADO_LINEA.SIN_CAMBIOS) { sinCambio++; continue; }
    const m = motivoDeRevision(f);
    if (m) { porMotivo[m] += 1; paraRevisar++; }
  }

  return { listos, sinCambio, paraRevisar, dejadas, porMotivo, total: filas.length };
}

/**
 * ¿Los contadores cierran contra el total?
 *
 * Un resumen que no cierra esconde filas que nadie mira. Se afirma acá y no en
 * un comentario para que se rompa el día que alguien agregue un estado sin
 * decidir en qué grupo cae.
 */
export function resultadoCierra(r) {
  return r.listos + r.sinCambio + r.dejadas + r.paraRevisar === r.total;
}
