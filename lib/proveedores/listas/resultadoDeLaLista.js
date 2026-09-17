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
// La MISMA pregunta que usa `aplicacion.js` para decidir si escribe un costo
// fuera de rango. Si el resumen usara su propia versión, podría contar como
// listo algo que aplicar después rechaza.
import { laEligioUnaPersona } from "./rangoAumento.js";

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
 * ¿Esta fila quedó con un costo fuera del rango que NADIE eligió sabiéndolo?
 *
 * Es la pregunta que le faltaba al resumen. El estado de una fila se congela al
 * conciliar y `clasificarLinea` no mira el rango, así que "LISTO_PARA_ACTUALIZAR"
 * no garantiza que el costo sea razonable — garantiza que hay producto, que se
 * le puede escribir y que el número cambia.
 *
 * Se mira el porcentaje GUARDADO contra el rango con el que se decidió la fila,
 * que es el mismo par que mira `aplicacion.js`. Los dos tienen que contestar
 * igual: si el resumen contara como listo algo que aplicar después rechaza, el
 * número grande de la pantalla prometería costos que no se van a escribir.
 */
export function estaFueraDelRangoSinElegir(fila, rango = null) {
  const min = numeroONull(fila?.aumentoEsperadoMinPct) ?? numeroONull(rango?.minPct);
  const max = numeroONull(fila?.aumentoEsperadoMaxPct) ?? numeroONull(rango?.maxPct);
  if (min === null || max === null) return false;

  const pct = numeroONull(fila?.diferenciaPct);
  if (pct === null) return false;
  // Un costo que no se mueve no está afuera de nada; ése ya es SIN_CAMBIOS.
  if (pct === 0) return false;
  const fuera = pct < min || pct > max;
  if (!fuera) return false;

  return !laEligioUnaPersona(fila);
}

const numeroONull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * En qué grupo de revisión cae una fila, o null si no hay que revisarla.
 *
 * @param fila  { estado, motivo, costoAnterior, productoBaseId, excluidaManual }
 */
export function motivoDeRevision(fila, rango = null) {
  const estado = fila?.estado;
  if (laDejaronComoEsta(fila)) return null;
  if (estado === ESTADO_LINEA.SIN_CAMBIOS) return null;

  // ── UNA "LISTA" FUERA DEL RANGO QUE NADIE ELIGIÓ VUELVE A LA COLA ────────
  //
  // El estado se congela al conciliar y `clasificarLinea` no mira el rango, así
  // que una fila puede quedar LISTO_PARA_ACTUALIZAR con un aumento de +1.008 %
  // sobre un proveedor de 2 a 15. Pasó: la importación #5 mostraba "112
  // productos listos · Todos aumentan entre +2,6 % y +1.008,5 %".
  //
  // Contarla entre los listos es lo que hacía que el número grande de la
  // pantalla mintiera, y además la habría incluido en el "Aplicar los N".
  // Vuelve a la cola, donde se puede mirar y decidir.
  //
  // Sin rango no se reclasifica nada: no se puede decir que algo esté afuera de
  // un criterio que no existe.
  if (estado === ESTADO_LINEA.LISTO_PARA_ACTUALIZAR) {
    return estaFueraDelRangoSinElegir(fila, rango) ? MOTIVO_REVISION.AUMENTO_DISTINTO : null;
  }

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
export function contarResultado(filas = [], rango = null) {
  const porMotivo = {};
  for (const m of ORDEN_MOTIVOS) porMotivo[m] = 0;

  let listos = 0;
  let listosElegidosFueraDeRango = 0;
  let sinCambio = 0;
  let dejadas = 0;
  let paraRevisar = 0;
  let sinProducto = 0;
  // El rango real de lo que SÍ se va a aplicar. Se calcula acá, sobre las mismas
  // filas que se cuentan, para que el resumen no pueda decir un rango que no
  // corresponde a los listos que muestra.
  let minListos = null;
  let maxListos = null;

  for (const f of filas) {
    if (laDejaronComoEsta(f)) { dejadas++; continue; }
    if (f.estado === ESTADO_LINEA.SIN_CAMBIOS) { sinCambio++; continue; }

    const m = motivoDeRevision(f, rango);
    if (m === null) {
      listos++;
      const pct = numeroONull(f?.diferenciaPct);
      if (pct !== null) {
        minListos = minListos === null ? pct : Math.min(minListos, pct);
        maxListos = maxListos === null ? pct : Math.max(maxListos, pct);
      }
      // Los que una persona eligió sabiendo que quedaban afuera. Se cuentan
      // aparte para poder decirlo en vez de mezclarlos con los que sí caen.
      if (laEligioUnaPersona(f)) listosElegidosFueraDeRango++;
      continue;
    }

    // ── "NO ESTÁ EN TU CATÁLOGO" NO ES ALGO PARA REVISAR ──────────────────
    //
    // Son productos que el proveedor vende y Emanuel no. En la #5 eran 554 de
    // 595: la cola decía "595 para revisar" sobre un trabajo que en realidad
    // eran 41 decisiones. Se cuentan igual —hay que poder verlos y vincular
    // alguno— pero en su propio número y fuera de la cola.
    if (m === MOTIVO_REVISION.SIN_PRODUCTO) { sinProducto++; porMotivo[m] += 1; continue; }

    porMotivo[m] += 1;
    paraRevisar++;
  }

  return {
    listos,
    listosElegidosFueraDeRango,
    sinCambio,
    paraRevisar,
    sinProducto,
    dejadas,
    porMotivo,
    total: filas.length,
    rangoDeLosListos: { minPct: minListos, maxPct: maxListos },
  };
}

/**
 * ¿Los contadores cierran contra el total?
 *
 * Un resumen que no cierra esconde filas que nadie mira. Se afirma acá y no en
 * un comentario para que se rompa el día que alguien agregue un estado sin
 * decidir en qué grupo cae.
 */
export function resultadoCierra(r) {
  return r.listos + r.sinCambio + r.dejadas + r.paraRevisar + r.sinProducto === r.total;
}
