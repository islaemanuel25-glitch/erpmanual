// lib/proveedores/listas/rangoAumento.js
//
// EL RANGO DE AUMENTO ESPERADO como control de coherencia.
//
// ── QUÉ ES Y QUÉ NO ES ──────────────────────────────────────────────────────
//
// El recargo comercial y el rango esperado son cosas separadas y NO se suman. El
// recargo construye el costo propuesto —precio del proveedor más 5 %—; el rango
// se usa después, comparando ese costo propuesto contra el costo que el producto
// ya tiene. Un rango de 10 a 20 % sigue siendo 10 a 20 % aunque el recargo sea
// 5: no se convierte en 15 a 25.
//
// ── PARA QUÉ SIRVE ──────────────────────────────────────────────────────────
//
// Es EVIDENCIA DE COHERENCIA, no una prueba. Cuando el precio del proveedor es
// por unidad y el producto podría ser esa unidad o un pack, las dos hipótesis
// dan costos muy distintos y una suele ser absurda: una caja de 21 alfajores que
// hoy vale $21.000 no puede pasar a costar $1.050. El porcentaje delata cuál es
// cuál.
//
// Lo que NUNCA hace: confirmar solo. Una fila no se aplica por caer dentro del
// rango, y una fila fuera del rango no se descarta ni se esconde. Todas quedan
// visibles y todas necesitan que una persona diga que sí.
//
// Módulo puro: sin BD, sin Next.

import { aCentavos } from "./calculoCosto.js";
// Quién decide si una confirmación sigue valiendo. Se importa en vez de
// reescribir la regla: es la misma pregunta que ya se hace `aplicacion.js`, y
// dos versiones de "esta confirmación vale" es cómo se escribe un costo que
// nadie eligió.
import { confirmacionDeInterpretacionVigente } from "./vigenciaConfirmacion.js";

/** Los estados en que puede quedar una variación. */
export const ESTADO_VARIACION = {
  ESPERADO: "ESPERADO",
  AUMENTO_BAJO: "AUMENTO_BAJO",
  AUMENTO_ALTO: "AUMENTO_ALTO",
  SIN_AUMENTO: "SIN_AUMENTO",
  DISMINUCION: "DISMINUCION",
  /** No hay costo previo con el que comparar. */
  SIN_REFERENCIA: "SIN_REFERENCIA",
  /**
   * No hay RANGO con el que comparar: el proveedor no lo tiene cargado.
   *
   * Es distinto de SIN_REFERENCIA —ahí falta el costo anterior, acá falta el
   * criterio— y es distinto de estar fuera del rango. Tiene estado propio
   * porque, si cayera en cualquiera de los otros, la pantalla informaría un
   * veredicto sobre una comparación que nunca se hizo.
   */
  SIN_RANGO: "SIN_RANGO",
};

export const TEXTO_ESTADO_VARIACION = {
  ESPERADO: "Aumento esperado",
  AUMENTO_BAJO: "Aumento bajo",
  AUMENTO_ALTO: "Aumento alto",
  SIN_AUMENTO: "Sin aumento",
  DISMINUCION: "Disminución",
  SIN_REFERENCIA: "Sin costo anterior para comparar",
  SIN_RANGO: "Falta cargar el aumento esperado de este proveedor",
};

/**
 * Token semántico del theme para cada estado. NO son colores: son nombres del
 * sistema, y quien cambie la paleta los cambia en un solo lugar.
 *
 * Disminución y costo igual comparten el tono de alarma: las dos significan que
 * una lista nueva no aumentó nada, que en la práctica es la señal de que la
 * interpretación está mal.
 */
export const TONO_ESTADO_VARIACION = {
  ESPERADO: "sunmi-text-success",
  AUMENTO_BAJO: "sunmi-text-warning",
  AUMENTO_ALTO: "sunmi-text-warning",
  SIN_AUMENTO: "sunmi-text-danger",
  DISMINUCION: "sunmi-text-danger",
  SIN_REFERENCIA: "sunmi-text-muted",
  SIN_RANGO: "sunmi-text-muted",
};

