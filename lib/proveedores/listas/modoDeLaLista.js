// lib/proveedores/listas/modoDeLaLista.js
//
// ¿ESTA LISTA VIENE A CAMBIAR PRECIOS O A CONTROLARLOS?
//
// ── DE DÓNDE SALE, Y ES UN PEDIDO DE EMANUEL ───────────────────────────────
//
// Subió una lista de Arcor con el rango en 0 % a 0 %, A PROPÓSITO: no quería
// actualizar nada, quería ver si la lista coincidía con lo que ya tenía cargado.
// Es una pregunta legítima y el módulo no la sabía contestar.
//
// Lo que pasó es peor que "no funcionó". El rango 0–0 es válido para
// `rangoValido` —0 ≤ 0— así que el motor siguió como si fuera una lista normal,
// y ahí se rompió en silencio: para elegir la columna de precio de toda la
// lista, cada opción se puntúa contando cuántas filas "explica", y con 0–0 una
// fila solo cuenta si el precio da EXACTAMENTE el costo de hoy, al centavo.
//
// Con redondeo eso no pasa casi nunca. Las dos columnas de precio de Arcor
// —sin IVA y con IVA— sacaron cero las dos, ninguna llegó a la mayoría mínima,
// el motor se negó a elegir y le pasó la decisión al usuario con "coincide en 0
// de cada 100 productos" en las dos opciones. O sea: le pidió que eligiera sin
// darle con qué. Eligió la de sin IVA, que es la primera, y quedaron 213 filas
// para revisar diciendo todas "entre 0,0 % y 0,0 %".
//
// ── LA CORRECCIÓN ES UNA SOLA IDEA ─────────────────────────────────────────
//
// Controlar no es "actualizar con el rango en cero": es la MISMA maquinaria con
// otro objetivo. En vez de "que la variación caiga entre min y max", el objetivo
// es "que el precio COINCIDA con el costo de hoy", y coincidir admite redondeo.
//
// Con esa tolerancia el puntaje vuelve a funcionar: la columna con IVA explica
// casi todas las filas, la de sin IVA ninguna, y el motor elige sola la que
// corresponde. Es el mismo mecanismo que ya elegía bien con un rango de 10 a 20.
//
// ── POR QUÉ LA TOLERANCIA ES DOBLE ─────────────────────────────────────────
//
// Porque un porcentaje solo no alcanza en los dos extremos del catálogo. En un
// producto de $35.000, medio por ciento son $177 y eso NO es redondeo. En uno de
// $50, un peso es el 2 % y sí lo es. Se toma la más generosa de las dos: pasa si
// difiere menos del 0,5 % O menos de un peso.
//
// Módulo puro: sin BD, sin Next.

/** Para qué se subió esta lista. */
export const MODO_LISTA = {
  /** Lo de siempre: escribir los costos que suban dentro de lo esperado. */
  ACTUALIZAR: "ACTUALIZAR",
  /** Comparar contra los costos de hoy. No escribe nada. */
  CONTROLAR: "CONTROLAR",
};

export const TEXTO_MODO = {
  ACTUALIZAR: {
    titulo: "Actualizar precios",
    detalle: "Cambia los costos que suban dentro de lo que esperás.",
  },
  CONTROLAR: {
    titulo: "Solo controlar",
    detalle: "Compara la lista con tus costos de hoy. No cambia nada.",
  },
};

/** Cuánto puede diferir un precio del costo y seguir contando como igual. */
export const TOLERANCIA = Object.freeze({ pct: 0.5, pesos: 1 });

export function esModoValido(modo) {
  return modo === MODO_LISTA.ACTUALIZAR || modo === MODO_LISTA.CONTROLAR;
}

/**
 * El modo de una importación, mirando lo guardado.
 *
 * Las importaciones de antes de esta tanda no tienen la columna, y son todas de
 * actualizar: el default cubre el histórico sin tener que escribirlo.
 */
export function modoDeImportacion(cabecera) {
  return esModoValido(cabecera?.modo) ? cabecera.modo : MODO_LISTA.ACTUALIZAR;
}

