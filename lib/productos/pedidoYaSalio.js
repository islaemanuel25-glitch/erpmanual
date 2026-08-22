// lib/productos/pedidoYaSalio.js
//
// ¿HACE FALTA VOLVER A PEDIR ESTO?
//
// ── EL PROBLEMA QUE RESUELVE ────────────────────────────────────────────────
//
// La pantalla de Productos pedía el listado y los contadores recién cuando
// `useContextoActivo` volvía con la ubicación. Eran dos vueltas en serie donde
// alcanzaba una: **el servidor resuelve la ubicación solo**, de la misma cookie
// que ese hook va a leer.
//
// Sacar la espera es fácil; lo que no es obvio es lo que pasa después. El pedido
// anticipado sale sin `localId` y tarda unos cientos de milisegundos; el contexto
// vuelve en unos pocos. Cuando vuelve, `localId` cambia de 0 a su valor y el
// efecto se dispara otra vez **con el primer pedido todavía en el aire**.
//
// Si lo único que se recuerda son los pedidos ya CONTESTADOS, ahí no hay nada
// guardado y sale un segundo pedido idéntico. Medido en el log del servidor de
// desarrollo: se veían los dos, uno sin `localId` y otro con él. O sea, el
// arreglo de la cascada mal hecho no la quita — la cambia por el doble de
// trabajo de servidor.
//
// ── LA REGLA, Y POR QUÉ ES SEGURA ──────────────────────────────────────────
//
// Se anota el pedido al SALIR, con la ubicación con la que salió:
//
//   · salió CON ubicación  → sirve solo si sigue siendo esa;
//   · salió SIN ubicación  → el servidor la resuelve de la cookie, que es la
//     misma fuente que el contexto. Mientras viaja, ya está contestando por la
//     ubicación correcta, sea cual sea la que llegue.
//
// Lo único que puede desmentir eso es que la cookie cambie entre los dos pedidos
// —alguien cambiando de local en otra pestaña en ese instante—. Por eso, cuando
// la respuesta llega, se guarda PARA QUÉ ubicación contestó: si no coincide con
// la que ahora se conoce, se vuelve a pedir. Es la única rama que puede pedir dos
// veces, y es la que tiene que hacerlo.
//
// Módulo puro, sin React: por eso se puede ejercer en un candado en vez de
// mirarlo y suponer.

/**
 * @param {object|null} pedido  lo anotado al salir, o null si no salió ninguno:
 *   { clave, localIdPedido, localIdRespondido? }
 *   - `clave` identifica QUÉ se pidió (página, orden, filtros, control).
 *   - `localIdPedido` es null si salió sin ubicación explícita.
 *   - `localIdRespondido` falta mientras el pedido está viajando.
 * @param {string} clave        lo que se querría pedir ahora
 * @param {number} localIdActual 0 mientras el contexto no llegó
 * @returns {boolean} true si NO hace falta pedir de nuevo
 */
export function pedidoYaSalio(pedido, clave, localIdActual) {
  if (!pedido || pedido.clave !== clave) return false;

  // Salió por una ubicación concreta: solo vale para esa.
  if (pedido.localIdPedido !== null && pedido.localIdPedido !== undefined) {
    return pedido.localIdPedido === localIdActual;
  }

  // Salió sin ubicación y todavía no volvió: está contestando por la que el
  // servidor resuelva, que es la misma que va a llegar por el contexto.
  if (pedido.localIdRespondido === undefined) return true;

  // Ya volvió. Si todavía no se sabe cuál es la ubicación, lo que contestó es lo
  // único que hay y vale. Si se sabe, tiene que coincidir.
  if (!localIdActual) return true;
  return pedido.localIdRespondido === localIdActual;
}
