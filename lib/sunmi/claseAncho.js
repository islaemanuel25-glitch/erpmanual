// lib/sunmi/claseAncho.js
//
// QUIÉN GANA CUANDO EL COMPONENTE Y QUIEN LO USA PIDEN ANCHOS DISTINTOS.
//
// ── EL PROBLEMA ─────────────────────────────────────────────────────────────
//
// `SunmiInput` armaba su clase así:
//
//   `sunmi-input w-full ... ${className}`
//
// y `w-full` y `w-[46px]` son las dos una clase sola: misma especificidad. El
// orden dentro del atributo NO decide nada — decide el orden en la hoja de
// estilos, que lo fija Tailwind al generarla. Resultado medido: ganaba `w-full`
// y el ancho pedido por quien usaba el componente no se aplicaba nunca. En la
// pantalla de nuevo pedido, 75 de 77 inputs tenían `width: 100%`.
//
// No es un problema estético. Un ancho que se ignora no molesta: el input se
// estira y todo entra. Molesta el día que se arregla, porque entonces TODOS los
// anchos pedidos empiezan a aplicarse a la vez, incluidos los que se escribieron
// sin medir. Ya pasó una vez: el stepper de compras pedía 42 px, que dejan 26
// útiles, y "1870" mide 31. Habría cortado el número sin avisar.
//
// ── POR QUÉ NO SE RESUELVE CON CSS ──────────────────────────────────────────
//
// Se podría subir la especificidad del ancho pedido, o marcarlo con `!`. Las dos
// obligan a quien usa el componente a escribir algo especial para que su ancho
// valga, y el que no se entere escribe `w-[46px]` como siempre y no pasa nada.
// La regla queda en la cabeza de la gente en vez de en el código.
//
// Acá se decide en JavaScript, antes de que el CSS entre en juego: si quien usa
// el componente declaró un ancho, el componente NO pone el suyo. Nunca están los
// dos, así que no hay pelea que ganar.
//
// ── LO QUE NO SE HACE, Y POR QUÉ IMPORTA MÁS QUE LO QUE SÍ ──────────────────
//
// **No se saca `w-full`.** De los 225 usos de `SunmiInput` del repo, 193 no
// piden ancho ninguno y son anchos justamente porque el componente se los pone.
// Sacarlo los dejaría en el ancho por defecto del navegador —fijo, unos 170 px—
// y desfiguraría de una sola vez la ficha de producto, la de cliente, los
// modales de caja y el login. `w-full` sigue siendo el default; lo único que
// cambia es que ahora cede.
//
// Módulo puro: sin React, sin DOM. Por eso se puede ejercer en un candado.

/**
 * ¿Este `className` declara un ancho propio, sin condiciones?
 *
 * Cuenta como ancho un token que empieza en `w-`, con o sin `!`. NO cuentan:
 *
 * - `min-w-*` y `max-w-*`, que son otras propiedades CSS. Un `max-w-sm` acota,
 *   no define: el input tiene que seguir estirándose hasta ese tope, así que
 *   `w-full` se queda.
 * - Los anchos con variante —`sm:w-40`, `hover:w-1/2`—, que solo valen bajo su
 *   condición. Si se sacara `w-full` por uno de esos, el input se quedaría sin
 *   ancho en todos los casos que la variante no cubre; abajo del breakpoint,
 *   nada. Se conserva `w-full` como base y la variante le gana sola, porque va
 *   después en la hoja de estilos.
 *
 * @param {string} className
 * @returns {boolean}
 */
export function declaraAncho(className) {
  if (typeof className !== "string" || className === "") return false;
  return className
    .split(/\s+/)
    .some((t) => /^!?w-\S/.test(t));
}

/**
 * La clase final del `<input>`: la base del componente más lo que pidió quien lo
 * usa, con `w-full` puesto SOLO si nadie declaró un ancho.
 *
 * Devolver la cadena entera —y no un booleano— es a propósito: deja que el
 * candado afirme sobre el resultado observable ("¿con qué ancho termina este
 * input?") en vez de sobre la forma del archivo.
 *
 * @param {string} className  lo que llega por prop.
 * @param {string} base       clases del componente, sin el ancho.
 * @returns {string}
 */
export function componerClaseInput(className = "", base = "") {
  const pedido = typeof className === "string" ? className.trim() : "";
  const partes = [base.trim()];
  if (!declaraAncho(pedido)) partes.push("w-full");
  if (pedido) partes.push(pedido);
  return partes.filter(Boolean).join(" ");
}
