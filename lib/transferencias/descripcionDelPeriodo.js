// lib/transferencias/descripcionDelPeriodo.js
//
// CÓMO SE LLAMA EL PERÍODO QUE SE ESTÁ MIRANDO, Y CÓMO SE ROTULA SU IMPORTE.
//
// ── EL DEFECTO QUE ESTO CIERRA ────────────────────────────────────────────
//
// Hasta el 2026-09-14 la pantalla escribía "Semana cerrada" a mano, en el JSX,
// **aunque el chip estuviera en Mes**. O sea que con el chip en Mes el título
// decía una cosa y el rango de abajo decía otra. No era un rótulo impreciso: era
// falso, y sobre la pantalla que dice cuánta plata hay que cobrar.
//
// La causa es la de siempre: un texto escrito en el componente no puede saber de
// qué período es. Acá el título, el rango largo y el rótulo del importe salen
// TODOS del mismo lugar y de los mismos datos, así que no pueden contradecirse
// entre ellos.
//
// ── LA REGLA DEL ROTULO DEL IMPORTE, Y ES DE NEGOCIO ─────────────────────
//
// Si el período TERMINÓ, el número es una deuda cerrada: "Para cobrar".
// Si está EN CURSO, el número todavía va a crecer: "Va acumulado".
//
// No es una distinción de redacción. Mostrar "Para cobrar" sobre un período
// abierto es pedirle a alguien que cobre un número que mañana es otro, y ése es
// exactamente el defecto que abrió esta línea de trabajo el domingo 2026-09-13.
//
// ── POR QUÉ ESTE MÓDULO Y NO `periodoDePago` ────────────────────────────
//
// Aquél es aritmética de calendario y no sabe castellano: devuelve dos fechas.
// Esto es cómo se le habla al que mira. Separarlos deja que el primero siga sin
// tener ni un nombre de mes adentro, que es lo que lo hace fácil de probar.

import {
  UNIDADES,
  DIA_DE_CORTE_POR_DEFECTO,
  abreviaturaDelDia,
  nombreDelDia,
  periodoEnCurso,
  rangoDesplazado,
} from "./periodoDePago";

/**
 * Los doce, en minúscula.
 *
 * En minúscula porque el castellano los escribe así —"12 de septiembre"— y el
 * único lugar donde van con mayúscula es cuando abren el título ("Agosto").
 * Guardar la forma común y capitalizar en el borde es lo correcto; guardarlos
 * capitalizados obligaría a bajarlos en cuatro lugares y alguno se olvidaría.
 */
const MESES = Object.freeze([
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]);

