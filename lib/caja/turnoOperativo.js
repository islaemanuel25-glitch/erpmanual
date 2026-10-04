// lib/caja/turnoOperativo.js
//
// EL TURNO OPERATIVO DE UNA CAJA. Puro: sin base ni red.
//
// Un local tiene su CATÁLOGO de turnos —Mañana, Tarde, Noche, o los que use—,
// sin horas: no es una franja horaria. La caja recibe uno al abrirse, elegido
// por quien abre, y su fecha operativa la fija el servidor en ese momento, en
// día argentino. Ninguno de los dos se infiere por la hora ni se recalcula
// después: una caja que cruza la medianoche sigue siendo de su fecha y su
// turno.
//
// Tesorería agrupa y verifica el efectivo por (local, fecha operativa, turno
// operativo) de la caja. Las cajas anteriores a esto no tienen turno: van
// aparte, como "Sin turno asignado", y no se les asigna uno.

/** Tope del nombre: entra en una tarjeta de 360 px sin cortarse. */
export const LARGO_MAXIMO_NOMBRE_TURNO = 30;

/** Los rechazos de la apertura y del catálogo, con un código estable para la pantalla. */
export const CODIGO_TURNO_OPERATIVO = Object.freeze({
  REQUERIDO: "TURNO_OPERATIVO_REQUERIDO",
  NO_EXISTE: "TURNO_OPERATIVO_NO_EXISTE",
  DE_OTRO_LOCAL: "TURNO_OPERATIVO_DE_OTRO_LOCAL",
  INACTIVO: "TURNO_OPERATIVO_INACTIVO",
  SIN_TURNOS: "LOCAL_SIN_TURNOS_OPERATIVOS",
  FECHA_INVALIDA: "FECHA_OPERATIVA_INVALIDA",
  FECHA_DE_OTRO_DIA: "FECHA_OPERATIVA_DE_OTRO_DIA",
  NOMBRE_INVALIDO: "NOMBRE_DE_TURNO_INVALIDO",
  NOMBRE_REPETIDO: "NOMBRE_DE_TURNO_REPETIDO",
});

/** Lo que la pantalla dice de una caja sin turno: no se inventa uno. */
export const ROTULO_SIN_TURNO = "Sin turno asignado";

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * El nombre de un turno del catálogo, limpio, o el error.
 * @returns {{valido:true, nombre:string} | {valido:false, error:string}}
 */
export function validarNombreTurnoOperativo(nombre) {
  const limpio = String(nombre ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return { valido: false, error: "El turno necesita un nombre, por ejemplo «Mañana»." };
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

/**
 * La fecha operativa de una apertura. La fija el servidor: es el día argentino
 * de hoy. El cliente puede mandar la que cree —la de la pantalla que tiene
 * abierta— y, si no coincide, se rechaza: una pantalla de apertura cargada
 * ayer no abre una caja con la fecha de ayer ni con la de hoy sin avisar.
 *
 * @param {string|undefined|null} pedida  la del pedido, opcional
 * @param {string} hoy                   el día argentino del servidor
 * @returns {{valida:true, fecha:string} | {valida:false, codigo:string, error:string, status:number}}
 */
export function fechaOperativaDeApertura(pedida, hoy) {
  if (pedida == null || pedida === "") return { valida: true, fecha: hoy };
  if (typeof pedida !== "string" || !fechaOperativaParaGuardar(pedida)) {
    return { valida: false, codigo: CODIGO_TURNO_OPERATIVO.FECHA_INVALIDA, error: "La fecha operativa no es una fecha válida.", status: 400 };
  }
  if (pedida !== hoy) {
    return {
      valida: false,
      codigo: CODIGO_TURNO_OPERATIVO.FECHA_DE_OTRO_DIA,
      error: `La pantalla de apertura es del ${pedida} y hoy es ${hoy}. Volvé a cargarla y elegí el turno de nuevo.`,
      status: 409,
    };
  }
  return { valida: true, fecha: hoy };
}

/**
 * ¿Se puede abrir una caja con este turno del catálogo, en este local?
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
