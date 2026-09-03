// lib/productos/navegacionPorFilas.js
//
// RECORRER LA TABLA DE ESCRITORIO CON LAS FLECHAS.
//
// La fila que ya se teñía al tocarla pasa a ser el cursor: `ArrowDown` baja una,
// `ArrowUp` sube una, y nada más. No hay color nuevo ni marca nueva — la única
// decisión que se agrega es CUÁL fila queda seleccionada.
//
// ── POR QUÉ ES UN ARCHIVO PURO Y NO UN `onKeyDown` EN LA TABLA ─────────────
//
// Porque las cuatro reglas que importan —una fila por pulsación, no envolver, no
// cambiar de página, y no interceptar cuando se está escribiendo— se pueden
// ejercer sin navegador, y cada una tiene un modo de fallar que se ve igual de
// bien en verde: un `+2` que saltea un producto, un módulo que da la vuelta y
// vuelve a la primera, una flecha que se roba las teclas del buscador.
//
// La sonda sigue haciendo falta y mide otra cosa: que el foco quede en la tabla,
// que la fila entre en pantalla y que el navegador no mueva además la página por
// su cuenta. Eso es del DOM y acá no se puede afirmar.

/** Las dos teclas que mueven el cursor, y cuánto mueve cada una. */
export const PASO_POR_TECLA = {
  ArrowDown: 1,
  ArrowUp: -1,
};

/**
 * ¿Esta tecla mueve el cursor de la tabla?
 *
 * Se pregunta por el mapa y no por una lista de nombres al lado: si mañana se
 * suma `Home` o `PageDown`, se agrega en un solo lugar y las dos preguntas
 * —cuáles son y cuánto mueven— siguen contestando lo mismo.
 */
export function esTeclaDeNavegacion(tecla) {
  return Object.prototype.hasOwnProperty.call(PASO_POR_TECLA, tecla);
}

/**
 * Dónde está la fila seleccionada dentro de la página que se ve.
 *
 * `-1` cuando no hay selección o cuando el producto seleccionado no está en esta
 * página. Los ids se comparan como NÚMEROS: la tabla los recibe de la API como
 * números y el almacén de sesión los devuelve como texto, así que compararlos
 * con `===` a secas haría que la selección restaurada no case con ninguna fila.
 */
export function indiceDeLaSeleccion(ids = [], seleccionado) {
  if (seleccionado === null || seleccionado === undefined) return -1;
  const n = Number(seleccionado);
  if (!Number.isFinite(n)) return -1;
  return ids.findIndex((id) => Number(id) === n);
}

/**
 * La fila que queda seleccionada después de una flecha, o `null` si no se mueve.
 *
 * `null` significa "no pasó nada" y es un resultado legítimo en tres casos
 * distintos, que conviene tener presentes porque los tres se ven igual desde
 * afuera:
 *
 *   · **no hay nada seleccionado**: la flecha no elige una fila de la nada. El
 *     cursor arranca con un clic, que es lo que el pedido dice.
 *   · **se llegó al borde**: en la primera fila `ArrowUp` no hace nada y en la
 *     última `ArrowDown` tampoco. **NO SE ENVUELVE.** Dar la vuelta haría que
 *     mantener la flecha apretada recorra la página en círculo sin que se note
 *     que se llegó al final.
 *   · **la tecla no es de navegación**: no es asunto de esta función.
 *
 * Y NO CAMBIA DE PÁGINA. Llegar al final de la página 2 no trae la 3: para eso
 * está el paginador, que es donde el usuario ya sabe buscarlo. Una flecha que
 * dispara una carga de red es una flecha que a veces tarda dos segundos en hacer
 * algo, y no hay forma de distinguir eso de que se haya trabado.
 */
export function siguienteSeleccion(ids = [], seleccionado, tecla) {
  if (!esTeclaDeNavegacion(tecla)) return null;
  if (!Array.isArray(ids) || ids.length === 0) return null;

  const actual = indiceDeLaSeleccion(ids, seleccionado);
  if (actual < 0) return null;

  const destino = actual + PASO_POR_TECLA[tecla];
  if (destino < 0 || destino >= ids.length) return null;
  return ids[destino];
}

/** Las etiquetas que escriben, y por lo tanto se quedan con las flechas. */
const ETIQUETAS_QUE_ESCRIBEN = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "OPTION"];

/**
 * ¿El foco está en algo que necesita las flechas para lo suyo?
 *
 * Dentro de un campo de texto la flecha mueve el cursor de escritura; dentro de
 * un desplegable elige una opción. Robarle la tecla a cualquiera de los dos
 * rompe algo que ya funcionaba, y el buscador de esta pantalla es exactamente
 * ese caso.
 *
 * `contenteditable` entra por el `isContentEditable` del elemento, que ya
 * contempla heredarlo de un ancestro — mirar solo el atributo dejaría afuera al
 * hijo de un bloque editable.
 *
 * Un elemento nulo NO cuenta como control: sin foco conocido, la tabla se queda
 * con la tecla. Es la respuesta correcta para el caso en que el foco está en el
 * `<body>` porque el usuario acaba de tocar una fila.
 */
export function esControlQueUsaLasFlechas(elemento) {
  if (!elemento) return false;
  if (elemento.isContentEditable === true) return true;
  const etiqueta = String(elemento.tagName || "").toUpperCase();
  if (ETIQUETAS_QUE_ESCRIBEN.includes(etiqueta)) return true;
  // Un control armado a mano —un div con rol de listbox o de textbox— también
  // usa las flechas. Se mira el rol porque la etiqueta no lo dice.
  const rol = String(elemento.getAttribute?.("role") || "").toLowerCase();
  return ["textbox", "combobox", "listbox", "searchbox", "spinbutton"].includes(rol);
}

/**
 * La selección que sobrevive a un cambio de página, filtro, búsqueda u orden.
 *
 * Si el producto que estaba seleccionado ya no está en la lista, la selección se
 * limpia: dejarla puesta significaría que el cursor apunta a algo invisible, y
 * la primera flecha después de eso no tendría desde dónde moverse — el usuario
 * apretaría y no pasaría nada, sin ninguna pista de por qué.
 *
 * **Con la lista vacía no se limpia nada.** Una lista sin filas es lo que se ve
 * mientras carga, y limpiar ahí borraría la selección que se acaba de restaurar
 * al volver de editar, en el frame anterior a que lleguen los datos.
 */
export function seleccionQueSobrevive(ids = [], seleccionado) {
  if (seleccionado === null || seleccionado === undefined) return null;
  if (!Array.isArray(ids) || ids.length === 0) return seleccionado;
  return indiceDeLaSeleccion(ids, seleccionado) >= 0 ? seleccionado : null;
}