/** "septiembre" → "Septiembre". Sin `toUpperCase()` del resto: no es un grito. */
function conMayuscula(texto) {
  const t = String(texto || "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const partes = (iso) => String(iso || "").split("-").map(Number);

/** El nombre del mes de una fecha ISO. */
export function mesDe(iso) {
  const [, m] = partes(iso);
  return MESES[m - 1] || "";
}

/**
 * Cuántos días hay entre dos fechas ISO, contando las dos puntas.
 *
 * Se calcula en UTC sobre fechas que ya son argentinas —el mismo criterio que
 * `periodoDePago`— así que no vuelve a pasar por un huso ya aplicado.
 */
export function diasEntre(desde, hasta) {
  if (!desde || !hasta) return 0;
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000) + 1;
}

/**
 * EL RANGO EN LARGO, que es el que va debajo del título.
 *
 * Distinto de `rotuloDelRango` —"06/09 al 12/09"—, que es el corto y sigue
 * sirviendo donde hay poco lugar. Éste se lee en voz alta:
 *
 *   · semana:      "dom 6 al sáb 12 de septiembre"
 *   · dos meses:   "dom 30 de agosto al sáb 5 de septiembre"
 *   · mes entero:  "1 al 31 de agosto"
 *   · un día:      "sábado 12 de septiembre"
 *
 * **El mes se escribe UNA sola vez cuando las dos puntas caen en el mismo**, y
 * dos veces cuando no. Sin eso, una semana a caballo de dos meses diría
 * "dom 30 al sáb 5 de septiembre", que nombra un 30 de septiembre que no existe
 * en ese rango. Es el caso que se paga una vez cada cuatro o cinco semanas.
 */
export function rangoEnLargo({ desde, hasta } = {}, { conDiaDeLaSemana = true } = {}) {
  if (!desde || !hasta) return "";
  const [, , d1] = partes(desde);
  const [, , d2] = partes(hasta);
  // En MINÚSCULA, y se baja acá y no en `abreviaturaDelDia`: esa puerta la usan
  // los chips de la pantalla de corte, donde "Dom" con mayúscula es lo correcto
  // porque es una etiqueta suelta. Acá va adentro de una frase.
  const dia = (iso) =>
    conDiaDeLaSemana ? `${abreviaturaDelDia(diaSemanaDe(iso)).toLowerCase()} ` : "";

  if (desde === hasta) {
    return `${nombreDelDia(diaSemanaDe(desde)).toLowerCase()} ${d1} de ${mesDe(desde)}`;
  }
  if (mesDe(desde) === mesDe(hasta) && partes(desde)[0] === partes(hasta)[0]) {
    return `${dia(desde)}${d1} al ${dia(hasta)}${d2} de ${mesDe(hasta)}`;
  }
  return `${dia(desde)}${d1} de ${mesDe(desde)} al ${dia(hasta)}${d2} de ${mesDe(hasta)}`;
}

/** El día de la semana (0 domingo) de una fecha ISO, en UTC sobre fecha argentina. */
function diaSemanaDe(iso) {
  const [a, m, d] = partes(iso);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * TODO LO QUE LA PANTALLA NECESITA DECIR DE UN PERÍODO, de una sola fuente.
 *
 * Devuelve `{ unidad, desplazamiento, rango, titulo, subtitulo, rotuloDelImporte,
 * enCurso }`.
 *
 * `hoy` entra por argumento y no se lee adentro: es lo que hace que los candados
 * puedan pararse en un sábado de septiembre sin esperar a que llegue.
 */
export function descripcionDelPeriodo({
  unidad = UNIDADES.SEMANA,
  diaDeCorte = DIA_DE_CORTE_POR_DEFECTO,
  hoy,
  desplazamiento = 0,
  rangoFijo = null,
} = {}) {
  // Con "Otro" el rango lo eligió una persona: no hay período que nombrar ni
  // desplazamiento que tenga sentido, así que se dice lo que se eligió y nada más.
  if (rangoFijo) {
    const abierto = periodoEnCurso(rangoFijo, hoy);
    return {
      unidad: "OTRO",
      desplazamiento: 0,
      rango: rangoFijo,
      titulo: "Período elegido",
      subtitulo: rangoEnLargo(rangoFijo),
      rotuloDelImporte: abierto ? ROTULO.ACUMULADO : ROTULO.COBRAR,
      enCurso: abierto,
    };
  }

  const rango = rangoDesplazado({ unidad, diaDeCorte, hoy, desplazamiento });
  const enCurso = periodoEnCurso(rango, hoy);

  if (unidad === UNIDADES.DIA) {
    // ── EL DÍA NO DICE "VA ACUMULADO" NI CUANDO ES HOY ────────────────────
    //
    // El título ya nombra el día exacto, así que agregarle "en curso" no informa
    // nada que no esté escrito arriba. Es la única unidad que rompe la simetría
    // y está decidido así en la especificación de la V41.
    return {
      unidad,
      desplazamiento,
      rango,
      titulo: conMayuscula(rangoEnLargo(rango)),
      subtitulo: "",
      rotuloDelImporte: ROTULO.DEL_DIA,
      enCurso,
    };
  }

  if (unidad === UNIDADES.MES) {
    const mes = conMayuscula(mesDe(rango.desde));
    const corrido = diasEntre(rango.desde, hoy || rango.hasta);
    return {
      unidad,
      desplazamiento,
      rango,
      titulo: enCurso ? `${mes} · en curso` : mes,
      subtitulo: enCurso
        ? `${rangoEnLargo(rango, { conDiaDeLaSemana: false })} · van ${corrido} ${corrido === 1 ? "día" : "días"}`
        : rangoEnLargo(rango, { conDiaDeLaSemana: false }),
      rotuloDelImporte: enCurso ? ROTULO.ACUMULADO : ROTULO.COBRAR,
      enCurso,
    };
  }

  return {
    unidad: UNIDADES.SEMANA,
    desplazamiento,
    rango,
    titulo: enCurso ? "Semana en curso" : "Semana cerrada",
    subtitulo: rangoEnLargo(rango),
    rotuloDelImporte: enCurso ? ROTULO.ACUMULADO : ROTULO.COBRAR,
    enCurso,
  };
}

/** Los tres rótulos del importe. Constantes para que el candado no los tipee. */
export const ROTULO = Object.freeze({
  COBRAR: "Para cobrar",
  ACUMULADO: "Va acumulado",
  DEL_DIA: "Del día",
});

/**
 * EL AVISO DE ABAJO, que sigue la misma lógica que el rótulo.
 *
 * Son dos motivos distintos por los que un total puede moverse, y decirlos con
 * la misma frase los confundiría:
 *
 *   · el período TERMINÓ pero quedan transferencias sin contar → el número puede
 *     cambiar cuando alguien las reciba;
 *   · el período SIGUE ABIERTO → el número va a cambiar sí o sí, porque todavía
 *     se le puede mandar mercadería.
 *
 * Con período abierto manda esa razón, aunque además haya pendientes: es la más
 * fuerte de las dos y la que explica por qué el importe de arriba dice "va
 * acumulado". Las pendientes se siguen contando en la misma frase.
 */
export function avisoDelPeriodo({ sinRecibir = 0, enCurso = false, unidad = UNIDADES.SEMANA } = {}) {
  const n = Number(sinRecibir || 0);
  const cuantas = `${n} sin recibir`;

  if (enCurso) {
    const cual = unidad === UNIDADES.MES ? "el mes" : unidad === UNIDADES.DIA ? "el día" : "la semana";
    return n > 0 ? `${cuantas} · ${cual} no terminó` : `${conMayuscula(cual)} todavía no terminó`;
  }
  if (n > 0) return `${cuantas} · el total no está cerrado`;
  return null;
}
