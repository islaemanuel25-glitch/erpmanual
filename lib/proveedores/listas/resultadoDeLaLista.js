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
// EL VEREDICTO DE UNA FILA CONTROLADA. Es la misma función que usa el motor: acá
// solo se agrupa lo que ella decide. Ver `contarControl`.
import { CONTROL, compararConLaLista } from "./modoDeLaLista.js";

/** Por qué una fila está en la cola de revisión. */
export const MOTIVO_REVISION = {
  AUMENTO_DISTINTO: "AUMENTO_DISTINTO",
  SIN_COSTO: "SIN_COSTO",
  SIN_PRODUCTO: "SIN_PRODUCTO",
  REPETIDO: "REPETIDO",
  /** Hay producto, pero a este usuario o a esta ubicación no se le deja escribirle el costo. */
  NO_SE_PUEDE_ESCRIBIR: "NO_SE_PUEDE_ESCRIBIR",
  /** La fila del archivo no se pudo leer ni calcular. */
  NO_SE_PUDO_LEER: "NO_SE_PUDO_LEER",
  /** Un estado que esta traducción no conoce. Hoy no lo produce ninguna fila. */
  SIN_EXPLICACION: "SIN_EXPLICACION",
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
  // ── "OTROS PARA MIRAR" NO ERA UN MOTIVO, ERA UNA BOLSA ───────────────────
  //
  // Decía "Filas que el sistema no pudo procesar" sobre dos cosas que no se
  // parecen en nada y se arreglan distinto: un producto al que este usuario no
  // le puede escribir el costo —que es un permiso, y el producto está perfecto—
  // y una fila del archivo que ni siquiera se pudo leer. Emanuel veía "Otros
  // para mirar · 3" y no tenía forma de saber cuál de las dos cosas mirar.
  //
  // Son los dos únicos estados que caían ahí: `BLOQUEADO` y `ERROR`. Ahora cada
  // uno dice lo suyo, y no queda ninguna bolsa: el candado
  // "los ocho estados tienen su motivo real" lo sostiene.
  NO_SE_PUEDE_ESCRIBIR: {
    titulo: "No se les puede escribir el costo",
    ayuda: () =>
      "El producto está bien; lo que falta es el permiso o la unidad. Desde esta ubicación no se les puede cambiar el costo.",
  },
  NO_SE_PUDO_LEER: {
    titulo: "El archivo no se pudo leer en estas filas",
    ayuda: () =>
      "Vienen con algo que el lector no pudo interpretar —un precio que no es un número, una celda vacía—. Hay que mirarlas en el archivo.",
  },
  SIN_EXPLICACION: {
    titulo: "Quedaron en un estado que esta pantalla no sabe explicar",
    ayuda: () =>
      "No deberían existir. Si ves alguna, avisá: es un caso que el sistema no previó y por las dudas no se toca.",
  },
};

