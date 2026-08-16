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
 * ¿Este `className` declara un MARGEN VERTICAL?
 *
 * `my-*` y `m-*`, que también fija el vertical. Los de un solo lado —`mt-`,
 * `mb-`— no entran: quien declara solo arriba no está reemplazando el eje.
 *
 * ── POR QUÉ HACE FALTA, Y ES EL CASO MÁS CLARO DE LA SERIE ─────────────────
 *
 * `SunmiSeparator` pone `my-2` y concatena. Las 15 declaraciones que existen en
 * el repo pelean TODAS en este eje y en ninguno más. Y como las dos partes son
 * utilidades de Tailwind, decide el orden de la hoja — que para los márgenes es
 * NUMÉRICO. O sea que contra `my-2`:
 *
 *   · un valor MÁS GRANDE gana solo: `my-4` son 14 px y se aplica.
 *   · un valor MÁS CHICO pierde: `my-1` son 3,5 px y no llega, y `my-0` tampoco.
 *
 * Por eso hoy 10 de las 15 llevan `!important` — siete `!my-0` y tres `!my-1`—
 * y no es decorativo como en `SunmiButton`: ahí el `!` es lo único que las hace
 * funcionar. Medido con la clase sola como control.
 *
 * Al ceder el eje, esas diez dejan de necesitar el `!`. El `!` se saca en su
 * propio paso y DESPUÉS de comprobar con una captura que no mueve nada.
 */
export function declaraMargenVertical(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto).replace(/^[a-z-]+:/, "");
    return /^my-\S/.test(t) || /^m-\S/.test(t);
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
 * ¿Este `className` declara un CURSOR?
 *
 * `SunmiTableRow` pone `cursor-pointer` cuando la fila tiene `onClick`, y tres de
 * sus cinco consumidores lo declaran también. Hoy no se ve —piden lo mismo con el
 * mismo valor— pero son dos clases de la misma familia conviviendo, o sea la
 * misma bomba que en `SunmiPanel`: el día que alguien quiera `cursor-default`
 * sobre una fila con `onClick`, gana la hoja y no la pantalla.
 */
export function declaraCursor(className) {
  return tokens(className).some((bruto) => /^cursor-\S/.test(pelar(bruto)));
}

/**
 * ¿Este `className` declara un FONDO AL PASAR EL MOUSE?
 *
 * `hover:bg-*` y las clases del proyecto con el mismo prefijo. Se mira aparte del
 * fondo normal porque son dos estados distintos: una fila puede querer su propio
 * hover y conservar el fondo del kit, o al revés.
 *
 * Dos de los cinco consumidores declaran EXACTAMENTE el mismo hover que la pieza
 * —`hover:bg-[var(--table-row-hover)]`—, así que negociar no cambia lo que se ve.
 */
export function declaraHover(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    if (!t.startsWith("hover:")) return false;
    const resto = t.slice("hover:".length);
    return /^bg-\S/.test(resto) || resto.startsWith("sunmi-");
  });
}

/**
 * ¿Este `className` declara una SOMBRA?
 *
 * `shadow` a secas y `shadow-<algo>`. Queda afuera `shadow-none`… no: `shadow-none`
 * TAMBIÉN es una declaración de la familia, y de las que más importa respetar —es
 * la única forma que tiene una pantalla de pedir que no haya sombra—.
 *
 * Hoy hay UNA sola: el `shadow-lg` de `ModalDetalleVenta`, y PIERDE. Medido sobre
 * la tarjeta real del modal, no sobre un elemento inyectado: su `box-shadow`
 * calculado coincide token por token con el de una referencia `shadow-md` y
 * difiere del de una `shadow-lg`. El control es que las dos referencias, puestas
 * en esa misma página, dan distinto entre sí — sin eso una coincidencia no
 * probaría de quién es.
 */
export function declaraSombra(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    return t === "shadow" || /^shadow-\S/.test(t);
  });
}

/**
 * ¿Este `className` declara un DIFUMINADO DE FONDO?
 *
 * Los tres consumidores escriben `!backdrop-blur-0`, y el `!` no está de adorno:
 * es lo único que hoy los hace ganar. Al negociar el eje, el `!` sobra y se saca
 * — pero se saca DESPUÉS de comprobar con una captura que la pantalla quedaba
 * igual, porque si se sacara antes el `backdrop-blur-sm` de la pieza volvería y
 * el cambio se vería.
 *
 * `backdrop-filter-none` cuenta: es la otra forma de pedir lo mismo.
 */
export function declaraDifuminado(className) {
  return tokens(className).some((bruto) => {
    const t = pelar(bruto);
    return /^backdrop-blur(-\S+)?$/.test(t) || t === "backdrop-filter-none";
  });
}

/*
 * ── ACÁ VIVÍA `declaraPaddingCero`, Y SE FUE A PROPÓSITO ────────────────────
 *
 * Existió una tanda: cedía el `p-6` de `SunmiCard` solo cuando la pantalla pedía
 * CERO, para aplicar las siete tablas de borde a borde sin tocar el aire de las
 * otras cien, que era una decisión de aspecto de toda la aplicación y no de
 * quien migraba.
 *
 * Esa decisión se tomó el 2026-08-15: el aire se migra. Con el eje entero
 * negociado, un `p-0` es un pedido de padding como cualquier otro y el predicado
 * del cero no distingue nada — se borró en vez de dejarlo sin usar.
 *
 * Lo que NO se fue es el criterio que salió de esa tanda, porque no era del
 * predicado sino del repo: **un `p-0` con `overflow-hidden` sobre una tabla es
 * intención estructural declarada; un `p-0` sobre un formulario, no.** Por eso
 * `CardDefaultDeposito` declara `p-6` y no `p-0`, y por eso tiene un candado
 * propio: es la única tarjeta que pedía cero sin querer ir de borde a borde.
 */

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
