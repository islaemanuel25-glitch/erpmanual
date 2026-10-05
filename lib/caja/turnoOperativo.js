// lib/caja/turnoOperativo.js
//
// EL TURNO OPERATIVO DE UNA CAJA. Puro: sin base ni red.
//
// Cada local tiene su CATÁLOGO de turnos: los nombres, cuántos son, su orden y
// su ventana de reconocimiento los configura el local. Este archivo no conoce
// ningún nombre ni ningún horario: todo sale de la fila del catálogo.
//
// LA VENTANA DE RECONOCIMIENTO (`horaInicioReconocimiento` →
// `horaFinReconocimiento`, "HH:MM", opcional) NO ES LA DURACIÓN DEL TURNO. Solo
// sirve para que la apertura PROPONGA el turno que probablemente se abre:
//
//   · una sola ventana activa contiene la hora → se propone ese turno, y quien
//     abre lo puede cambiar;
//   · ninguna, o más de una → no se elige nada: se pregunta.
//
// La ventana no prohíbe: se puede abrir con cualquier turno ACTIVO del local,
// esté o no en su ventana. El turno FINAL elegido es el dato que se guarda.
//
// LA FECHA OPERATIVA es la de la JORNADA del turno final, y la decide la
// geometría de su ventana (`fechaOperativaDeTurno`). La fija el servidor al
// abrir y no se recalcula: Tesorería agrupa por (local, fecha operativa, turno
// operativo) de la caja, sin volver a mirar la hora.
//
// Las cajas anteriores a esto no tienen turno: van aparte, como "Sin turno
// asignado", y no se les asigna uno.

/** Tope del nombre: entra en una tarjeta de 360 px sin cortarse. */
export const LARGO_MAXIMO_NOMBRE_TURNO = 30;

/** Los rechazos de la apertura y del catálogo, con un código estable para la pantalla. */
export const CODIGO_TURNO_OPERATIVO = Object.freeze({
  REQUERIDO: "TURNO_OPERATIVO_REQUERIDO",
  NO_EXISTE: "TURNO_OPERATIVO_NO_EXISTE",
  DE_OTRO_LOCAL: "TURNO_OPERATIVO_DE_OTRO_LOCAL",
  INACTIVO: "TURNO_OPERATIVO_INACTIVO",
  SIN_TURNOS: "LOCAL_SIN_TURNOS_OPERATIVOS",
  NOMBRE_INVALIDO: "NOMBRE_DE_TURNO_INVALIDO",
  NOMBRE_REPETIDO: "NOMBRE_DE_TURNO_REPETIDO",
  RANGO_INVALIDO: "RANGO_DE_RECONOCIMIENTO_INVALIDO",
});

/** Cómo terminó el reconocimiento por la hora. */
export const RECONOCIMIENTO = Object.freeze({
  /** Exactamente una ventana activa contiene la hora: se propone ese turno. */
  UNICO: "UNICO",
  /** Ninguna ventana activa la contiene: se pregunta. */
  NINGUNO: "NINGUNO",
  /** Más de una: es ambiguo y se pregunta, sin elegir ninguna. */
  VARIOS: "VARIOS",
});

/** Lo que la pantalla dice de una caja sin turno: no se inventa uno. */
export const ROTULO_SIN_TURNO = "Sin turno asignado";

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTOS_DEL_DIA = 24 * 60;

/**
 * El nombre de un turno del catálogo, limpio, o el error.
 * @returns {{valido:true, nombre:string} | {valido:false, error:string}}
 */
