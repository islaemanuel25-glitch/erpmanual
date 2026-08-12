// lib/compras-proveedor/comprobante/errorDeRuta.js
//
// EL MENSAJE DE UN ERROR QUE NADIE PREVIÓ.
//
// ── POR QUÉ HIZO FALTA ─────────────────────────────────────────────────────
//
// El 2026-08-12 la pantalla de comprobantes se cayó en producción y lo único que
// Emanuel vio fue "Error interno". Con eso no se puede hacer nada: no dice qué
// se estaba haciendo, no dice si lo que acababa de subir se guardó, y no dice si
// conviene reintentar o avisar. Costó una vuelta entera averiguar que la subida
// había funcionado y que lo roto era la lista.
//
// Ese texto salía del `catch` final de la ruta, escrito ahí mismo. Los candados
// del módulo miran dos lugares —el catálogo de mensajes y los textos de la
// pantalla— y el mensaje venía de un tercero. Miraban donde el problema no
// estaba.
//
// ── QUÉ TIENE QUE DECIR, Y POR QUÉ SE EXIGE ────────────────────────────────
//
// Un `catch` genérico NO SABE qué pasó, y no se le va a pedir que lo invente.
// Pero sí sabe dos cosas que alcanzan para que la persona decida:
//
//   1. QUÉ SE ESTABA HACIENDO. "No se pudo cargar la lista" ya descarta que el
//      problema sea lo que acababa de tocar.
//   2. QUÉ PASÓ CON SUS DATOS. Es la pregunta que de verdad importa cuando algo
//      falla: ¿se guardó o no? Sin eso, la reacción normal es reintentar, y
//      reintentar una escritura que sí entró duplica.
//
// Los dos son OBLIGATORIOS: la función no arma nada si falta alguno. Un
// parámetro opcional acá terminaría en un "No se pudo completar la operación",
// que es "Error interno" con más letras.

/**
 * @param operacion  qué se estaba haciendo, en infinitivo y en criollo:
 *                   "cargar la lista de comprobantes", "guardar la receta".
 * @param quedo      qué pasó con los datos de quien mira. Es lo primero que se
 *                   pregunta cuando algo falla.
 */
export function errorInesperado({ operacion, quedo } = {}) {
  const o = String(operacion ?? "").trim();
  const q = String(quedo ?? "").trim();
  if (!o || !q) {
    throw new Error(
      "errorInesperado necesita `operacion` y `quedo`: un mensaje que no dice qué se " +
        "estaba haciendo ni qué pasó con los datos es 'Error interno' con más letras."
    );
  }
  return (
    `No se pudo ${o}. Fue una falla del sistema, no algo que hayas hecho mal. ${q} ` +
    `Probá de nuevo; si vuelve a pasar, avisá diciendo la hora.`
  );
}

/**
 * ¿Este texto sirve como mensaje de error?
 *
 * Se usa desde los candados. Pide una CAUSA o una situación, no una sugerencia:
 * "Probá de nuevo" es una acción sin información, y fue exactamente el mensaje
 * que aprobó su propio defecto la primera vez que se escribió este criterio.
 */
export function sirveComoMensaje(texto) {
  const t = String(texto ?? "").trim();
  if (t.length < 25) return false;

  // Los que no dicen nada, por más largos que sean.
  if (/^(error|error interno|error inesperado|algo salió mal)\.?$/i.test(t)) return false;

  // ── EL CRITERIO, CORREGIDO POR UN CANDADO EN ROJO ────────────────────
  //
  // La primera versión aprobaba cualquier texto que contuviera "no se pudo", y
  // con eso aprobaba "No se pudo subir. Probá de nuevo." — que es justamente el
  // mensaje que nos costó una vuelta. Y rechazaba "La imagen de este comprobante
  // ya no está. Las fotos viven siete días", que dice todo lo que hace falta.
  //
  // Lo que separa uno del otro no es qué palabras usa: es si dice ALGO ADEMÁS
  // del fallo. "No se pudo X, probá de nuevo" es el fallo y una sugerencia; no
  // hay ni causa, ni estado, ni consecuencia. Se rechaza esa forma entera,
  // venga con las palabras que venga.
  const soloFalloYReintento =
    /^no se pudo[^.]*\.?\s*(prob[áa]|reintent|volv[ée]|intent)[^.]*\.?$/i.test(t);
  if (soloFalloYReintento) return false;

  return true;
}
