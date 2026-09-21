// LA LECTURA NO ESPERA ADENTRO DEL PEDIDO HTTP.
//
// ── QUÉ PASÓ, MEDIDO ──────────────────────────────────────────────────────
//
// El 2026-09-21 a las 20:16 Emanuel tocó "Probar" en la receta de Paty y la
// pantalla dijo "El servidor contestó 504". Lo que hay delante de la aplicación
// son dos saltos —Cloudflare y nginx— y **nginx no declara
// `proxy_read_timeout`, así que rige su default: 60 segundos**. Pasado ese
// minuto sin respuesta, el que contesta es el proxy, con un 504 y una página
// que ni siquiera es JSON.
//
// La aplicación estaba construida para no llegar nunca ahí: el corte propio de
// la lectura son 45 segundos y está elegido explícitamente "por debajo de los
// 60 de nginx". Lo que esa cuenta no contempla es que 45 es el techo de UNA
// espera y el pedido tiene más cosas adentro, así que el margen real es de 15
// segundos para todo lo demás. Medido esa noche, el contador de llamadas
// registró dos `TARDO_DEMASIADO` seguidos: la lectura sí se fue al techo.
//
// ── POR QUÉ NO SE ARREGLA BAJANDO EL CORTE ────────────────────────────────
//
// Porque bajar el corte cambia un error por otro: la persona seguiría viendo
// que no se pudo, solo que antes. Y porque el número correcto no existe — hoy
// el proxy corta a los 60 s, mañana alguien lo cambia, y la aplicación no tiene
// forma de enterarse. Atar el éxito de una lectura a un timeout que vive en
// otro archivo, en otra máquina y en otro equipo es la forma de que esto vuelva.
//
// ── LO QUE SE HACE ────────────────────────────────────────────────────────
//
// La lectura arranca y el pedido CONTESTA ENSEGUIDA con un número de turno. La
// pantalla pregunta por ese turno cada dos segundos mientras muestra "Leyendo
// el papel… puede tardar hasta un minuto". Ningún pedido HTTP dura más de lo
// que tarda una consulta a la base, así que ningún proxy puede cortarlo — ni
// éste, ni el que venga, ni con el timeout que le pongan.
//
// ── LO QUE ESTO NO ES ─────────────────────────────────────────────────────
//
// No es una cola de trabajos ni hace falta que lo sea. Es un registro EN
// MEMORIA del proceso que atiende, con dos consecuencias que hay que saber:
//
//   · si el contenedor se recrea en el medio, el turno se pierde y la pantalla
//     lo dice —"se reinició el sistema mientras leía"— en vez de quedarse
//     girando para siempre;
//   · si algún día hubiera más de un contenedor atendiendo, la pregunta por el
//     turno podría caer en el que no lo tiene. Hoy hay UNO solo
//     (`docker compose up --no-deps app` recrea ese uno), y cuando deje de ser
//     así esto necesita una tabla, no un Map. Queda dicho acá y no en la cabeza
//     de nadie.
//
// Módulo puro: sin React, sin Prisma y sin red. Lo que corre lo pone quien llama.

/** Cuánto vive un turno terminado antes de borrarse. */
export const VIDA_DEL_TURNO_MS = 10 * 60 * 1000;

export const ESTADO_TURNO = Object.freeze({
  LEYENDO: "LEYENDO",
  LISTO: "LISTO",
  FALLO: "FALLO",
  /** No existe: o nunca existió, o se venció, o se reinició el sistema. */
  NO_ESTA: "NO_ESTA",
});

/**
 * El texto de cada estado, en castellano y sin códigos.
 *
 * Vive acá y no en la pantalla porque la regla del módulo es que los mensajes
 * salen de un catálogo con su candado — el día que producción se cayó, lo único
 * que se vio fue "Error interno" porque el texto estaba escrito en un `catch`.
 */
export const TEXTO_TURNO = Object.freeze({
  [ESTADO_TURNO.LEYENDO]: "Leyendo el papel… puede tardar hasta un minuto.",
  [ESTADO_TURNO.NO_ESTA]:
    "Se reinició el sistema mientras leía el papel. Tocá «Probar» de nuevo: no se guardó nada.",
});

const turnos = new Map();

/** Reloj inyectable: los candados no esperan diez minutos de verdad. */
let ahora = () => Date.now();
export function relojDeTurnos(fn) {
  ahora = typeof fn === "function" ? fn : () => Date.now();
}

function limpiarVencidos() {
  const t = ahora();
  for (const [id, turno] of turnos) {
    if (turno.estado !== ESTADO_TURNO.LEYENDO && t - turno.terminadoEn > VIDA_DEL_TURNO_MS) {
      turnos.delete(id);
    }
  }
}

/**
 * Arranca un trabajo y devuelve su número de turno, SIN esperarlo.
 *
 * @param id       con qué nombre se lo va a buscar después
 * @param trabajo  () => Promise. Lo que devuelva queda como resultado.
 * @param dueño    quién lo pidió. Preguntar por un turno ajeno es como
 *                 preguntar por uno que no existe.
 */
export function arrancarTurno({ id, trabajo, dueño = null }) {
  limpiarVencidos();
  const turno = {
    id,
    dueño,
    estado: ESTADO_TURNO.LEYENDO,
    arrancadoEn: ahora(),
    terminadoEn: null,
    resultado: null,
    error: null,
  };
  turnos.set(id, turno);

  // ── EL `catch` NO ES OPCIONAL ───────────────────────────────────────────
  //
  // Nadie está esperando esta promesa, así que una excepción no tiene a dónde
  // caer: sin esto sería un rechazo sin manejar, que en Node puede tumbar el
  // proceso. Y el proceso es el que atiende a los cinco locales.
  Promise.resolve()
    .then(trabajo)
    .then((resultado) => {
      turno.estado = ESTADO_TURNO.LISTO;
      turno.resultado = resultado;
      turno.terminadoEn = ahora();
    })
    .catch((e) => {
      turno.estado = ESTADO_TURNO.FALLO;
      turno.error = e?.message ?? String(e);
      turno.terminadoEn = ahora();
    });

  return id;
}

/** Cómo va un turno. `NO_ESTA` si no existe o si es de otra persona. */
export function mirarTurno(id, { dueño = null } = {}) {
  limpiarVencidos();
  const turno = turnos.get(id);
  if (!turno) return { estado: ESTADO_TURNO.NO_ESTA, texto: TEXTO_TURNO[ESTADO_TURNO.NO_ESTA] };
  if (dueño != null && turno.dueño != null && turno.dueño !== dueño) {
    return { estado: ESTADO_TURNO.NO_ESTA, texto: TEXTO_TURNO[ESTADO_TURNO.NO_ESTA] };
  }
  if (turno.estado === ESTADO_TURNO.LEYENDO) {
    return {
      estado: ESTADO_TURNO.LEYENDO,
      texto: TEXTO_TURNO[ESTADO_TURNO.LEYENDO],
      esperandoMs: ahora() - turno.arrancadoEn,
    };
  }
  return {
    estado: turno.estado,
    resultado: turno.resultado,
    error: turno.error,
    tardoMs: turno.terminadoEn - turno.arrancadoEn,
  };
}

/** Se lo saca cuando la pantalla ya lo leyó: no hace falta que siga ocupando. */
export function olvidarTurno(id) {
  turnos.delete(id);
}

/** Solo para los candados: deja el registro como recién arrancado. */
export function vaciarTurnos() {
  turnos.clear();
}

/** Cuántos turnos hay vivos. Para medir, no para decidir. */
export function cuantosTurnos() {
  return turnos.size;
}
