// lib/caja/turnoOperativo.js
//
// EL TURNO OPERATIVO DE UNA CAJA. Puro: sin base ni red.
//
// Cada local tiene su CATÁLOGO de turnos: los nombres, cuántos son, su orden y
// su ventana de reconocimiento los configura el local. Este archivo no conoce
// ningún nombre ni ningún horario: todo sale de la fila del catálogo.
//
// EL CICLO. Los turnos ACTIVOS, en su `orden`, forman un ciclo: después del
// último viene el primero. Cada turno ocurre una vez por fecha operativa, y la
// ocurrencia de un turno EMPIEZA en el inicio de su ventana de reconocimiento
// (`horaInicioReconocimiento` → `horaFinReconocimiento`, "HH:MM"). La ventana
// no es la duración del turno: es dónde cae su comienzo en el día. Su fecha
// operativa sale de esa geometría: una ventana que cruza la medianoche (inicio
// mayor que fin) empieza el día ANTERIOR a su jornada.
//
// En un momento dado (`cicloDeTurnos`) se puede abrir:
//
//   · la ocurrencia ACTUAL: la que empezó más recientemente —un turno que se
//     extiende más allá de su ventana sigue siendo el actual hasta que empieza
//     otro— y las que están dentro de su ventana;
//   · la ocurrencia SIGUIENTE inmediata: la del turno que sigue a la actual en
//     el `orden`, en su próximo comienzo.
//
// Nada más: un turno que ya pasó y cuya próxima ocurrencia exige atravesar
// otro no se ofrece y el servidor lo rechaza. Sin distancias, sin umbrales,
// sin nombres: el orden y las ventanas que configuró el local.
//
// La ventana además PROPONE: si exactamente una contiene la hora, la apertura
// arranca con ese turno y se puede cambiar; con ninguna o varias, se pregunta.
// Se guarda el turno FINAL con la fecha de SU ocurrencia. La fija el servidor al
// abrir y no se recalcula: Tesorería agrupa por (local, fecha operativa, turno
// operativo) de la caja, sin volver a mirar la hora.
//
// UN SOLO TURNO (o varios que empiezan a la misma hora): no hay un "siguiente"
// distinto; la ocurrencia actual se extiende hasta su próximo comienzo.
//
// UN TURNO ACTIVO TIENE VENTANA, siempre: sin ella el ciclo no puede ubicar su
// ocurrencia. Lo exigen el alta, la edición y la activación
// (`rechazoPorFaltaDeHorario`) y lo sostiene la base con un CHECK. Uno inactivo
// puede no tenerla. La ventana ubica y reconoce; NO obliga a cerrar la caja:
// un turno sigue siendo el actual hasta que empieza otro.
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
  /** Activo y del local, pero a esta hora no es ni el actual ni el siguiente. */
  FUERA_DE_CICLO: "TURNO_OPERATIVO_FUERA_DE_CICLO",
  /** Un turno activo sin las dos horas de su ventana: no se guarda. */
  HORARIO_REQUERIDO: "TURNO_OPERATIVO_HORARIO_REQUERIDO",
});

/** Qué ocurrencia de su turno es una opción de apertura. */
export const OCURRENCIA = Object.freeze({ ACTUAL: "ACTUAL", SIGUIENTE: "SIGUIENTE" });

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

/**
 * UN TURNO ACTIVO TIENE HORARIO. Recibe el turno como QUEDARÍA guardado —lo
 * que ya tenía más lo que cambia el pedido— y dice si se puede guardar. Así
 * el mismo control cubre el alta, la activación y el borrado del horario: para
 * dejar un turno sin horario hay que desactivarlo, antes o en el mismo pedido.
 * Nunca se lo desactiva solo.
 *
 * @returns {null | {codigo:string, error:string, status:number}}
 */
export function rechazoPorFaltaDeHorario({ activo, horaInicioReconocimiento, horaFinReconocimiento }) {
  if (activo === false) return null;
  if (horaInicioReconocimiento != null && horaFinReconocimiento != null) return null;
  return {
    codigo: CODIGO_TURNO_OPERATIVO.HORARIO_REQUERIDO,
    error: "Un turno activo necesita horario de reconocimiento, desde y hasta. Para dejarlo sin horario, desactivalo.",
    status: 400,
  };
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

/** x módulo un día, siempre entre 0 y el día menos un minuto. */
const enElDia = (x) => ((x % MINUTOS_DEL_DIA) + MINUTOS_DEL_DIA) % MINUTOS_DEL_DIA;

/**
 * La fecha operativa de una ocurrencia que empieza en `inicio`, contado en
 * minutos desde las 00:00 de `fecha` (negativo: un día anterior). Una ventana
 * que cruza la medianoche empieza el día anterior a su jornada.
 */
function fechaDeOcurrencia(v, fecha, inicio) {
  const dia = sumarDias(fecha, Math.floor(inicio / MINUTOS_DEL_DIA));
  return v.inicio > v.fin ? sumarDias(dia, 1) : dia;
}

/**
 * El catálogo en el orden del ciclo: `orden`, y el id para desempatar. Entran
 * los activos, que tienen ventana siempre —la base no deja guardar uno sin
 * ella—; una fila que llegara sin ventana no se puede ubicar y no entra.
 */
function enOrdenDeCiclo(turnos) {
  return (turnos || [])
    .filter((t) => t && t.activo !== false && ventanaDe(t))
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id - b.id);
}

