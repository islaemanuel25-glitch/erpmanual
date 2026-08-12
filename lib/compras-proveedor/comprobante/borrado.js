// lib/compras-proveedor/comprobante/borrado.js
//
// BORRAR UN COMPROBANTE, Y POR QUÉ NO ES LO MISMO QUE ANULARLO.
//
// ── LAS DOS SON DISTINTAS Y LAS DOS EXISTEN ────────────────────────────────
//
// BORRAR se lleva todo: la fila, sus líneas y la foto del volumen. Es para el
// que sobra — la foto repetida, la que salió movida, la que se subió al pedido
// equivocado. No deja rastro porque no hay nada que rastrear: nunca significó
// nada.
//
// ANULAR deja el comprobante y lo marca. Es para el que YA MOVIÓ ALGO. Un
// comprobante confirmado escribió costos en una recepción, y esos costos ya
// están en productos que se venden. Borrarlo dejaría esos números sin ninguna
// explicación: alguien mirando un costo raro dentro de tres meses buscaría de
// dónde salió y no encontraría nada.
//
// Por eso la regla no es una preferencia: **confirmado no se borra, se anula.**
//
// ── LO QUE SE PIERDE HAY QUE DECIRLO ANTES ─────────────────────────────────
//
// Un comprobante con veinte líneas leídas y ocho vinculadas a mano es media hora
// de trabajo de alguien. Borrarlo es legítimo, pero no se hace sin que la
// persona sepa qué se lleva puesto. El texto lo dice con números, no con un
// "esta acción no se puede deshacer" genérico que nadie lee.

export const MOTIVO_NO_BORRAR = Object.freeze({
  CONFIRMADO:
    "Este comprobante ya fue confirmado en una recepción, así que sus costos ya se aplicaron. " +
    "No se borra: se anula, que lo deja marcado sin perder de dónde salieron esos números.",
  NO_EXISTE: "Ese comprobante ya no está. Puede que lo haya borrado otra persona.",
});

/**
 * ¿Se puede borrar?
 *
 * @param comprobante  { confirmadoEn }
 */
export function sePuedeBorrar(comprobante) {
  if (!comprobante) return { ok: false, motivo: MOTIVO_NO_BORRAR.NO_EXISTE };
  if (comprobante.confirmadoEn) return { ok: false, motivo: MOTIVO_NO_BORRAR.CONFIRMADO };
  return { ok: true };
}

/** Un plural que no queda "1 líneas". */
const plural = (n, singular, muchos) => `${n} ${n === 1 ? singular : muchos}`;

/**
 * Qué se va a perder, dicho con números.
 *
 * @param lineas      cuántas líneas leídas tiene
 * @param vinculadas  cuántas de ésas ya están vinculadas a una línea del pedido
 * @param fotos       cuántos archivos quedan en el volumen
 * @param identidad   "A 0011-00794708" o null si todavía no se leyó
 */
export function textoDeBorrado({ lineas = 0, vinculadas = 0, fotos = 0, identidad = null } = {}) {
  const partes = [];
  partes.push(identidad ? `Vas a borrar el comprobante ${identidad}.` : "Vas a borrar este comprobante.");

  const seVa = [];
  if (lineas > 0) seVa.push(plural(lineas, "línea leída", "líneas leídas"));
  if (fotos > 0) seVa.push(plural(fotos, "foto", "fotos"));
  if (seVa.length) partes.push(`Se van sus ${seVa.join(" y sus ")}.`);
  else partes.push("Todavía no tiene nada leído.");

  // EL AVISO DEL TRABAJO A MANO VA APARTE Y CON SU NÚMERO. Es lo único que no se
  // puede volver a obtener apretando "Leer": vincular lo hizo una persona.
  const aviso =
    vinculadas > 0
      ? `${plural(vinculadas, "línea ya está vinculada", "líneas ya están vinculadas")} al pedido. ` +
        `Ese trabajo se pierde: volver a leer el comprobante no lo recupera, hay que vincular de nuevo.`
      : null;

  partes.push("No se puede deshacer.");

  return { texto: partes.join(" "), aviso, hayTrabajoAMano: vinculadas > 0 };
}