export function validarNombreTurnoOperativo(nombre) {
  const limpio = String(nombre ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return { valido: false, error: "El turno necesita un nombre." };
  if (limpio.length > LARGO_MAXIMO_NOMBRE_TURNO) {
    return { valido: false, error: `El nombre del turno no puede pasar de ${LARGO_MAXIMO_NOMBRE_TURNO} letras.` };
  }
  return { valido: true, nombre: limpio };
}

/** Un id de turno como llega en un pedido, o null si no es un entero positivo. */
export function idDeTurnoOperativo(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** "HH:MM" → minutos desde las 00:00, o null si no es una hora válida. */
export function minutosDeHora(hora) {
  const m = typeof hora === "string" ? HORA.exec(hora) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * La ventana de reconocimiento de un turno, como llega de la configuración.
 * Solo integridad: las dos horas o ninguna, en "HH:MM", y distintas entre sí
 * (inicio = fin no dice si la ventana está vacía o es el día entero). Dos
 * turnos con ventanas que se SOLAPAN se aceptan: la ambigüedad se resuelve al
 * abrir, preguntando.
 *
 * @returns {{valido:true, rango:{horaInicioReconocimiento:string|null, horaFinReconocimiento:string|null}}
 *         | {valido:false, error:string}}
 */
export function validarRangoReconocimiento(inicio, fin) {
  const vacio = (v) => v == null || (typeof v === "string" && v.trim() === "");
  if (vacio(inicio) && vacio(fin)) {
    return { valido: true, rango: { horaInicioReconocimiento: null, horaFinReconocimiento: null } };
  }
  if (vacio(inicio) || vacio(fin)) {
    return { valido: false, error: "La ventana de reconocimiento lleva las dos horas, desde y hasta, o ninguna." };
  }
  const a = String(inicio).trim();
  const b = String(fin).trim();
  if (minutosDeHora(a) == null || minutosDeHora(b) == null) {
    return { valido: false, error: "Las horas de la ventana van como HH:MM, de 00:00 a 23:59." };
  }
  if (a === b) {
    return { valido: false, error: "La ventana no puede empezar y terminar a la misma hora." };
  }
  return { valido: true, rango: { horaInicioReconocimiento: a, horaFinReconocimiento: b } };
}

/** La ventana de un turno en minutos, o null si no tiene. */
function ventanaDe(turno) {
  const inicio = minutosDeHora(turno?.horaInicioReconocimiento);
  const fin = minutosDeHora(turno?.horaFinReconocimiento);
  return inicio == null || fin == null || inicio === fin ? null : { inicio, fin };
}

/** ¿La ventana del turno cruza la medianoche? (inicio > fin) */
export function cruzaMedianoche(turno) {
  const v = ventanaDe(turno);
  return Boolean(v && v.inicio > v.fin);
}

/**
 * ¿La hora (minutos desde las 00:00) cae en la ventana del turno? La ventana
 * incluye su inicio y NO su fin, para que dos ventanas pegadas —una que
 * termina donde empieza la otra— no coincidan las dos en el borde.
 */
export function enVentanaDeReconocimiento(turno, minuto) {
  const v = ventanaDe(turno);
  if (!v || !Number.isInteger(minuto)) return false;
  return v.inicio < v.fin ? minuto >= v.inicio && minuto < v.fin : minuto >= v.inicio || minuto < v.fin;
}

/**
 * Qué turno propone la apertura a esta hora, entre los ACTIVOS del local.
 * Nunca elige por cercanía ni por orden: una coincidencia se propone, cero o
 * varias se preguntan.
 *
 * @param {Array<{id:number, activo:boolean, horaInicioReconocimiento?:string|null, horaFinReconocimiento?:string|null}>} turnos
 * @param {number} minuto  minutos desde las 00:00, hora del local
 * @returns {{estado:string, sugeridoId:number|null, candidatosIds:number[]}}
 */
export function reconocerTurno(turnos, minuto) {
  const candidatosIds = (turnos || [])
    .filter((t) => t && t.activo !== false && enVentanaDeReconocimiento(t, minuto))
    .map((t) => t.id);
  if (candidatosIds.length === 1) return { estado: RECONOCIMIENTO.UNICO, sugeridoId: candidatosIds[0], candidatosIds };
  return {
    estado: candidatosIds.length ? RECONOCIMIENTO.VARIOS : RECONOCIMIENTO.NINGUNO,
    sugeridoId: null,
    candidatosIds,
  };
}

/** "2026-10-04" + n días, en calendario, sin zonas. */
export function sumarDias(iso, n) {
  const d = fechaOperativaParaGuardar(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * LA FECHA OPERATIVA de una caja que se abre con este turno, en este momento.
 * Sale del turno FINAL —no del sugerido— y de la geometría de su ventana:
 *
 *   · ventana normal (inicio < fin), o sin ventana → el día de hoy;
 *   · ventana que cruza la medianoche (inicio > fin) → reconoce UNA jornada
 *     alrededor de las 00:00, que es la del día que empieza a esa medianoche:
 *     lo que está antes de las 00:00 es del día SIGUIENTE y lo que está
 *     después, del día de hoy. Con 23:00 → 01:00, el domingo 23:30 y el lunes
 *     00:30 son, los dos, del lunes.
 *
 * Fuera de su ventana —el turno se puede elegir igual— se toma la mitad del
 * día más cercana: si la hora está más cerca del INICIO de la ventana (entra
 * antes), es la jornada que viene; si está más cerca del FIN (sale tarde), la
 * que pasó. Es la misma jornada que le tocaría si hubiera abierto adentro.
 *
 * @param {object} turno  la fila del catálogo
 * @param {{fecha:string, minuto:number}} momento  el de `momentoArgentina()`
 * @returns {string} "YYYY-MM-DD"
 */
export function fechaOperativaDeTurno(turno, { fecha, minuto }) {
  const v = ventanaDe(turno);
  if (!v || v.inicio < v.fin) return fecha;
  if (enVentanaDeReconocimiento(turno, minuto)) {
    return minuto >= v.inicio ? sumarDias(fecha, 1) : fecha;
  }
  // Fuera de la ventana: el hueco va de `fin` a `inicio`, dentro del mismo día.
  const mitad = (v.fin + v.inicio) / 2;
  return minuto >= mitad ? sumarDias(fecha, 1) : fecha;
}

/** "2026-10-04" → la fecha que Prisma guarda en una columna DATE. */
export function fechaOperativaParaGuardar(iso) {
  if (typeof iso !== "string" || !DIA_ISO.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : d;
}

/**
 * La fecha operativa como "YYYY-MM-DD". La columna es DATE: Prisma la devuelve
 * como medianoche UTC, así que se lee en UTC y no en la zona del que mira.
 */
export function fechaOperativaISO(valor) {
  if (valor == null) return null;
  if (typeof valor === "string") return DIA_ISO.test(valor.slice(0, 10)) ? valor.slice(0, 10) : null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Qué hace la ventana de un turno, en una línea para la configuración. */
export function descripcionDeVentana(turno) {
  const v = ventanaDe(turno);
  if (!v) return "Sin horario: no se propone solo; se elige al abrir.";
  const desde = turno.horaInicioReconocimiento;
  const hasta = turno.horaFinReconocimiento;
  return v.inicio < v.fin
    ? `Se propone al abrir entre las ${desde} y las ${hasta}.`
    : `Se propone al abrir entre las ${desde} y las ${hasta}. Cruza la medianoche: lo abierto antes de las 00:00 es de la jornada del día siguiente.`;
}

/** Minutos desde las 00:00 → "HH:MM". */
export function horaDeMinutos(minuto) {
  if (!Number.isInteger(minuto) || minuto < 0 || minuto >= MINUTOS_DEL_DIA) return null;
  return `${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`;
}

/**
 * ¿Se puede abrir una caja con este turno del catálogo, en este local? La
 * ventana de reconocimiento NO entra acá: elegir un turno fuera de su ventana
 * es válido.
 *
 * @param {{id:number, localId:number, activo:boolean}|null} turno  la fila, o null si no existe
 * @returns {{valido:true} | {valido:false, codigo:string, error:string, status:number}}
 */
export function turnoValidoParaAbrir(turno, localId) {
  if (!turno) {
    return { valido: false, codigo: CODIGO_TURNO_OPERATIVO.NO_EXISTE, error: "Ese turno operativo no existe.", status: 400 };
  }
  if (turno.localId !== localId) {
    return {
      valido: false,
      codigo: CODIGO_TURNO_OPERATIVO.DE_OTRO_LOCAL,
      error: "Ese turno operativo es de otro local: elegí uno de este local.",
      status: 400,
    };
  }
  if (!turno.activo) {
    return {
      valido: false,
      codigo: CODIGO_TURNO_OPERATIVO.INACTIVO,
      error: "Ese turno operativo está desactivado en este local: elegí uno activo.",
      status: 400,
    };
  }
  return { valido: true };
}