/** Los que llevan advertencia visualmente fuerte, no una nota al pie. */
export function esAlertaFuerte(estado) {
  return estado === ESTADO_VARIACION.DISMINUCION || estado === ESTADO_VARIACION.SIN_AUMENTO;
}

/**
 * ¿Este estado exige que la persona lo confirme explícitamente?
 *
 * Todo lo que no sea "esperado". Y "esperado" tampoco se confirma solo: exige la
 * misma acción de la persona, lo que cambia es que no lleva advertencia.
 */
export function exigeConfirmacionExplicita(estado) {
  return estado !== ESTADO_VARIACION.ESPERADO;
}

// ── NO HAY RANGO POR DEFECTO, Y ES A PROPÓSITO ──────────────────────────────
//
// Acá vivía `RANGO_POR_DEFECTO = { minPct: 10, maxPct: 20 }`. Se sacó el
// 2026-09-16: el rango ahora se carga por proveedor y una lista sin rango no se
// concilia.
//
// No es prolijidad. El default era 10 a 20 y los aumentos reales que nombró
// Emanuel andan por el 5 a 8: con ese default puesto, TODAS las filas de una
// lista real caen fuera del rango y se marcan "aumento bajo". Un valor de fábrica
// que decide costos no es una comodidad — es una respuesta inventada, y se ve
// exactamente igual que una contestada.
//
// Quien necesite saber con qué rango se evalúa una fila le pregunta a
// `rangoDeLaFila` en `vigenciaConfirmacion.js`, que hoy puede contestar que no
// hay ninguno. Eso es una respuesta válida y hay que tratarla.

/**
 * Un rango válido: dos números finitos, con el mínimo no mayor que el máximo.
 *
 * NULL NO ES CERO, y esto lo tiene que decir explícitamente. `Number(null)` da 0,
 * así que un rango sin cargar —`{ minPct: null, maxPct: null }`— pasaba por acá
 * como un rango perfectamente válido de "0 a 0", y con eso toda subida caía en
 * "aumento alto" con cara de veredicto.
 *
 * Mientras existió `RANGO_POR_DEFECTO` el caso no se alcanzaba: nunca llegaba un
 * null. Al sacar el default empezó a llegar, y el agujero apareció recién
 * ejerciéndolo. Se rechaza acá, en la raíz, y no en cada uno de los que
 * preguntan.
 */
export function rangoValido({ minPct, maxPct } = {}) {
  if (minPct === null || minPct === undefined || minPct === "") return false;
  if (maxPct === null || maxPct === undefined || maxPct === "") return false;
  const a = Number(minPct);
  const b = Number(maxPct);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a < 0 || b > 1000) return false;
  return a <= b;
}

/**
 * En qué estado cae una variación.
 *
 *   disminución        el costo baja
 *   sin aumento        el costo no se mueve
 *   aumento bajo       sube, pero menos que el mínimo esperado
 *   aumento esperado   entre el mínimo y el máximo, ambos incluidos
 *   aumento alto       más que el máximo
 *
 * La igualdad se mide en centavos, que es la unidad en la que el costo realmente
 * existe: 5.962,1600001 y 5.962,16 son el mismo costo.
 */
