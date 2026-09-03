// lib/productos/retornoEscritorio.js
//
// EL RETORNO DE LA TABLA DE ESCRITORIO. El mecanismo que la pantalla YA TENÍA
// antes de `81541c37`, sacado a una pieza propia para que no se vuelva a perder.
//
// ── POR QUÉ EXISTE ESTE ARCHIVO ────────────────────────────────────────────
//
// Escritorio guardaba dos claves sueltas —`productos:scrollY` y
// `productos:selectedProductId`— y al volver restauraba el scroll de la tabla y
// conservaba el tinte de la fila. Funcionaba y estaba aprobado.
//
// Al unificar el retorno para las dos superficies, esas dos claves se
// reemplazaron por el estado estructurado; y cuando el alcance se corrigió a
// "solo móvil", la condición nueva —exigir una card del celular visible— dejó a
// escritorio **sin ninguno de los dos**: ni el viejo, que se había borrado, ni el
// nuevo, que ahora no aplica. Una función que existía desapareció.
//
// La sonda no lo vio porque medía el scroll de la tabla en 0 antes y en 0
// después: nunca la desplazaba, así que comparaba dos ceros y daba verde.
//
// ── LOS DOS CAMINOS NO SE MEZCLAN, Y ESO ES LA REGLA ──────────────────────
//
// · MÓVIL usa `estadoDeRetorno`: identidad con tipo, ancla en el DOM, altura del
//   elemento y la marca "Último editado".
// · ESCRITORIO usa esto: dos claves, un scroll y el tinte de la fila. **No marca
//   nada** y no toca las cards.
//
// Las claves son distintas a propósito. Con una compartida, el estado de un
// camino activaría la marca del otro — que es exactamente lo que hay que
// impedir.
//
// ── LO QUE ESTE ARCHIVO NO HACE ───────────────────────────────────────────
//
// No agrega nada que escritorio no tuviera. En particular, los COMBOS de la
// tabla no guardaban retorno en `c12de2c7` y siguen sin guardarlo: sumarlo sería
// una función nueva, no una restauración.

/** Las dos claves de siempre. Son las que la pantalla usaba antes. */
export const CLAVE_SCROLL_ESCRITORIO = "productos:scrollY";
export const CLAVE_SELECCION_ESCRITORIO = "productos:selectedProductId";

/**
 * El contenedor que desplaza la tabla, resuelto COMO LO HACÍA ANTES.
 *
 * ── POR QUÉ NO SE REUSA `contenedorDeScrollDe` ────────────────────────────
 *
 * Aquella pieza saltea el candidato que no sirve —oculto o sin sobrante—, que es
 * lo correcto para el camino móvil y lo que arregló su defecto. Acá cambiaría el
 * comportamiento: con una tabla corta, sin sobrante, la resolución nueva caería
 * al `<main>` y restauraría el scroll de la PÁGINA, que es algo que escritorio
 * nunca hizo.
 *
 * "Exactamente como antes" quiere decir esto: la misma resolución, con sus
 * límites. Mejorarla sería otro cambio y no es lo que se pidió.
 */
export function contenedorDeLaTabla(doc) {
  if (!doc) return null;
  return doc.getElementById("productos-scroll") || doc.querySelector("main");
}

/**
 * Guarda el retorno de escritorio: dónde estaba el scroll y qué fila se abrió.
 *
 * Devuelve si pudo. Un almacenamiento bloqueado no rompe la navegación: abrir el
 * editor no depende de esto, igual que antes.
 */
export function guardarRetornoEscritorio(storage, { scrollTop = 0, id }) {
  if (!storage) return false;
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    storage.setItem(CLAVE_SCROLL_ESCRITORIO, String(Number(scrollTop) || 0));
    storage.setItem(CLAVE_SELECCION_ESCRITORIO, String(n));
    return true;
  } catch {
    return false;
  }
}

/**
 * El scroll guardado, o `null` si no hay.
 *
 * `null` y 0 son distintos: `null` es "no se viene de editar" y 0 es "se venía
 * del principio de la lista". La versión anterior ya hacía esa distinción —
 * comparaba contra `null` y no contra falsy— y se conserva.
 */
export function leerScrollEscritorio(storage) {
  if (!storage) return null;
  let crudo = null;
  try {
    crudo = storage.getItem(CLAVE_SCROLL_ESCRITORIO);
  } catch {
    return null;
  }
  if (crudo === null || crudo === undefined) return null;
  const n = Number(crudo);
  return Number.isFinite(n) ? n : null;
}

/** La fila que estaba seleccionada, o `null`. */
export function leerSeleccionEscritorio(storage) {
  if (!storage) return null;
  try {
    const v = storage.getItem(CLAVE_SELECCION_ESCRITORIO);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * La selección con la que arranca la pantalla.
 *
 * La regla es la de antes, tal cual: se conserva la selección SOLO si se viene
 * de editar —o sea, si hay scroll guardado—. En una entrada fresca al módulo se
 * arranca sin selección, aunque la clave de selección haya quedado de una
 * sesión anterior.
 */
export function seleccionInicialEscritorio(storage) {
  if (leerScrollEscritorio(storage) === null) return null;
  return leerSeleccionEscritorio(storage);
}

/** Recuerda qué fila se tocó, para que sobreviva al ir y volver. */
export function recordarSeleccionEscritorio(storage, id) {
  if (!storage) return;
  try {
    storage.setItem(CLAVE_SELECCION_ESCRITORIO, String(id));
  } catch {}
}

/** Se consume el scroll después de usarlo; la selección sobrevive. */
export function consumirScrollEscritorio(storage) {
  if (!storage) return;
  try {
    storage.removeItem(CLAVE_SCROLL_ESCRITORIO);
  } catch {}
}

/** Entrada fresca: no se arrastra la selección de una sesión anterior. */
export function limpiarSeleccionEscritorio(storage) {
  if (!storage) return;
  try {
    storage.removeItem(CLAVE_SELECCION_ESCRITORIO);
  } catch {}
}