/** El orden en que se ofrecen los grupos: primero lo más frecuente y accionable. */
export const ORDEN_MOTIVOS = [
  MOTIVO_REVISION.AUMENTO_DISTINTO,
  MOTIVO_REVISION.SIN_COSTO,
  MOTIVO_REVISION.SIN_PRODUCTO,
  MOTIVO_REVISION.REPETIDO,
  MOTIVO_REVISION.NO_SE_PUEDE_ESCRIBIR,
  MOTIVO_REVISION.NO_SE_PUDO_LEER,
  MOTIVO_REVISION.SIN_EXPLICACION,
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
export function estaFueraDelRango(fila, rango = null) {
  const min = numeroONull(fila?.aumentoEsperadoMinPct) ?? numeroONull(rango?.minPct);
  const max = numeroONull(fila?.aumentoEsperadoMaxPct) ?? numeroONull(rango?.maxPct);
  if (min === null || max === null) return false;

  const pct = numeroONull(fila?.diferenciaPct);
  if (pct === null) return false;
  // Un costo que no se mueve no está afuera de nada; ése ya es SIN_CAMBIOS.
  if (pct === 0) return false;
  return pct < min || pct > max;
}

/**
 * ¿Y además NADIE la eligió sabiéndolo?
 *
 * Son dos preguntas y estaban en una sola función. Se separaron porque el
 * resumen necesita las dos por separado: ésta decide si la fila vuelve a la
 * cola, y la de arriba decide en qué rango se la cuenta —el de los que caen
 * solos, o el de los que alguien eligió—.
 */
export function estaFueraDelRangoSinElegir(fila, rango = null) {
  return estaFueraDelRango(fila, rango) && !laEligioUnaPersona(fila);
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

  // ── LOS DOS QUE FALTABAN, CON SU NOMBRE ─────────────────────────────────
  //
  // Antes caían los dos en un "Otros para mirar" que no le decía a nadie qué
  // mirar. Se nombran acá y no se dejan a la rama final para que un estado
  // nuevo NO entre en silencio en una bolsa: si mañana aparece uno, esta
  // función devuelve `null` y el candado que afirma que los ocho estados tienen
  // su motivo se pone rojo. Es al revés de como estaba: la bolsa aceptaba todo
  // y nunca avisaba.
  if (estado === ESTADO_LINEA.BLOQUEADO) return MOTIVO_REVISION.NO_SE_PUEDE_ESCRIBIR;
  if (estado === ESTADO_LINEA.ERROR) return MOTIVO_REVISION.NO_SE_PUDO_LEER;

  // Un estado que esta función no conoce. Hoy no existe —los ocho de
  // `estados.js` salen todos por una rama con nombre, y hay un candado que lo
  // afirma— y por eso el default no es `null`: `null` significa "listo para
  // aplicar", así que un estado nuevo entraría a la cuenta de los que se
  // escriben sin que nadie lo hubiera mirado nunca. Va a revisión, que es el
  // lado seguro, y dice exactamente lo que le pasa.
  return MOTIVO_REVISION.SIN_EXPLICACION;
}

/**
 * LOS CONTADORES DE UNA LISTA SUBIDA PARA CONTROLAR.
 *
 * ── POR QUÉ NO SE REUSA `contarResultado` ──────────────────────────────────
 *
 * Porque cuenta otra cosa. `contarResultado` responde "cuántos se van a
 * escribir, cuántos hay que mirar y cuántos quedaron afuera", y controlando no
 * se escribe nada: las tres respuestas serían cero, cero y todo. La pregunta de
 * este modo es otra —cuántos coinciden con tu costo, en cuántos la lista dice
 * más y en cuántos dice menos— y forzarla adentro del otro contador lo dejaría
 * contestando dos preguntas distintas según una bandera.
 *
 * ── PERO EL VEREDICTO DE CADA FILA SÍ ES EL MISMO ──────────────────────────
 *
 * Sale de `compararConLaLista`, que es la función que ya usa el motor. Acá solo
 * se agrupa. Escribir la comparación otra vez adentro de este `for` sería tener
 * dos respuestas a "¿este precio coincide con este costo?", y el día que una
 * cambie el resumen y el detalle de la misma fila dirían cosas distintas.
 *
 * ── Y NO ES UNA COLUMNA, SON DOS HECHOS Y UN PREDICADO ─────────────────────
 *
 * `costoAnterior` y `costoMaestroPropuesto` ya están persistidos. El grupo de
 * control se deduce de los dos, así que no hace falta guardarlo: una columna más
 * sería una más que puede quedar en desacuerdo con los números que la explican.
 *
 * @param filas  filas con `costoAnterior`, `costoMaestroPropuesto` y `estado`
 * @returns { coinciden, tuCostoMasBajo, tuCostoMasAlto, sinComparar, total }
 */
export function contarControl(filas = []) {
  let coinciden = 0;
  let tuCostoMasBajo = 0;
  let tuCostoMasAlto = 0;
  let sinComparar = 0;

  for (const f of filas) {
    // UNA FILA SIN PRODUCTO NO ES UNA DIFERENCIA. No tiene costo contra el cual
    // comparar, y meterla en "la lista dice más" inventaría un veredicto sobre
    // algo que ni siquiera está en el catálogo. Va a su propio grupo, que es el
    // mismo "de la lista que no tenés" que ya muestra el modo de actualizar.
    const veredicto = compararConLaLista({
      costoActual: f?.costoAnterior,
      precio: f?.costoMaestroPropuesto,
    });
    if (veredicto === CONTROL.COINCIDE) coinciden++;
    else if (veredicto === CONTROL.TU_COSTO_MAS_BAJO) tuCostoMasBajo++;
    else if (veredicto === CONTROL.TU_COSTO_MAS_ALTO) tuCostoMasAlto++;
    else sinComparar++;
  }

  return { coinciden, tuCostoMasBajo, tuCostoMasAlto, sinComparar, total: filas.length };
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
  // ── LOS ELEGIDOS A MANO SE MIDEN APARTE ────────────────────────────────
  //
  // Un costo fuera de rango que una persona eligió sabiendo lo que hacía SÍ se
  // va a aplicar, así que contarlo entre los listos es correcto. Meterlo en el
  // MISMO rango no: la frase pasaba a decir "todos aumentan entre +5,0 % y
  // +99,5 %" sobre un proveedor de 2 a 15, que es la forma suave del cartel que
  // Emanuel vio en la #5. El rango que se anuncia no puede salirse del
  // configurado; lo que se sale se nombra y se cuenta.
  let minElegidos = null;
  let maxElegidos = null;

  let yaAplicadas = 0;

  for (const f of filas) {
    // ── LO QUE YA SE ESCRIBIÓ NO SE VA A ESCRIBIR OTRA VEZ ────────────────
    //
    // ENCONTRADO ABRIENDO LA PANTALLA con una lista parcialmente aplicada: el
    // número grande decía "361 se actualizan" sobre 361 costos que YA estaban
    // escritos, y el botón decía "Aplicar los 361 precios" sobre una operación
    // que no iba a tocar nada — `aplicar` filtra por `aplicada: false`, así que
    // habría aplicado cero.
    //
    // Y en la pantalla de los que se actualizan era peor, porque ahora cada
    // fila se toca: "Dejarlo como está" sobre una fila ya aplicada ofrece no
    // escribir un costo que ya está escrito.
    //
    // Va PRIMERO, antes que cualquier otra rama: una fila aplicada ya no se
    // puede dejar, ni revisar, ni volver a contar. Lo que se hace con ella es
    // deshacer, que es otro botón y otra pantalla.
    if (f?.aplicada === true) { yaAplicadas++; continue; }

    if (laDejaronComoEsta(f)) { dejadas++; continue; }
    if (f.estado === ESTADO_LINEA.SIN_CAMBIOS) { sinCambio++; continue; }

    const m = motivoDeRevision(f, rango);
    if (m === null) {
      listos++;
      const pct = numeroONull(f?.diferenciaPct);
      // Los que una persona eligió sabiendo que quedaban afuera. Van a su
      // propio contador y a su propio rango: así el número grande los incluye
      // —se van a escribir— y la frase de abajo no los mezcla con los demás.
      const elegido = laEligioUnaPersona(f) && estaFueraDelRango(f, rango);
      if (elegido) listosElegidosFueraDeRango++;
      if (pct !== null) {
        if (elegido) {
          minElegidos = minElegidos === null ? pct : Math.min(minElegidos, pct);
          maxElegidos = maxElegidos === null ? pct : Math.max(maxElegidos, pct);
        } else {
          minListos = minListos === null ? pct : Math.min(minListos, pct);
          maxListos = maxListos === null ? pct : Math.max(maxListos, pct);
        }
      }
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
    // Las que ya se escribieron. No son "listas" ni están pendientes: son
    // historia de esta importación, y tienen su propio número para que el
    // resumen pueda cerrar sin contarlas dos veces.
    yaAplicadas,
    listosElegidosFueraDeRango,
    sinCambio,
    paraRevisar,
    sinProducto,
    dejadas,
    porMotivo,
    total: filas.length,
    rangoDeLosListos: { minPct: minListos, maxPct: maxListos },
    rangoDeLosElegidos: { minPct: minElegidos, maxPct: maxElegidos },
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
  return (
    r.listos + r.yaAplicadas + r.sinCambio + r.dejadas + r.paraRevisar + r.sinProducto === r.total
  );
}
