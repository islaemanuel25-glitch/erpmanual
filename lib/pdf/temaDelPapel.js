// LOS COLORES Y LAS LETRAS DEL TEMA, PARA UN PDF DEL SERVIDOR.
//
// ── QUÉ TEMA, Y POR QUÉ UNO SOLO ──────────────────────────────────────────
//
// El PDF se imprime o se mira sobre papel blanco. De los catorce temas, los
// oscuros ponen texto claro pensado para un fondo oscuro: sobre blanco no se
// lee. El tema claro del kit es `sunmiLight`, y sus valores ya están medidos
// para contraste sobre fondo blanco —ver el comentario de ese bloque en
// `app/globals.css`, que explica por qué el acento es #b45309 y no el ámbar de
// los oscuros—.
//
// ── POR QUÉ LOS VALORES ESTÁN ESCRITOS ACÁ, Y QUÉ LOS ATA A LA HOJA ───────
//
// El servidor no tiene una hoja de estilos que resolver: `pdf-lib` necesita el
// color como número. Cada uno va con el NOMBRE de la variable de donde sale, y
// `temaDelPapel.test.mjs` lee el bloque de `sunmiLight` en `app/globals.css` y
// se pone rojo si alguno difiere. Si el tema cambia un color, el PDF no se
// queda atrás en silencio.
//
// ── LAS LETRAS SALEN DE LA ESCALA DEL PROYECTO ────────────────────────────
//
// Se leen de `tailwind.config.js`, la misma escala que usan las pantallas
// (`xs2`, `sm2`, `base2`, `xl2`...). La escala está en píxeles CSS y el PDF
// mide en puntos: un píxel CSS son 0,75 puntos por definición (1/96 contra 1/72
// de pulgada), así que se convierte con ese factor y no a ojo.

import tailwind from "../../tailwind.config.js";

/** Las variables de `sunmiLight` que usa el papel, con su valor. */
export const COLORES_DEL_PAPEL = Object.freeze({
  /** El color de acción del tema. */
  "--pos-accent": "#b45309",
  /** El texto principal. */
  "--app-fg": "#0f172a",
  /** El gris del texto secundario. */
  "--pos-muted": "#64748b",
  /** El gris más fuerte, el de los rótulos. */
  "--pos-muted-strong": "#475569",
  /** El borde. */
  "--app-border": "#cbd5e1",
  /** El fondo suave de la cabecera de una tabla. */
  "--table-header-bg": "#f1f5f9",
});

/** El color de una variable como `{ r, g, b }` entre 0 y 1, que es lo que pide `pdf-lib`. */
export function colorDelPapel(variable) {
  const hex = COLORES_DEL_PAPEL[variable];
  if (!hex) throw new Error(`temaDelPapel: la variable ${variable} no está en el tema del papel`);
  const n = parseInt(hex.slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** Puntos por píxel CSS. */
export const PUNTOS_POR_PIXEL = 0.75;

/** Un tamaño de letra de la escala del proyecto, en puntos. */
export function letraDelPapel(token) {
  const px = tailwind?.theme?.extend?.fontSize?.[token];
  const n = parseFloat(Array.isArray(px) ? px[0] : px);
  if (!Number.isFinite(n)) throw new Error(`temaDelPapel: el tamaño ${token} no está en la escala de tailwind.config.js`);
  return n * PUNTOS_POR_PIXEL;
}
