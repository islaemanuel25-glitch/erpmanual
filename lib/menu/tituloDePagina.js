// ============================================================
// lib/menu/tituloDePagina.js
//
// QUÉ TÍTULO GANA, COMO FUNCIÓN PURA.
//
// `usePageTitle` tenía la prioridad escrita adentro del hook, en cuatro `if`
// seguidos. Eso no se puede ejercer sin React ni sin `usePathname`, así que la
// única forma de probarla era abrir la pantalla. Acá queda la decisión sola.
//
// ── POR QUÉ APARECE UN CANDIDATO NUEVO ARRIBA DE TODO ──────────────────────
//
// Hasta ahora el título salía siempre de la RUTA: un override del mapa, o el
// item del menú que matchea por prefijo. Eso alcanza mientras el título de una
// pantalla se pueda escribir de antemano en una tabla.
//
// No alcanza cuando el título es un DATO: "Editar medio de cobro" tiene que
// decir el nombre del medio, y ese nombre lo sabe la pantalla recién después de
// leerlo de la API. Ninguna tabla de rutas puede contener "Efectivo".
//
// Por eso el primer candidato es lo que la pantalla activa REGISTRÓ. Es el mismo
// slot que ya existía para la acción —`AccionDePaginaContext`— y no un mecanismo
// nuevo al lado: la pantalla pone, el shell dibuja, y ni `LayoutBase` ni
// `Header` saben qué pantalla es.
//
// ── SIGUE SIN HABER COMPARACIONES DE RUTA ACÁ ──────────────────────────────
//
// Esta función no ve el pathname. Recibe los candidatos ya resueltos y decide
// cuál gana; quién los calcula es problema del hook.
// ============================================================

/**
 * Un título sirve si es texto y no está vacío.
 *
 * El chequeo por `trim` no es decorativo: un título de un solo espacio dibuja
 * una fila alta y vacía, que se ve como un defecto de maquetado y no como lo
 * que es —un dato que faltaba—. Se cae al candidato siguiente.
 *
 * @param {unknown} valor
 * @returns {boolean}
 */
export function esTituloUtil(valor) {
  return typeof valor === "string" && valor.trim() !== "";
}

/**
 * El título que se dibuja, en orden de prioridad.
 *
 *   1. `registrado` — lo que puso la pantalla activa. Puede ser un dato.
 *   2. `override`   — el mapa de rutas (`legacyTitles`).
 *   3. `delMenu`    — el item del menú que matchea la ruta.
 *   4. `fallback`   — lo que pidió quien llamó.
 *   5. "Panel"      — para que nunca quede una fila sin texto.
 *
 * @param {{registrado?: unknown, override?: unknown, delMenu?: unknown, fallback?: unknown}} [candidatos]
 * @returns {string}
 */
export function resolverTituloDePagina({ registrado, override, delMenu, fallback } = {}) {
  for (const candidato of [registrado, override, delMenu, fallback]) {
    if (esTituloUtil(candidato)) return candidato;
  }
  return "Panel";
}
