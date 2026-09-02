// lib/productos/contenedorDeScroll.js
//
// CUÁL DE LOS CANDIDATOS ES EL CONTENEDOR QUE DE VERDAD SCROLLEA.
//
// ── EL DEFECTO QUE ESTE ARCHIVO EXISTE PARA IMPEDIR ────────────────────────
//
// La pantalla resolvía el contenedor así:
//
//     document.getElementById("productos-scroll") || document.querySelector("main")
//
// `#productos-scroll` es el contenedor de la TABLA DE ESCRITORIO, y vive adentro
// de un `hidden md:block`. En el celular ese elemento **está en el DOM** —así que
// `getElementById` lo devuelve— y **está oculto** —así que su `scrollTop` es
// siempre 0—. La pantalla guardaba un cero, restauraba un cero, y no había
// ningún error que mirar.
//
// El `||` no alcanzaba porque no pregunta si el elemento sirve: pregunta si
// existe. Un elemento oculto existe.
//
// ── POR QUÉ LA DECISIÓN ES PURA Y EL DOM QUEDA AFUERA ─────────────────────
//
// Porque así se puede ejercer el caso exacto que se rompió —un candidato
// presente pero oculto— sin navegador y en milisegundos. El envoltorio que mide
// el DOM es de tres líneas y no decide nada.

/**
 * ¿Este candidato sirve como contenedor de scroll?
 *
 * Tres condiciones, y las tres hacen falta:
 *
 *   · **visible**: un elemento con `display:none` mide 0 en todo y su
 *     `scrollTop` no se puede ni leer ni fijar de forma útil. Es el caso que
 *     rompía el celular.
 *   · **tiene caja**: `clientHeight` mayor que cero. Un contenedor visible pero
 *     de alto cero tampoco desplaza nada.
 *   · **tiene sobrante**: `scrollHeight` mayor que `clientHeight`. Sin sobrante
 *     no hay scroll que guardar ni que restaurar; fijarle `scrollTop` es un
 *     no-op silencioso.
 *
 * La tercera es la que evita un empate falso: en escritorio el `<main>` existe y
 * es visible, pero el que desplaza la lista es la tabla. Sin mirar el sobrante,
 * el primero de la lista ganaría siempre.
 */
export function sirveComoContenedor(candidato) {
  if (!candidato) return false;
  if (candidato.visible !== true) return false;
  const alto = Number(candidato.clientHeight);
  const total = Number(candidato.scrollHeight);
  if (!Number.isFinite(alto) || alto <= 0) return false;
  if (!Number.isFinite(total)) return false;
  return total > alto;
}

/**
 * El primero de la lista que sirva.
 *
 * El ORDEN de los candidatos es la preferencia, y se decide en el llamador: el
 * contenedor de la tabla primero —porque en escritorio es el que desplaza la
 * lista— y el `<main>` después, que es el que desplaza en el celular. Lo que
 * cambia respecto de lo que había es que ahora un candidato que no sirve **se
 * saltea** en vez de ganar por estar primero.
 *
 * Devuelve `null` si ninguno sirve, y eso no es un error: puede no haber
 * sobrante porque la lista entra entera en la pantalla. Ahí no hay nada que
 * restaurar y el llamador tiene que poder distinguirlo de "no encontré nada".
 */
export function elegirContenedor(candidatos = []) {
  for (const c of candidatos) {
    if (sirveComoContenedor(c)) return c;
  }
  return null;
}

/** IDs y selectores de los candidatos, en orden de preferencia. */
export const CANDIDATOS_SCROLL = [
  { tipo: "id", valor: "productos-scroll" },
  { tipo: "selector", valor: "main" },
];

/**
 * El envoltorio del DOM. No decide: mide y le pregunta a `elegirContenedor`.
 *
 * Se le pasa `document` en vez de tomarlo del entorno para que un candado pueda
 * ejercerlo con un documento de mentira si hiciera falta, y para que no explote
 * cuando esto se evalúe en el servidor.
 */
export function contenedorDeScrollDe(doc) {
  if (!doc) return null;
  const elementos = CANDIDATOS_SCROLL.map((c) =>
    c.tipo === "id" ? doc.getElementById(c.valor) : doc.querySelector(c.valor)
  ).filter(Boolean);

  const medidos = elementos.map((el) => ({
    el,
    // `offsetParent === null` es la forma barata de preguntar si algo está
    // oculto: un elemento con `display:none` —o adentro de uno— no tiene.
    // `clientHeight > 0` sola no alcanza en todos los navegadores.
    visible: el.offsetParent !== null || el === doc.body || el === doc.documentElement,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
  }));

  return elegirContenedor(medidos)?.el ?? null;
}