export function clasificarVariacion({ costoActual, costoNuevo, minPct, maxPct } = {}) {
  const nuevo = Number(costoNuevo);
  const actual = Number(costoActual);
  if (!Number.isFinite(nuevo) || nuevo <= 0 || !Number.isFinite(actual) || actual <= 0) {
    return { estado: ESTADO_VARIACION.SIN_REFERENCIA, variacionPct: null };
  }

  // SIN RANGO NO SE CLASIFICA, y el porcentaje igual se calcula y se devuelve.
  //
  // Va antes que la comparación en centavos a propósito: sin criterio, decir
  // "sin aumento" ya sería un veredicto. Lo único que se puede afirmar es cuánto
  // se movió, y eso se informa; el estado dice que falta el criterio.
  //
  // Sin esta guarda, `Number(null)` da 0 y el rango se leía como "0 a 0": toda
  // subida caía en AUMENTO_ALTO y toda bajada en DISMINUCION, con cara de
  // veredicto. Ése es exactamente el modo de fallar que el CLAUDE.md describe:
  // algo que no falla donde se rompe.
  const hayRango = rangoValido({ minPct, maxPct });
  const variacionPct = ((nuevo - actual) / actual) * 100;
  if (!hayRango) {
    return { estado: ESTADO_VARIACION.SIN_RANGO, variacionPct };
  }

  if (aCentavos(actual) === aCentavos(nuevo)) {
    return { estado: ESTADO_VARIACION.SIN_AUMENTO, variacionPct: 0 };
  }

  const min = Number(minPct);
  const max = Number(maxPct);

  if (variacionPct < 0) return { estado: ESTADO_VARIACION.DISMINUCION, variacionPct };
  if (variacionPct > max) return { estado: ESTADO_VARIACION.AUMENTO_ALTO, variacionPct };
  if (variacionPct < min) return { estado: ESTADO_VARIACION.AUMENTO_BAJO, variacionPct };
  return { estado: ESTADO_VARIACION.ESPERADO, variacionPct };
}

/**
 * Qué tan lejos está una variación de lo esperado. Sirve para ORDENAR, no para
 * elegir.
 */
export function distanciaAlRango({ variacionPct, minPct, maxPct } = {}) {
  const v = Number(variacionPct);
  if (!Number.isFinite(v)) return Infinity;
  const min = Number(minPct);
  const max = Number(maxPct);
  if (v < min) return min - v;
  if (v > max) return v - max;
  return 0;
}

/**
 * Una hipótesis es ABSURDA cuando cambia el orden de magnitud del costo.
 *
 * No es "cara" ni "barata": es que no puede ser el mismo producto. Un costo que
 * se triplica o que se reduce a un tercio no es un aumento de lista, es una
 * interpretación equivocada. Estas hipótesis se muestran y se explican, pero no
 * pueden ser la recomendada.
 */
export function esAbsurda(variacionPct) {
  const v = Number(variacionPct);
  if (!Number.isFinite(v)) return false;
  return v > 200 || v < -66;
}

/**
 * CUÁL DE LAS LECTURAS ES LA BUENA — la decide el RANGO.
 *
 *   · Exactamente una cae dentro del rango → es ésa, y el sistema no pregunta.
 *   · Ninguna cae dentro                   → REVISAR: se marca y no se aplica.
 *   · Más de una cae dentro                → AMBIGUA. Ver abajo: no puede pasar.
 *
 * ── QUÉ CAMBIÓ Y POR QUÉ ────────────────────────────────────────────────────
 *
 * Hasta el 2026-09-16 el criterio era otro y estaba escrito acá con estas
 * palabras: *"El porcentaje descarta lo imposible; NO elige entre lo posible. Un
 * 5 % contra un 12 % son las dos creíbles y ahí no se recomienda nada, aunque una
 * caiga dentro del rango y la otra no."*
 *
 * Eso es exactamente lo que Emanuel pidió que deje de pasar el 16/9: si leído por
 * unidad el aumento se va del rango y leído por pack queda adentro, es por pack,
 * sin preguntar. El filtro pasa de "no absurda" a "dentro del rango".
 *
 * `esAbsurda` NO se fue: sigue sirviendo para EXPLICARLE a la persona por qué una
 * lectura es ridícula, que es una cosa distinta de elegir. Y `distancia` sigue
 * ordenando.
 *
 * ── EL CASO "VARIAS" NO PUEDE OCURRIR, Y AUN ASÍ SE TRATA ───────────────────
 *
 * Dos lecturas de la misma fila son el mismo precio por multiplicadores enteros
 * distintos, así que una es la otra por un factor de 2 o más. Para que las dos
 * caigan en el rango haría falta que el cociente entre el tope y el piso del
 * rango sea mayor que ese factor: con 5 a 8 ese cociente es 1,029; con 0 a 10 es
 * 1,10; con 3 a 15 es 1,117. Ninguno llega a 2.
 *
 * O sea que AMBIGUA es una rama inalcanzable con cualquier rango razonable. No se
 * borra —un rango absurdo como 0 a 500 la alcanzaría— pero tampoco se la deja
 * decidir en silencio: devuelve AMBIGUA, que la fila trata como "revisar". Una
 * rama que nadie ejerce y que además decide costos es la que hay que dejar
 * gritando, no la que hay que suponer imposible.
 *
 * @param hipotesis  [{ clave, costoNuevo, ... }]
 * @returns { recomendada, resultado: "RECOMENDADA"|"AMBIGUA"|"REVISAR", evaluadas }
 */