/**
 * ¿UN RANGO 0–0 CARGADO A MANO ES UN CONTROL?
 *
 * Sí, y por eso se pregunta acá en vez de dejarlo pasar. Nadie espera que sus
 * costos suban "entre 0 % y 0 %": quien escribe eso está pidiendo que no se
 * cambie nada, que es exactamente controlar. Tratarlo como una lista de
 * actualizar es lo que produjo las 213 filas diciendo "entre 0,0 % y 0,0 %".
 *
 * Se mira que los DOS sean cero. Un 0 a 15 es un rango real —"que no baje y que
 * no suba más de 15"— y no tiene nada que ver con esto.
 */
export function elCeroACeroEsUnControl({ minPct, maxPct } = {}) {
  // ── VACÍO NO ES CERO, Y ACÁ LA DIFERENCIA DECIDE EL MODO ────────────────
  //
  // `Number(null)` da 0 y `Number("")` también, y los dos pasan
  // `Number.isFinite`. Sin este corte, un rango SIN CARGAR contestaba que sí:
  // un formulario a medio llenar en modo actualizar se habría convertido en un
  // control, con su aviso diciéndole a la persona que puso 0 % cuando no puso
  // nada. Y el control elegido a mano —que guarda el rango en null— habría
  // salido marcado como convertido, o sea con un aviso que no le corresponde.
  //
  // Es la segunda vez en este mismo módulo: `recomendarPorCercania` dejaba
  // pasar una lectura con `costoNuevo: null` como si valiera cero pesos.
  const vacio = (v) => v === null || v === undefined || v === "";
  if (vacio(minPct) || vacio(maxPct)) return false;

  const min = Number(minPct);
  const max = Number(maxPct);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;
  return min === 0 && max === 0;
}

/** El aviso que se muestra cuando se convirtió un 0–0 en un control. */
export const AVISO_CERO_A_CERO =
  "Pusiste 0 %: lo tomo como un control. Si querés actualizar precios, poné cuánto suele aumentar.";

/**
 * El modo que corresponde, mirando lo que el usuario pidió Y lo que cargó.
 *
 * Devuelve además si hubo que corregirlo, para que la pantalla lo pueda decir en
 * vez de cambiar de modo en silencio. Un cambio de comportamiento que no se
 * anuncia es indistinguible de un defecto.
 */
export function resolverModo({ modoPedido, minPct, maxPct } = {}) {
  if (modoPedido === MODO_LISTA.CONTROLAR) {
    return { modo: MODO_LISTA.CONTROLAR, aviso: null };
  }
  if (elCeroACeroEsUnControl({ minPct, maxPct })) {
    return { modo: MODO_LISTA.CONTROLAR, aviso: AVISO_CERO_A_CERO };
  }
  return { modo: MODO_LISTA.ACTUALIZAR, aviso: null };
}

/**
 * ¿ESTE CONTROL NACIÓ DE UN 0 A 0 ESCRITO A MANO?
 *
 * ── POR QUÉ ES UN PREDICADO Y NO UNA COLUMNA ───────────────────────────────
 *
 * Porque los dos hechos que lo contestan ya están guardados y no hace falta un
 * tercero: el modo, y el rango con el que se creó la importación.
 *
 *   elegido a mano   → modo CONTROLAR y el rango en null, porque la pantalla no
 *                      lo pregunta y no hay ningún criterio de rango que asentar
 *   convertido       → modo CONTROLAR y el rango en 0 y 0, que es lo que la
 *                      persona efectivamente escribió
 *
 * Con eso el aviso sobrevive a la navegación —se puede volver a la importación
 * una semana después y sigue explicando por qué es un control— sin agregar una
 * columna que habría que mantener sincronizada con las otras dos.
 */
export function fueUnCeroACeroConvertido(cabecera) {
  if (modoDeImportacion(cabecera) !== MODO_LISTA.CONTROLAR) return false;
  return elCeroACeroEsUnControl({
    minPct: cabecera?.aumentoEsperadoMinPct,
    maxPct: cabecera?.aumentoEsperadoMaxPct,
  });
}

