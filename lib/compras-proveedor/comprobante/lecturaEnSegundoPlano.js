// LA LECTURA EN CURSO VIVE EN LA BASE, NO EN LA MEMORIA DEL PROCESO.
//
// ── LO QUE YA ESTABA, Y LO QUE FALTABA ────────────────────────────────────
//
// Desde el 2026-09-21 la lectura corre aparte del pedido HTTP: la ruta arranca
// un turno y contesta enseguida (`lecturasEnCurso.js`). Lo que quedó en la
// memoria del proceso es el ESTADO de ese turno, y de ahí salían tres agujeros:
//
//   · dos «Leer» seguidos lanzaban dos lecturas, y cada una gasta Flash y
//     quizás el modelo grande;
//   · un reinicio —un deploy— perdía el turno, y la lectura quedaba sin
//     resultado ni explicación;
//   · volver a la pantalla no sabía que el papel se estaba leyendo.
//
// Ahora la lectura se TOMA en la base —`lecturaEnCursoDesde`— con un UPDATE
// que solo pasa si nadie la tiene, y lo que contesta queda en `ultimaLectura`.
// El trabajo sigue corriendo con `arrancarTurno`, que es el mecanismo que ya
// había: lo que cambia es dónde se guarda el estado.
//
// ── NUNCA COLGADA PARA SIEMPRE ────────────────────────────────────────────
//
// Dos redes, y las dos hacen falta:
//
//   1. AL ARRANCAR, toda lectura que figure en curso se marca cortada: el
//      proceso que la corría ya no existe. Hoy hay UN solo contenedor; si algún
//      día hay más, esto cortaría las de los otros y tiene que pasar a mirar
//      quién la tomó.
//   2. AL MIRARLA, una que lleva más de `VENCE_LECTURA_MS` se da por cortada,
//      por si el arranque no corrió.
//
// Las funciones reciben el cliente de Prisma por parámetro y el reloj se
// inyecta: los candados las ejercen contra la base sin esperar diez minutos.

import { Prisma } from "@prisma/client";
import { ESTADO_TURNO, TEXTO_TURNO } from "./lector/lecturasEnCurso.js";

/**
 * Cuánto puede durar una lectura antes de darla por cortada.
 *
 * La más larga posible es Flash, el modelo grande y su respaldo en serie, cada
 * uno con su espera: ver `ESPERA_MAX_MS` y `ESPERA_PRO_MS` en `gemini.js`. Diez
 * minutos la cubren con margen y no dejan a nadie mirando un "leyendo" eterno.
 */
export const VENCE_LECTURA_MS = 10 * 60 * 1000;

/**
 * Lo que dice «Leer» mientras lee. Lo de cerrar la pantalla es verdad ACÁ y no
 * en «Probar»: esta lectura guarda su resultado en la base; la de probar no
 * escribe nada.
 */
export const TEXTO_LEYENDO_EN_SEGUNDO_PLANO = `${TEXTO_TURNO[ESTADO_TURNO.LEYENDO]} Si cerrás la pantalla, sigue leyendo.`;

/** Lo que se le dice a la persona cuando la lectura se cortó sin terminar. */
export const TEXTO_LECTURA_CORTADA =
  "La lectura se cortó porque el sistema se reinició mientras leía. La foto está guardada: " +
  "tocá «Leer» de nuevo.";

export const MOTIVO_LECTURA_CORTADA = "LECTURA_INTERRUMPIDA";

/** La respuesta guardada de una lectura que no terminó. Con la forma de las demás. */
export function respuestaDeLaCortada() {
  return {
    status: 503,
    cuerpo: {
      ok: false,
      motivo: MOTIVO_LECTURA_CORTADA,
      error: TEXTO_LECTURA_CORTADA,
      queHacer: TEXTO_LECTURA_CORTADA,
      reintentaSola: false,
    },
  };
}

/**
 * ¿CÓMO ESTÁ LA LECTURA DE ESTE COMPROBANTE? Función pura sobre la fila.
 *
 * @returns `{ estado: "LEYENDO", esperandoMs }`, `{ estado: "VENCIDA" }`,
 *          `{ estado: "TERMINADA", respuesta }` o `{ estado: "NINGUNA" }`.
 */
export function comoVaLaLectura(fila, ahora = new Date()) {
  const desde = fila?.lecturaEnCursoDesde ? new Date(fila.lecturaEnCursoDesde) : null;
  if (desde) {
    const esperandoMs = ahora.getTime() - desde.getTime();
    return esperandoMs > VENCE_LECTURA_MS ? { estado: "VENCIDA" } : { estado: "LEYENDO", esperandoMs };
  }
  if (fila?.ultimaLectura?.status) return { estado: "TERMINADA", respuesta: fila.ultimaLectura };
  return { estado: "NINGUNA" };
}

/**
 * TOMAR LA LECTURA. Devuelve true si este pedido la tomó, false si ya había una.
 *
 * Es UN UPDATE con la condición adentro, no un "leo y después escribo": dos
 * pedidos al mismo tiempo no pueden pasar los dos, porque la base aplica la
 * condición fila por fila. Una que quedó vencida se puede retomar.
 */
export async function tomarLaLectura(cliente, { comprobanteId, grupoId, ahora = new Date() }) {
  const vencida = new Date(ahora.getTime() - VENCE_LECTURA_MS);
  const r = await cliente.comprobanteProveedor.updateMany({
    where: {
      id: comprobanteId,
      grupoId,
      OR: [{ lecturaEnCursoDesde: null }, { lecturaEnCursoDesde: { lt: vencida } }],
    },
    // La respuesta anterior se borra: la que pregunte desde ahora espera ésta.
    // `DbNull` y no `null`: Prisma no acepta null en un campo Json.
    data: { lecturaEnCursoDesde: ahora, ultimaLectura: Prisma.DbNull },
  });
  return r.count === 1;
}

/** Guardar lo que contestó la lectura y soltarla. */
export async function terminarLaLectura(cliente, { comprobanteId, respuesta }) {
  await cliente.comprobanteProveedor.update({
    where: { id: comprobanteId },
    data: { lecturaEnCursoDesde: null, ultimaLectura: respuesta },
  });
}

/**
 * De la `Response` que arma la ruta a lo que se guarda: estado y cuerpo.
 *
 * Se clona porque el cuerpo de una `Response` se lee una sola vez.
 */
export async function respuestaParaGuardar(response) {
  let cuerpo = null;
  try {
    cuerpo = await response.clone().json();
  } catch {
    cuerpo = { ok: false, error: "La lectura terminó con una respuesta que no se pudo guardar." };
  }
  return { status: response.status, cuerpo };
}

/**
 * AL ARRANCAR: las que figuran en curso se marcan cortadas.
 *
 * @returns cuántas se cortaron, para que el arranque lo diga.
 */
export async function cortarLasQueQuedaronLeyendo(cliente) {
  const r = await cliente.comprobanteProveedor.updateMany({
    where: { lecturaEnCursoDesde: { not: null } },
    data: { lecturaEnCursoDesde: null, ultimaLectura: respuestaDeLaCortada() },
  });
  return r.count;
}