export function recomendarHipotesis({ hipotesis = [], costoActual, minPct, maxPct } = {}) {
  const evaluadas = hipotesis.map((h) => {
    const c = clasificarVariacion({ costoActual, costoNuevo: h.costoNuevo, minPct, maxPct });
    return {
      ...h,
      ...c,
      distancia: distanciaAlRango({ variacionPct: c.variacionPct, minPct, maxPct }),
      absurda: esAbsurda(c.variacionPct),
    };
  });

  // Sin rango no hay contra qué comparar y no se recomienda nada. Las lecturas
  // igual se devuelven todas: no saber cuál es no es motivo para esconderlas.
  if (!rangoValido({ minPct, maxPct })) {
    return { recomendada: null, resultado: "REVISAR", evaluadas };
  }

  const enRango = evaluadas.filter((h) => h.estado === ESTADO_VARIACION.ESPERADO);

  if (enRango.length === 1) {
    return { recomendada: enRango[0].clave, resultado: "RECOMENDADA", evaluadas };
  }
  if (enRango.length === 0) {
    return { recomendada: null, resultado: "REVISAR", evaluadas };
  }
  return { recomendada: null, resultado: "AMBIGUA", evaluadas };
}

/**
 * La recomendación explicada, en una frase que se pueda leer sin saber nada del
 * modelo. Es lo que ve la persona antes de decidir.
 */
export function textoRecomendacion({ evaluadas = [], recomendada, resultado, baseTexto, money, pct } = {}) {
  const elegida = evaluadas.find((h) => h.clave === recomendada);
  const otras = evaluadas.filter((h) => h.clave !== recomendada);

  if (resultado === "REVISAR") {
    return "Ninguna interpretación da un costo creíble contra el que el producto tiene hoy. Puede ser que el producto vinculado no sea el correcto, o que el costo anterior esté mal. Revisalo antes de confirmar.";
  }
  if (resultado === "AMBIGUA" || !elegida) {
    return "Más de una interpretación da un resultado posible, así que el sistema no elige. Mirá los costos de cada una y decidí cuál corresponde.";
  }

  const partes = [`El proveedor cotiza ${baseTexto}.`];
  partes.push(
    elegida.multiplicador === 1
      ? `El producto del ERP es eso mismo, así que el costo propuesto es ${money(elegida.costoNuevo)}, ${pct(elegida.variacionPct)} sobre el costo actual.`
      : `El producto del ERP agrupa ${elegida.multiplicador}, así que el costo propuesto es ${money(elegida.costoNuevo)}, ${pct(elegida.variacionPct)} sobre el costo actual.`
  );
  const absurda = otras.find((h) => h.absurda);
  if (absurda) {
    partes.push(
      absurda.multiplicador === 1
        ? `Tomarlo como una unidad suelta dejaría el costo en ${money(absurda.costoNuevo)}, ${pct(absurda.variacionPct)}, que no puede ser.`
        : `Multiplicarlo por ${absurda.multiplicador} dejaría el costo en ${money(absurda.costoNuevo)}, ${pct(absurda.variacionPct)}, que no puede ser.`
    );
  }
  return partes.join(" ");
}