/**
 * ¿ESTA IMPORTACIÓN QUEDÓ ATRAPADA EN EL DEFECTO VIEJO?
 *
 * ── LA QUE YA ESTÁ LEÍDA Y NO SE ARREGLA SOLA ──────────────────────────────
 *
 * Desde esta tanda un 0 a 0 se convierte en control AL SUBIR. Pero la lista que
 * Emanuel ya subió sigue ahí: su `modo` quedó sin escribir —o sea, actualizar—
 * con el rango en 0 y 0, y sus 213 filas tienen el veredicto que salió de
 * puntuar las columnas con ese rango.
 *
 * Eso no se corrige con una migración: habría que volver a conciliar, y una
 * migración que recalcula costos es una migración que escribe decisiones que
 * nadie miró. Se corrige cuando alguien la abre, se le avisa, y elige.
 *
 * `null` y ACTUALIZAR cuentan los dos: una importación vieja no tiene la columna
 * y es exactamente el caso que se está buscando.
 */
export function quedoAtrapadaEnElCeroACero(cabecera) {
  if (modoDeImportacion(cabecera) !== MODO_LISTA.ACTUALIZAR) return false;
  return elCeroACeroEsUnControl({
    minPct: cabecera?.aumentoEsperadoMinPct,
    maxPct: cabecera?.aumentoEsperadoMaxPct,
  });
}

export const AVISO_QUEDO_ATRAPADA =
  "Esta lista se leyó con un aumento esperado de 0 % a 0 %, así que el sistema no pudo elegir " +
  "la columna de precio y dejó todo para revisar. Pasala a control para comparar contra tus " +
  "costos, o cancelala y subila de nuevo.";

/**
 * EL RANGO, DICHO EN PALABRAS — Y VACÍO CUANDO NO HAY NINGUNO QUE DECIR.
 *
 * ── LA FRASE QUE ESTA TANDA EXISTE PARA QUE NO APAREZCA ────────────────────
 *
 * "entre 0,0 % y 0,0 %". Es lo que Emanuel vio 213 veces, y no es solo feo: es
 * FALSO. Dice que este proveedor suele aumentar entre cero y cero, cuando lo que
 * pasó es que nadie cargó ningún aumento esperado porque la lista se subió a
 * controlar.
 *
 * Se contesta acá, en el módulo que ya sabe qué significa un 0 a 0, y no en cada
 * pantalla: la frase la arman tres —la de revisar, la del resultado y la
 * confirmación de fuera de rango— y tres copias de esta condición se separan el
 * día que alguien corrige una.
 *
 * Devuelve cadena vacía, no `null`: quien la usa la interpola, y `null` escribiría
 * "null" en la pantalla.
 */
export function textoDelRango({ minPct, maxPct } = {}, formatear = (n) => `${n} %`) {
  if (elCeroACeroEsUnControl({ minPct, maxPct })) return "";
  const vacio = (v) => v === null || v === undefined || v === "";
  if (vacio(minPct) || vacio(maxPct)) return "";
  const min = Number(minPct);
  const max = Number(maxPct);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  return `entre ${formatear(min)} y ${formatear(max)}`;
}

/**
 * ¿Estos dos importes son el mismo, salvo redondeo?
 *
 * Es el corazón del modo controlar. La tolerancia es la más generosa de las dos
 * —porcentaje O pesos— por lo que está escrito arriba: ninguna de las dos sola
 * sirve para todo el catálogo.
 */
export function coincideConElCosto(costoActual, precio, tolerancia = TOLERANCIA) {
  const a = Number(costoActual);
  const b = Number(precio);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return false;
  const diferencia = Math.abs(b - a);
  if (diferencia <= Number(tolerancia.pesos)) return true;
  return (diferencia / a) * 100 <= Number(tolerancia.pct);
}

/** En qué situación quedó un producto frente a la lista, controlando. */
export const CONTROL = {
  COINCIDE: "COINCIDE",
  /** Tu costo es más bajo: la lista dice más. */
  TU_COSTO_MAS_BAJO: "TU_COSTO_MAS_BAJO",
  /** Tu costo es más alto: la lista dice menos. */
  TU_COSTO_MAS_ALTO: "TU_COSTO_MAS_ALTO",
};

export const TEXTO_CONTROL = {
  COINCIDE: { titulo: "coinciden con tu costo", detalle: null },
  TU_COSTO_MAS_BAJO: { titulo: "tu costo es más bajo", detalle: "La lista dice más" },
  TU_COSTO_MAS_ALTO: { titulo: "tu costo es más alto", detalle: "La lista dice menos" },
};

