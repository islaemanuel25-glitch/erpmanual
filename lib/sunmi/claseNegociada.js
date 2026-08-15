// lib/sunmi/claseNegociada.js
//
// QUIÉN GANA CUANDO LA PIEZA Y LA PANTALLA PIDEN LO MISMO.
//
// Es la misma decisión que `claseAncho.js` —y por el mismo motivo, que está
// escrito allá— generalizada a las otras dos familias que aparecen de verdad en
// las celdas de dos renglones: el TAMAÑO DE LETRA y el COLOR DEL TEXTO.
//
// En una palabra: dos clases de Tailwind de la misma familia tienen la misma
// especificidad, así que no decide el orden dentro del atributo sino el orden
// en la hoja de estilos. Poner las dos es dejar que gane la que Tailwind quiera.
// Acá se decide en JavaScript, antes de que el CSS entre en juego: si la
// pantalla declaró un tamaño, la pieza NO pone el suyo. Nunca están los dos.
//
// ── POR QUÉ HACE FALTA ACÁ, MEDIDO ─────────────────────────────────────────
//
// El renglón chico de las celdas de dos renglones está escrito siete veces en
// el repo y YA SE SEPARÓ: cuatro en el catálogo de listas dicen `text-[9.5px]`
// y tres en la conciliación de comprobantes dicen `text-xs2`, que son 10px.
// Media letra de diferencia entre dos pantallas que muestran lo mismo.
//
// La pieza no puede resolverlo eligiendo una: la del catálogo es la que Emanuel
// mira todos los días y tiene que quedar idéntica. Así que el default es el
// token del kit y CEDE — el catálogo sigue pasando el suyo y no se mueve un
// píxel, y el día que se decida unificar se saca de un solo lugar.
//
// Módulo puro: sin React, sin DOM. Por eso se puede ejercer en un candado.

/** Las que son alineación y no tamaño, aunque empiecen igual. */
const ALINEACION = new Set(["left", "right", "center", "justify", "start", "end"]);

const tokens = (className) =>
  typeof className === "string" && className !== "" ? className.trim().split(/\s+/) : [];

/** Saca el `!` de adelante, que no cambia de qué familia es el token. */
const pelar = (t) => (t.startsWith("!") ? t.slice(1) : t);

/**
 * ¿Este `className` declara un TAMAÑO DE LETRA?
 *
 * Cuenta `text-xs2`, `text-sm2`, `text-[9.5px]`. NO cuentan `text-right` y sus
 * hermanas, que son alineación —otra propiedad CSS, no hay pelea que ganar—, ni
 * los colores del tema, que empiezan con `sunmi-`.
 */
export function declaraTamanoDeLetra(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    if (!t.startsWith("text-")) return false;
    const resto = t.slice("text-".length);
    return resto !== "" && !ALINEACION.has(resto);
  });
}

/**
 * ¿Este `className` declara un COLOR DE TEXTO del tema?
 *
 * Solo los del tema. Un color fijo de Tailwind no se busca a propósito: no
 * puede aparecer, porque el trinquete de hardcodeo no lo deja entrar.
 */
export function declaraColorDeTexto(className) {
  return tokens(className).some((bruto) => pelar(bruto).startsWith("sunmi-text-"));
}

/**
 * ¿Este `className` declara un PADDING HORIZONTAL? ¿Y uno VERTICAL?
 *
 * Se preguntan por separado porque son propiedades distintas y una pantalla
 * puede pisar una sola. `p-0` cuenta para las dos: fija las cuatro.
 *
 * ── POR QUÉ HACE FALTA, MEDIDO ─────────────────────────────────────────────
 *
 * En modo por columnas el padding de la celda lo pone la densidad, y hay tres:
 * `compacta` px-2 py-1, `normal` px-2 py-1.5 y `comoda` px-3 py-2.5. De las 440
 * celdas crudas del repo que traen padding propio, **esas tres cubren 145**.
 * Las otras 295 usan otra cosa, y las cuatro más comunes son px-3 py-1.5 (67),
 * px-3 py-2 (63), px-2 py-2 (52) y px-2.5 py-3 (46).
 *
 * O sea que migrar una tabla cualquiera a modo por columnas le cambia el
 * padding a dos de cada tres. Y no se arregla poniendo el padding en
 * `tdClassName`, porque hoy la tabla lo CONCATENA con el de la densidad: quedan
 * los dos y gana el que Tailwind haya puesto último en la hoja de estilos.
 * `px-3` le gana a `px-2` por el orden numérico, así que a veces sale bien —y
 * esa es la peor forma de que salga bien, porque al revés sale mal en silencio—.
 *
 * La salida no es inventar cuatro densidades más: es que la densidad ceda,
 * igual que cede el ancho de `SunmiInput`.
 */
export function declaraPaddingX(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    return /^p-\S/.test(t) || /^px-\S/.test(t);
  });
}

export function declaraPaddingY(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    return /^p-\S/.test(t) || /^py-\S/.test(t);
  });
}

/**
 * ¿Este `className` declara una ALINEACIÓN de texto?
 *
 * Mismo caso que el padding, encontrado mirando la cadena compuesta del editor
 * de corrección: la tabla agregaba su `text-left` por defecto y la columna traía
 * `text-right`. Quedaban las dos y ganaba `text-right` solo porque Tailwind
 * escribe `.text-right` después de `.text-left` en la hoja. Sale bien hoy y
 * saldría mal el día que alguien quiera `text-left` sobre un default distinto.
 */
export function declaraAlineacion(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    return t.startsWith("text-") && ALINEACION.has(t.slice("text-".length));
  });
}