// ── EL COSTO CAE DENTRO DEL RANGO, Y ESO SE PREGUNTA EN UN SOLO LUGAR ───────
//
// ── EL DEFECTO QUE ESTO ATAJA ─────────────────────────────────────────────
//
// La pantalla de Emanuel decía "112 productos listos · Todos aumentan entre
// +2,6 % y +1.008,5 %" sobre un proveedor con rango 2 a 15. Reproducido: una
// fila que está en la cola porque NINGUNA lectura cae en rango se puede
// confirmar con cualquiera de ellas —`resultadoConfirmacion` solo veta la
// absurda cuando hay otra creíble— y queda LISTO_PARA_ACTUALIZAR. Después
// `clasificarLinea` no mira el rango, `revalidarFila` tampoco cuando la fila
// viene confirmada, y el costo de +1.008 % se habría escrito al aplicar.
//
// Medido: `revalidarFila` devolvía `aplicable: true` con costoNuevo 11.083,72
// sobre un costo de 1.000.
//
// Estas dos funciones son la pregunta que faltaba, y viven ACÁ —al lado de
// `clasificarVariacion`, que es quien sabe qué es estar en rango— para que el
// motor, la aplicación y la pantalla no tengan tres versiones del mismo
// criterio.

/**
 * ¿Este costo queda FUERA del rango esperado del proveedor?
 *
 * Sin rango cargado devuelve `false`: no se puede afirmar que algo esté afuera
 * de un criterio que no existe. Quien necesite el otro veredicto pregunta por
 * `rangoValido` aparte.
 *
 * Un costo que no se mueve NO está fuera de rango: no hay nada que escribir y
 * `clasificarVariacion` ya lo separa como SIN_AUMENTO.
 */
export function quedaFueraDelRango({ costoActual, costoNuevo, minPct, maxPct } = {}) {
  if (!rangoValido({ minPct, maxPct })) return false;
  const { estado } = clasificarVariacion({ costoActual, costoNuevo, minPct, maxPct });
  return (
    estado === ESTADO_VARIACION.AUMENTO_ALTO ||
    estado === ESTADO_VARIACION.AUMENTO_BAJO ||
    estado === ESTADO_VARIACION.DISMINUCION
  );
}

/**
 * ¿Una PERSONA eligió este costo SABIENDO que quedaba fuera del rango?
 *
 * Es lo único que habilita escribir un costo fuera del rango, y pide DOS cosas,
 * no una:
 *
 *   · que haya contestado cómo leer ese precio, con su multiplicador y su fecha,
 *     y que esa respuesta siga valiendo para el producto que la fila tiene HOY
 *     —una confirmación anterior a la última vinculación eligió una
 *     interpretación para otro producto—;
 *   · que además le hayan AVISADO que ese costo no cae en el rango y haya
 *     seguido igual, que es lo que registra `fueraDeRangoAceptadaEn`.
 *
 * ── POR QUÉ NO ALCANZA CON LA CONFIRMACIÓN SOLA ──────────────────────────
 *
 * Porque la pantalla vieja ofrecía la lectura absurda detrás de un botón que
 * decía únicamente "Usar $11.083,72", sin el porcentaje y sin ninguna
 * advertencia. Un toque y la fila quedaba confirmada. Tratar eso como "lo
 * eligió" es tomar por decisión lo que fue un botón mal escrito — y es
 * exactamente el camino por el que la importación #5 llegó a 112 listos con
 * aumentos de hasta +1.008 % sobre un rango de 2 a 15.
 *
 * El corolario práctico: las filas confirmadas ANTES de este arreglo tienen la
 * aceptación en NULL, así que dejan de contarse como listas y vuelven a la cola.
 * Eso no es perder trabajo: es volver a preguntar lo que nunca se preguntó bien.
 */
export function laEligioUnaPersona(fila) {
  if (confirmacionDeInterpretacionVigente(fila) !== true) return false;
  const aceptada = fila?.fueraDeRangoAceptadaEn;
  if (!aceptada) return false;
  // La aceptación tiene que ser de ESTA confirmación, no de una anterior: si
  // alguien cambió de lectura después de aceptar, la aceptación vieja no cubre
  // la nueva. Se compara contra la confirmación, que es la que eligió el costo.
  const confirmado = fila?.confirmadoEn;
  if (!confirmado) return false;
  return new Date(aceptada).getTime() >= new Date(confirmado).getTime();
}