const NADIE_PROPUESTO = Object.freeze({ estado: RECONOCIMIENTO.NINGUNO, sugeridoId: null, candidatosIds: [] });

/**
 * QUÉ SE PUEDE ABRIR EN ESTE MOMENTO, y con qué fecha operativa.
 *
 * @param {Array<{id:number, nombre:string, orden:number, activo:boolean,
 *   horaInicioReconocimiento:string|null, horaFinReconocimiento:string|null}>} turnos  el catálogo del local
 * @param {{fecha:string, minuto:number}} momento  el de `momentoArgentina()`
 * @returns {{
 *   opciones: Array<{id:number, nombre:string, fechaOperativa:string, ocurrencia:string}>,
 *   reconocimiento: {estado:string, sugeridoId:number|null, candidatosIds:number[]},
 * }}
 */
export function cicloDeTurnos(turnos, { fecha, minuto }) {
  const activos = enOrdenDeCiclo(turnos);
  if (!activos.length) return { opciones: [], reconocimiento: NADIE_PROPUESTO };

  // Cuánto hace que empezó la ocurrencia más reciente de cada turno: el inicio
  // de su ventana, hoy o el día anterior.
  const datos = activos.map((t, i) => {
    const v = ventanaDe(t);
    const transcurrido = enElDia(minuto - v.inicio);
    return { t, i, v, inicio: minuto - transcurrido, enVentana: enVentanaDeReconocimiento(t, minuto) };
  });

  // La ocurrencia ACTUAL: la que empezó última —aunque ya se haya pasado de su
  // ventana: un turno se extiende hasta que empieza otro, y si es el único,
  // hasta su próximo comienzo— y las que están dentro de su ventana.
  const masReciente = Math.max(...datos.map((d) => d.inicio));
  const ultimos = datos.filter((d) => d.inicio === masReciente);
  const opciones = new Map();
  for (const d of datos) {
    if (d.inicio === masReciente || d.enVentana) {
      opciones.set(d.t.id, { d, fechaOperativa: fechaDeOcurrencia(d.v, fecha, d.inicio), ocurrencia: OCURRENCIA.ACTUAL });
    }
  }
  // La SIGUIENTE: el turno que sigue en el orden, en su primer comienzo
  // después del de la actual.
  for (const d of ultimos) {
    const s = datos[(d.i + 1) % datos.length];
    if (opciones.has(s.t.id)) continue;
    let comienzo = masReciente + enElDia(s.v.inicio - masReciente);
    if (comienzo === masReciente) comienzo += MINUTOS_DEL_DIA;
    opciones.set(s.t.id, { d: s, fechaOperativa: fechaDeOcurrencia(s.v, fecha, comienzo), ocurrencia: OCURRENCIA.SIGUIENTE });
  }

  return {
    opciones: [...opciones.values()]
      .sort((a, b) => a.d.i - b.d.i)
      .map(({ d, fechaOperativa, ocurrencia }) => ({ id: d.t.id, nombre: d.t.nombre, fechaOperativa, ocurrencia })),
    reconocimiento: reconocerTurno(activos, minuto),
  };
}

/**
 * La ocurrencia con que se abre el turno FINAL que eligió la persona: tiene
 * que ser una de las opciones del momento. Lo valida el servidor, que no
 * confía en lo que la pantalla haya ofrecido.
 *
 * @returns {{valido:true, fechaOperativa:string} | {valido:false, codigo:string, error:string, status:number}}
 */
export function ocurrenciaDeApertura(turnos, turnoId, momento) {
  const ciclo = cicloDeTurnos(turnos, momento);
  const opcion = ciclo.opciones.find((o) => o.id === turnoId);
  if (!opcion) {
    const elegido = (turnos || []).find((t) => t.id === turnoId);
    const posibles = ciclo.opciones.map((o) => `«${o.nombre}»`).join(" o ");
    return {
      valido: false,
      codigo: CODIGO_TURNO_OPERATIVO.FUERA_DE_CICLO,
      error: `A esta hora no se puede abrir «${elegido?.nombre ?? turnoId}»: su turno ya pasó y el próximo todavía no es el que sigue. Se puede abrir ${posibles}.`,
      status: 409,
    };
  }
  return { valido: true, fechaOperativa: opcion.fechaOperativa };
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
  if (!v) return "Sin horario: no se puede activar hasta cargarle uno.";
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
 * ¿El turno es de este local y está activo? Lo primero que se mira al abrir;
 * si es posible A ESTA HORA lo dice después `ocurrenciaDeApertura`.
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