/**
 * ¿Este `className` declara un ANCHO MÁXIMO?
 *
 * `claseAncho.js` a propósito NO cuenta `max-w-*` como ancho, y tiene razón para
 * lo suyo: un `max-w-sm` acota pero no define, así que el `w-full` del input se
 * tiene que quedar. Acá es otra cosa —el panel del modal declara su `max-w-*`
 * como el ancho que quiere— y sí hay que saber si la pantalla trajo el suyo.
 */
export function declaraAnchoMaximo(className) {
  return tokens(className).some((bruto) => /^max-w-\S/.test(pelar(bruto)));
}

/**
 * ¿Este `className` declara una SUPERFICIE, o sea un fondo?
 *
 * Cuenta el `bg-*` de Tailwind y las clases del proyecto que ponen `background`:
 * `sunmi-surface`, `sunmi-surface-soft`, `sunmi-bg`, las de estado y las de tono
 * de fila. NO cuenta `ring-*`, que es `box-shadow` y no pelea con el fondo.
 *
 * ── EL CASO QUE LO PIDIÓ, medido el 2026-08-15 ─────────────────────────────
 *
 * `SunmiPanel` concatena `theme.card` —que es `bg-X border border-Y`— con lo que
 * declara la pantalla, y **28 de sus 29 consumidores declaran `sunmi-surface`**.
 * Los dos fondos quedaban en el atributo y ganaba el `bg-*` de Tailwind, porque
 * `@import "sunmi.css"` va antes de `@tailwind utilities`. O sea que esas 28
 * declaraciones NUNCA se aplicaron.
 */
export function declaraSuperficie(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    if (/^bg-\S/.test(t)) return true;
    return (
      t === "sunmi-surface" ||
      t === "sunmi-surface-soft" ||
      t === "sunmi-bg" ||
      t === "sunmi-card" ||
      t.startsWith("sunmi-state-") ||
      t.startsWith("sunmi-fila")
    );
  });
}

/**
 * ¿Este `className` declara un BORDE?
 *
 * `border` a secas y `border-<algo>`, más `sunmi-border` y las de estado, que
 * ponen `border` en el CSS. Quedan afuera las de tabla —`border-collapse`,
 * `border-separate`, `border-spacing-*`— que no son un borde sino cómo se dibujan
 * los de adentro.
 */
const BORDE_DE_TABLA = /^border-(collapse|separate|spacing)/;

export function declaraBorde(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    if (BORDE_DE_TABLA.test(t)) return false;
    if (t === "border" || /^border-\S/.test(t)) return true;
    return t === "sunmi-border" || t.startsWith("sunmi-state-");
  });
}

/**
 * La tarjeta del tema, pero solo en los ejes que la pantalla NO declaró.
 *
 * `theme.card` es una sola cadena con DOS ejes adentro —`bg-X border border-Y`—,
 * así que ceder "la tarjeta" entera cuando la pantalla declara un fondo se
 * llevaría puesto el borde, que nadie pidió. Se filtra token por token.
 *
 * @param {string} card    lo que trae el tema.
 * @param {string} pedido  lo que declaró la pantalla.
 * @returns {string}       solo los tokens del tema que sobreviven.
 */
export function tarjetaQueSobrevive(card = "", pedido = "") {
  const pide = typeof pedido === "string" ? pedido : "";
  const cedeFondo = declaraSuperficie(pide);
  const cedeBorde = declaraBorde(pide);

  return tokens(card)
    .filter((bruto) => {
      const t = pelar(bruto);
      if (/^bg-\S/.test(t)) return !cedeFondo;
      if (BORDE_DE_TABLA.test(t)) return true;
      if (t === "border" || /^border-\S/.test(t)) return !cedeBorde;
      return true;
    })
    .join(" ");
}

/**
 * El padding de una celda: el de la densidad, pero solo en el eje que la
 * pantalla no declaró.
 *
 * @param {string} densidad  las clases de la densidad, p. ej. "px-2 py-1.5".
 * @param {string} pedido    lo que declaró la pantalla en `tdClassName`.
 * @returns {string}         solo las clases de densidad que sobreviven.
 */
export function paddingQueSobrevive(densidad = "", pedido = "") {
  const pide = typeof pedido === "string" ? pedido : "";
  const sacaX = declaraPaddingX(pide);
  const sacaY = declaraPaddingY(pide);
  return tokens(densidad)
    .filter((bruto) => {
      const t = pelar(bruto);
      if (/^p-\S/.test(t)) return !(sacaX && sacaY);
      if (/^px-\S/.test(t)) return !sacaX;
      if (/^py-\S/.test(t)) return !sacaY;
      return true;
    })
    .join(" ");
}

/**
 * La clase final: la base de la pieza, después los defaults que NADIE pisó, y
 * al final lo que pidió la pantalla.
 *
 * Devolver la cadena entera —y no un booleano— es a propósito, igual que en
 * `componerClaseInput`: deja que el candado afirme sobre el resultado
 * observable en vez de sobre la forma del archivo.
 *
 * @param {object} p
 * @param {string} p.base      clases de la pieza que nunca ceden.
 * @param {string} p.tamano    tamaño por defecto, cede si la pantalla trae uno.
 * @param {string} p.color     color por defecto, cede si la pantalla trae uno.
 * @param {string} p.pedido    lo que llega por prop.
 * @returns {string}
 */
export function componerClaseTexto({ base = "", tamano = "", color = "", pedido = "" } = {}) {
  const pide = typeof pedido === "string" ? pedido.trim() : "";
  const partes = [String(base).trim()];
  if (tamano && !declaraTamanoDeLetra(pide)) partes.push(tamano);
  if (color && !declaraColorDeTexto(pide)) partes.push(color);
  if (pide) partes.push(pide);
  return partes.filter(Boolean).join(" ");
}