export const ORDEN_CONTROL = [
  CONTROL.COINCIDE,
  CONTROL.TU_COSTO_MAS_BAJO,
  CONTROL.TU_COSTO_MAS_ALTO,
];

/**
 * Cómo quedó este producto frente a lo que dice la lista.
 *
 * `null` cuando no se puede comparar: sin costo cargado no hay contra qué, y
 * decir "la lista dice más" sobre un producto sin costo sería inventar un
 * veredicto. Esos van a su propio grupo, como en el modo de actualizar.
 */
export function compararConLaLista({ costoActual, precio } = {}) {
  const a = Number(costoActual);
  const b = Number(precio);
  if (!Number.isFinite(a) || a <= 0) return null;
  if (!Number.isFinite(b) || b <= 0) return null;
  if (coincideConElCosto(a, b)) return CONTROL.COINCIDE;
  return b > a ? CONTROL.TU_COSTO_MAS_BAJO : CONTROL.TU_COSTO_MAS_ALTO;
}

/**
 * DE VARIAS LECTURAS POSIBLES, LA QUE MÁS SE ACERCA AL COSTO DE HOY.
 *
 * ── POR QUÉ NO SE ESCRIBE OTRO EVALUADOR ───────────────────────────────────
 *
 * Porque `recomendarHipotesis` ya calcula lo que hace falta. Llamada con el
 * objetivo en 0 a 0, su campo `distancia` ES la distancia al costo de hoy: la
 * misma cuenta que este modo necesita, hecha por la misma función que decide en
 * el modo de actualizar. Escribir un segundo evaluador acá sería tener dos
 * respuestas a "cuánto se aleja esta lectura", y el día que una cambie la
 * pantalla de controlar y la de actualizar dirían cosas distintas sobre la
 * misma fila.
 *
 * Lo que este modo agrega es SOLO el criterio de elección: allá gana la que cae
 * en el rango, acá gana la que queda más cerca. Y una que coincide dentro de la
 * tolerancia es mejor que una que está cerca pero no coincide, aunque las dos
 * tengan distancia parecida — porque coincidir es lo que se vino a controlar.
 *
 * @param evaluadas  lo que devuelve `recomendarHipotesis(...).evaluadas`
 * @param costoActual el costo de hoy, para medir la coincidencia
 */
export function recomendarPorCercania(evaluadas = [], costoActual) {
  // `Number(null)` da 0 y `Number.isFinite(0)` es true: una lectura sin costo
  // se colaba como si valiera cero pesos y podía ganar por "cercanía" contra un
  // costo bajo. Se descarta el vacío ANTES de convertir.
  const usables = evaluadas.filter((h) => {
    const v = h?.costoNuevo;
    if (v === null || v === undefined || v === "") return false;
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  });
  if (usables.length === 0) return { recomendada: null, coincide: false };

  const queCoinciden = usables.filter((h) => coincideConElCosto(costoActual, h.costoNuevo));
  const candidatas = queCoinciden.length > 0 ? queCoinciden : usables;

  // La de menor distancia. Empatadas, la de menos supuestos: `distancia` sale
  // del mismo cálculo que usa el modo de actualizar, y el orden de llegada
  // conserva la preferencia con la que el motor arma las lecturas.
  let mejor = candidatas[0];
  for (const h of candidatas) {
    const a = Math.abs(Number(h.distancia ?? Infinity));
    const b = Math.abs(Number(mejor.distancia ?? Infinity));
    if (a < b) mejor = h;
  }
  return { recomendada: mejor.clave ?? null, coincide: queCoinciden.length > 0, lectura: mejor };
}

/**
 * La diferencia, en pesos y en porcentaje, para mostrarla.
 *
 * Sale de acá y no del JSX porque la muestran tres pantallas —el resumen del
 * control, cada una de sus listas, y el reporte— y tres copias de una cuenta se
 * separan el día que alguien corrige una.
 */
export function diferenciaContraElCosto({ costoActual, precio } = {}) {
  const a = Number(costoActual);
  const b = Number(precio);
  if (!Number.isFinite(a) || a <= 0 || !Number.isFinite(b)) {
    return { pesos: null, pct: null };
  }
  const pesos = Math.round((b - a) * 100) / 100;
  const pct = Math.round(((b - a) / a) * 1000) / 10;
  return { pesos, pct };
}
