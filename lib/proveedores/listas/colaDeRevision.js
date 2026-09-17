// lib/proveedores/listas/colaDeRevision.js
//
// EN QUÉ ORDEN SE RECORRE LA COLA, Y CUÁL TOCA AHORA.
//
// ── POR QUÉ SALE DE LA RUTA ────────────────────────────────────────────────
//
// Estaban las dos decisiones escritas adentro del endpoint, entre dos consultas
// a Postgres. Eso las vuelve imposibles de ejercer sin base: la única forma de
// comprobar que salir a la mitad y volver retoma donde quedó era abrir la
// pantalla, hacer veinte productos, irse y volver.
//
// Son dos funciones puras sobre listas de números. Acá se pueden ejercer, y la
// ruta queda pidiendo datos y dibujando, que es lo suyo.
//
// ── CÓMO FUNCIONA RETOMAR, QUE NO GUARDA NADA ──────────────────────────────
//
// No hay cursor, ni progreso guardado, ni una columna que diga por dónde iba. La
// COLA ES lo que queda pendiente: una fila resuelta —confirmada, excluida o
// vinculada— deja de cumplir `motivoDeRevision` y sale sola. Entonces "el
// primero de la cola" ES el lugar donde se había quedado, sin que nadie lo
// anote.
//
// Un cursor guardado sería un TERCER dato al lado de los otros dos, y se puede
// desincronizar: apuntaría a una fila que ya se resolvió, o a una que se fue de
// la cola porque alguien la excluyó desde otro lado. Esto no puede.
//
// Módulo puro: sin BD, sin Next.

/**
 * El orden en el que se van a ofrecer las filas.
 *
 * Los salteados van AL FINAL, no afuera: "dejalo para después" es después, no
 * nunca. Si solo quedan salteados, se vuelve a ofrecer el primero — que es lo
 * correcto: no hay nada más para hacer y esa fila sigue sin resolverse.
 *
 * Saltear no se guarda en ningún lado. La lista de salteados viaja en el pedido
 * y se pierde al recargar, que es exactamente lo que Emanuel pidió que
 * signifique.
 *
 * @param {number[]} cola       los ids pendientes, en el orden del archivo
 * @param {number[]} salteados  los que se saltearon en ESTA vuelta
 * @returns {number[]}
 */
export function ordenDeLaCola(cola = [], salteados = []) {
  const aparte = new Set(salteados);
  const primero = cola.filter((id) => !aparte.has(id));
  const despues = cola.filter((id) => aparte.has(id));
  return [...primero, ...despues];
}

/**
 * Cuál se muestra y en qué posición va.
 *
 * `pedido` es el id que la pantalla quiere ver. Si no viene, o si ya no está en
 * la cola —se resolvió, o alguien la excluyó desde otro lado— se cae al primero
 * del orden, y ESA caída es todo el mecanismo de retomar: la pantalla pide
 * `null` al volver y recibe el primero que todavía falta.
 *
 * El índice es 1-based y sobre el orden REAL de recorrido, que es lo que se
 * dibuja como "3 de 70". Calcularlo sobre `cola` daría un número que salta
 * cuando hay salteados.
 *
 * @returns {{ actualId: number|null, indice: number }}
 */
export function posicionActual(orden = [], pedido = null) {
  const actualId = orden.includes(pedido) ? pedido : orden[0] ?? null;
  return { actualId, indice: actualId === null ? 0 : orden.indexOf(actualId) + 1 };
}
